#!/usr/bin/env node
/**
 * Seeds system_config from the values the process is currently running with.
 *
 * Run once per environment after applying DB/020_create_system_config.sql:
 *
 *   NODE_ENV=development node scripts/seed-system-config.js          # dry run
 *   NODE_ENV=development node scripts/seed-system-config.js --write  # apply
 *
 * Secrets are encrypted with utils/secretbox.js before they are written, so plaintext
 * never touches the table. Values already present are left alone unless --overwrite is
 * passed — re-running this must never clobber a credential an admin has since rotated
 * through the portal.
 *
 * Nothing is deleted and no schema is altered; this only fills in NULL values.
 */

require("../envfunc")();

const fs = require("fs");
const path = require("path");
const db = require("../utils/sqlbuilder");
const secretbox = require("../utils/secretbox");

const WRITE = process.argv.includes("--write");
const OVERWRITE = process.argv.includes("--overwrite");

/** Where each key's current value comes from. */
function sourceValues() {
    let chipPem = null;
    try {
        chipPem = fs.readFileSync(path.join(__dirname, "..", "services", "chip.pem"), "utf8").trim();
    } catch (e) {
        /* fall through — the key stays unset and CHIP keeps using the bundled file */
    }

    return {
        CHIP_API_URL: process.env.CHIP_API_URL || "https://gate.chip-in.asia/api/v1",
        CHIP_BRAND_ID: process.env.CHIP_BRAND_ID || null,
        CHIP_API_KEY: process.env.CHIP_API_KEY || null,
        CHIP_WEBHOOK_PUBLIC_KEY: process.env.CHIP_WEBHOOK_PUBLIC_KEY || chipPem,
        CHIP_CALLBACK_URL: process.env.CHIP_CALLBACK_URL || null,

        GMAIL_USER: process.env.GMAIL_USER || "admin@taxlah.com",
        GMAIL_CLIENT_ID: process.env.GMAIL_CLIENT_ID || null,
        GMAIL_CLIENT_SECRET: process.env.GMAIL_CLIENT_SECRET || null,
        GMAIL_REFRESH_TOKEN: process.env.GMAIL_REFRESH_TOKEN || null,

        OPENAI_API_KEY: process.env.OPENAI_API_KEY || null,
    };
}

(async () => {
    console.log(`\n  environment : ${process.env.NODE_ENV || "development"}`);
    console.log(`  database    : ${process.env.DB_DATABASE} @ ${process.env.DB_HOST}`);
    console.log(`  mode        : ${WRITE ? (OVERWRITE ? "WRITE (overwriting existing)" : "WRITE") : "DRY RUN"}\n`);

    if (!secretbox.isConfigured()) {
        console.error("  CONFIG_ENCRYPTION_KEY is not set for this environment. Generate one with:");
        console.error('    node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"');
        console.error("  then add it to env.yaml under this environment and re-run.\n");
        process.exit(1);
    }

    const rows = await db.raw(
        `SELECT config_id, config_group, config_key, is_secret, config_value
           FROM system_config ORDER BY config_group, sort_order`
    );

    if (!rows.length) {
        console.error("  system_config is empty — apply DB/020_create_system_config.sql first.\n");
        process.exit(1);
    }

    const source = sourceValues();
    let written = 0;
    let skipped = 0;
    let missing = 0;

    for (const row of rows) {
        const incoming = source[row.config_key];
        const hasExisting = row.config_value !== null && row.config_value !== "";

        if (hasExisting && !OVERWRITE) {
            console.log(`  skip     ${row.config_group}.${row.config_key} — already set`);
            skipped++;
            continue;
        }

        if (!incoming) {
            console.log(`  MISSING  ${row.config_group}.${row.config_key} — no value in this environment`);
            missing++;
            continue;
        }

        const stored = row.is_secret ? secretbox.encrypt(incoming) : incoming;
        const shown = row.is_secret ? secretbox.mask(incoming) : String(incoming).slice(0, 48);

        if (WRITE) {
            await db.raw(
                `UPDATE system_config SET config_value = ?, last_modified = NOW() WHERE config_id = ?`,
                [stored, row.config_id]
            );
        }

        console.log(
            `  ${WRITE ? "wrote   " : "would   "} ${row.config_group}.${row.config_key} = ${shown}` +
            (row.is_secret ? "  (encrypted)" : "")
        );
        written++;
    }

    console.log(`\n  ${written} value(s) ${WRITE ? "written" : "to write"}, ${skipped} skipped, ${missing} missing`);

    if (!WRITE) {
        console.log("  Dry run — nothing was changed. Re-run with --write to apply.\n");
    } else {
        console.log("  Done. Existing processes pick these up within the config cache TTL,");
        console.log("  or immediately when an admin saves through the portal.\n");
    }

    process.exit(0);
})().catch((e) => {
    console.error("\n  Seed failed:", e.message, "\n");
    process.exit(1);
});
