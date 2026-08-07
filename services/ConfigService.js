/**
 * Runtime configuration, sourced from the database.
 *
 * Credentials used to live in env.yaml, which meant rotating a key required a deploy.
 * They now live in `system_config`, encrypted at rest, and are read through this service.
 *
 * Two problems this has to solve:
 *
 * 1. Reading from MySQL on every CHIP call or every outbound email would be wasteful, so
 *    each process keeps an in-memory cache with a short TTL.
 *
 * 2. Production runs PM2 in cluster mode, so there are several processes. A cache in one
 *    of them is invisible to the others — an admin saving a new key would see it take
 *    effect on roughly one request in N until every TTL happened to expire. Redis pub/sub
 *    fixes that: the writer publishes an invalidation, every process drops the affected
 *    group immediately, and the next read repopulates. That is what makes the change
 *    take effect without a restart.
 *
 * The TTL is still there as a backstop for the case where Redis is unavailable.
 */

const Redis = require("ioredis");
const db = require("../utils/sqlbuilder");
const secretbox = require("../utils/secretbox");

const CACHE_TTL_MS = parseInt(process.env.CONFIG_CACHE_TTL_MS || "60000", 10); // 1 minute
const CHANNEL = `${process.env.NODE_ENV || "development"}:config:invalidate`;

/** group -> { values: {key: plaintext}, expiresAt: number } */
const cache = new Map();

let subscriber = null;
let publisher = null;
let redisReady = false;

function redisOptions() {
    return {
        host: process.env.REDIS_HOST || "127.0.0.1",
        port: parseInt(process.env.REDIS_PORT, 10) || 6379,
        password: process.env.REDIS_PASSWORD || undefined,
        // Do not let a Redis outage take the API down — fall back to TTL-only caching.
        maxRetriesPerRequest: 2,
        enableOfflineQueue: false,
        retryStrategy: (times) => Math.min(times * 500, 5000),
    };
}

/**
 * Starts listening for invalidation messages. Safe to call more than once.
 * Called from server.js at boot.
 */
function init() {
    if (subscriber) return;

    try {
        subscriber = new Redis(redisOptions());
        publisher = new Redis(redisOptions());

        // SUBSCRIBE must wait for the connection to be ready. Issuing it immediately
        // fails with "Stream isn't writeable" because enableOfflineQueue is off, and the
        // process then silently never receives invalidations.
        //
        // Re-running it on every 'ready' also covers reconnects after a Redis restart.
        subscriber.on("ready", () => {
            subscriber.subscribe(CHANNEL, (err) => {
                if (err) {
                    console.error("[ConfigService] Failed to subscribe:", err.message);
                    return;
                }
                redisReady = true;
                console.log(`[ConfigService] Subscribed to ${CHANNEL} for cache invalidation`);
            });
        });

        // Log once rather than on every retry, otherwise a Redis outage floods the logs.
        subscriber.on("error", (err) => {
            if (redisReady) {
                console.error("[ConfigService] Redis subscriber error:", err.message);
                redisReady = false;
            }
        });
        publisher.on("error", () => { /* handled above */ });

        subscriber.on("message", (channel, message) => {
            if (channel !== CHANNEL) return;
            try {
                const { group } = JSON.parse(message);
                if (group) {
                    cache.delete(group);
                    console.log(`[ConfigService] Cache invalidated for group '${group}'`);
                } else {
                    cache.clear();
                    console.log("[ConfigService] Cache invalidated for all groups");
                }
            } catch (e) {
                cache.clear();
            }
        });
    } catch (e) {
        console.error("[ConfigService] Redis unavailable, falling back to TTL-only cache:", e.message);
    }
}

/** Reads one group from the database and decrypts its secrets. */
async function loadGroup(group) {
    const rows = await db.raw(
        `SELECT config_key, config_value, is_secret
           FROM system_config
          WHERE config_group = ? AND status = 'Active'`,
        [group]
    );

    const values = {};
    for (const row of rows) {
        if (row.config_value === null || row.config_value === "") {
            values[row.config_key] = null;
            continue;
        }

        if (!row.is_secret) {
            values[row.config_key] = row.config_value;
            continue;
        }

        try {
            values[row.config_key] = secretbox.decrypt(row.config_value);
        } catch (e) {
            // A value we cannot decrypt is a real problem — usually a rotated or missing
            // CONFIG_ENCRYPTION_KEY. Surface it loudly and treat the value as absent
            // rather than handing a garbled secret to a payment gateway.
            console.error(
                `[ConfigService] Cannot decrypt ${group}.${row.config_key}: ${e.message}`
            );
            values[row.config_key] = null;
        }
    }

    return values;
}

/**
 * Returns every value in a group as a plain object, e.g.
 *   await getGroup('chip') -> { CHIP_API_KEY: '...', CHIP_BRAND_ID: '...' }
 *
 * Falls back to process.env for any key still missing from the database, so the switch
 * over can happen without a flag day — anything not yet seeded keeps working.
 */
async function getGroup(group, { fresh = false } = {}) {
    const cached = cache.get(group);
    if (!fresh && cached && cached.expiresAt > Date.now()) {
        return cached.values;
    }

    let values;
    try {
        values = await loadGroup(group);
    } catch (e) {
        console.error(`[ConfigService] Failed to load group '${group}':`, e.message);
        // Serve stale rather than failing the request outright — an expired cache is far
        // better than a payment that cannot be created because MySQL blipped.
        if (cached) return cached.values;
        values = {};
    }

    cache.set(group, { values, expiresAt: Date.now() + CACHE_TTL_MS });
    return values;
}

/** Single value, with an env fallback for keys not yet migrated into the database. */
async function get(group, key, fallback = undefined) {
    const values = await getGroup(group);
    const value = values[key];
    if (value !== null && value !== undefined && value !== "") return value;

    const fromEnv = process.env[key];
    if (fromEnv !== undefined && fromEnv !== "") return fromEnv;

    return fallback;
}

/**
 * Drops the cache for a group in EVERY process.
 *
 * Local deletion happens first so the writing process is correct even when Redis is down;
 * the publish is what reaches the other cluster workers.
 */
async function invalidate(group = null) {
    if (group) cache.delete(group);
    else cache.clear();

    if (!publisher) return { published: false, reason: "Redis not initialised" };

    try {
        await publisher.publish(CHANNEL, JSON.stringify({ group, at: Date.now() }));
        return { published: true };
    } catch (e) {
        console.error("[ConfigService] Failed to publish invalidation:", e.message);
        return { published: false, reason: e.message };
    }
}

/** Diagnostics for the admin screen: is hot reload actually working right now? */
function status() {
    return {
        redis_connected: redisReady,
        channel: CHANNEL,
        cache_ttl_ms: CACHE_TTL_MS,
        encryption_configured: secretbox.isConfigured(),
        cached_groups: [...cache.keys()],
    };
}

async function shutdown() {
    await Promise.allSettled([subscriber?.quit(), publisher?.quit()]);
    subscriber = null;
    publisher = null;
}

module.exports = {
    init,
    get,
    getGroup,
    invalidate,
    status,
    shutdown,
    CHANNEL,
};
