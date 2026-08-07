#!/usr/bin/env node
/**
 * Read-only health check for the database-backed configuration.
 *
 *   NODE_ENV=production node scripts/verify-config.js
 *   NODE_ENV=production node scripts/verify-config.js --live   # also calls CHIP/Gmail/OpenAI
 *
 * Writes nothing and sends nothing. --live adds outbound calls, but only read-only ones:
 * it lists CHIP payment methods, fetches the Gmail profile, and lists OpenAI models. No
 * email is sent and no purchase is created.
 *
 * Run this on the server after deploying, to confirm the running process is reading
 * credentials from the database rather than the environment.
 */

require("../envfunc")();

const db = require("../utils/sqlbuilder");
const secretbox = require("../utils/secretbox");
const ConfigService = require("../services/ConfigService");

const LIVE = process.argv.includes("--live");
const env = process.env.NODE_ENV || "development";

const ok = (s) => `  \x1b[32m✓\x1b[0m ${s}`;
const bad = (s) => `  \x1b[31m✗\x1b[0m ${s}`;
const warn = (s) => `  \x1b[33m!\x1b[0m ${s}`;

let failures = 0;
const fail = (s) => { failures++; console.log(bad(s)); };

(async () => {
    console.log(`\n  Configuration health — ${env} (${process.env.DB_DATABASE} @ ${process.env.DB_HOST})\n`);

    // ── 1. Encryption ────────────────────────────────────────────────────────
    console.log("  Encryption");
    if (!secretbox.isConfigured()) {
        fail("CONFIG_ENCRYPTION_KEY missing or invalid — stored credentials cannot be read");
    } else {
        const probe = "verify-" + Date.now();
        try {
            if (secretbox.decrypt(secretbox.encrypt(probe)) === probe) console.log(ok("key present, encrypt/decrypt round-trips"));
            else fail("round-trip mismatch");
        } catch (e) {
            fail(`round-trip failed: ${e.message}`);
        }
    }

    // ── 2. Schema ────────────────────────────────────────────────────────────
    console.log("\n  Schema");
    const tables = await db.raw(
        `SELECT table_name AS t FROM information_schema.tables
          WHERE table_schema = DATABASE() AND table_name IN ('system_config','system_config_audit')`
    );
    const names = tables.map((r) => r.t || r.TABLE_NAME);
    for (const t of ["system_config", "system_config_audit"]) {
        names.includes(t) ? console.log(ok(`${t} exists`)) : fail(`${t} is missing — migration 020 not applied`);
    }
    if (failures) {
        console.log("\n  Stopping: fix the above before continuing.\n");
        process.exit(1);
    }

    // ── 3. Stored values ─────────────────────────────────────────────────────
    console.log("\n  Stored credentials");
    const rows = await db.raw(
        `SELECT config_group, config_key, is_secret, is_required, config_value
           FROM system_config WHERE status='Active' ORDER BY config_group, sort_order`
    );

    let unsetRequired = 0;
    for (const r of rows) {
        const set = r.config_value !== null && r.config_value !== "";
        const label = `${r.config_group}.${r.config_key}`;

        if (!set) {
            const envFallback = process.env[r.config_key];
            if (r.is_required && !envFallback) { fail(`${label} — not set, and no environment fallback`); unsetRequired++; }
            else if (r.is_required) console.log(warn(`${label} — not set; falling back to the environment`));
            else console.log(warn(`${label} — not set (optional)`));
            continue;
        }

        if (r.is_secret) {
            if (!secretbox.isEncrypted(r.config_value)) { fail(`${label} — stored in PLAINTEXT`); continue; }
            try {
                console.log(ok(`${label} = ${secretbox.mask(secretbox.decrypt(r.config_value))}`));
            } catch (e) {
                fail(`${label} — cannot decrypt (wrong CONFIG_ENCRYPTION_KEY for this database?)`);
            }
        } else {
            console.log(ok(`${label} = ${String(r.config_value).split("\n")[0].slice(0, 52)}`));
        }
    }

    // ── 4. Propagation ───────────────────────────────────────────────────────
    console.log("\n  Hot reload");
    ConfigService.init();
    await new Promise((r) => setTimeout(r, 1500));
    const status = ConfigService.status();

    if (status.redis_connected) console.log(ok(`Redis subscribed on ${status.channel} — saves reach every worker instantly`));
    else console.log(warn(`Redis not connected — saves reach other workers within ${Math.round(status.cache_ttl_ms / 1000)}s instead of instantly`));

    // ── 5. What the services actually resolve ────────────────────────────────
    console.log("\n  Resolved by the services");
    const chip = await require("../services/ChipPaymentService").getConfig();
    const mail = await require("../services/MailService").getConfig();
    const openaiKey = await ConfigService.get("openai", "OPENAI_API_KEY");

    console.log(`    CHIP  brand=${chip.brandId || "(none)"} key=${secretbox.mask(chip.apiKey) || "(none)"} callback=${chip.callbackUrl || "(none)"}`);
    console.log(`    Gmail user=${mail.user} secret=${secretbox.mask(mail.clientSecret) || "(none)"}`);
    console.log(`    OpenAI key=${secretbox.mask(openaiKey) || "(none)"}`);

    // ── 6. Live calls ────────────────────────────────────────────────────────
    if (LIVE) {
        console.log("\n  Live connection tests (read-only)");
        const axios = require("axios");

        try {
            const r = await axios.get((chip.baseUrl || "") + "/payment_methods/", {
                headers: { Authorization: `Bearer ${chip.apiKey}` },
                params: { brand_id: chip.brandId, currency: "MYR" },
                timeout: 15000,
            });
            console.log(ok(`CHIP authenticated (${(r.data?.available_payment_methods || []).length} payment methods)`));
        } catch (e) {
            fail(`CHIP: ${e.response?.status === 401 ? "key rejected" : e.message}`);
        }

        try {
            const { google } = require("googleapis");
            const c = new google.auth.OAuth2(mail.clientId, mail.clientSecret);
            c.setCredentials({ refresh_token: mail.refreshToken });
            const p = await google.gmail({ version: "v1", auth: c }).users.getProfile({ userId: "me" });
            console.log(ok(`Gmail authenticated as ${p.data.emailAddress}`));
        } catch (e) {
            fail(`Gmail: ${e.errors?.[0]?.message || e.message}`);
        }

        try {
            const r = await axios.get("https://api.openai.com/v1/models", {
                headers: { Authorization: `Bearer ${openaiKey}` },
                timeout: 15000,
            });
            console.log(ok(`OpenAI authenticated (${(r.data?.data || []).length} models)`));
        } catch (e) {
            fail(`OpenAI: ${e.response?.status === 401 ? "key rejected" : e.message}`);
        }
    } else {
        console.log("\n  (pass --live to also call CHIP, Gmail and OpenAI)");
    }

    console.log(failures ? `\n  ${failures} problem(s) found.\n` : "\n  All checks passed.\n");
    await ConfigService.shutdown();
    process.exit(failures ? 1 : 0);
})().catch((e) => {
    console.error("\n  Verification failed:", e.message, "\n");
    process.exit(1);
});
