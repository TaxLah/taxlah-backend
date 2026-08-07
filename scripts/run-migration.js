#!/usr/bin/env node
/**
 * Applies a migration from DB/ to the database of the current NODE_ENV.
 *
 *   NODE_ENV=staging node scripts/run-migration.js 020_create_system_config.sql
 *   NODE_ENV=staging node scripts/run-migration.js 020_create_system_config.sql --write
 *
 * Why this exists rather than piping the .sql straight into mysql:
 *
 * 1. All three Taxlah databases live on one server, so a migration that relies on the
 *    connection's default database can land in the wrong one. Each file carries an
 *    explicit `USE <db>;`, and this rewrites that line to match the environment being
 *    targeted — then verifies afterwards that the session really is on that database.
 *
 * 2. It refuses to run anything containing DROP, DELETE or TRUNCATE. Migrations here are
 *    additive only; production holds real user data.
 *
 * Dry run by default. Nothing executes without --write.
 */

require("../envfunc")();

const fs = require("fs");
const path = require("path");
const mysql = require("mysql2/promise");

const file = process.argv[2];
const WRITE = process.argv.includes("--write");

if (!file) {
    console.error("\n  Usage: NODE_ENV=<env> node scripts/run-migration.js <file.sql> [--write]\n");
    process.exit(1);
}

const filePath = path.join(__dirname, "..", "DB", file);
if (!fs.existsSync(filePath)) {
    console.error(`\n  No such migration: DB/${file}\n`);
    process.exit(1);
}

const env = process.env.NODE_ENV || "development";
const target = process.env.DB_DATABASE;

/** Strips comments before scanning, so the word "DROP" in a comment does not trip it. */
function stripComments(sql) {
    return sql.replace(/--.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
}

(async () => {
    let sql = fs.readFileSync(filePath, "utf8");

    console.log(`\n  migration  : DB/${file}`);
    console.log(`  environment: ${env}`);
    console.log(`  database   : ${target} @ ${process.env.DB_HOST}`);
    console.log(`  mode       : ${WRITE ? "WRITE" : "DRY RUN"}\n`);

    // ── Safety gate ──────────────────────────────────────────────────────────
    const destructive = stripComments(sql).match(/\b(DROP|DELETE|TRUNCATE)\b/i);
    if (destructive) {
        console.error(`  REFUSED: this migration contains "${destructive[1]}".`);
        console.error("  Migrations must be additive. Reshape data with a repair script instead.\n");
        process.exit(1);
    }
    console.log("  safety check: no DROP / DELETE / TRUNCATE  ✓");

    // ── Point the USE statement at this environment ──────────────────────────
    const useMatch = sql.match(/^\s*USE\s+`?([A-Za-z0-9_]+)`?\s*;/m);
    if (!useMatch) {
        console.error("\n  REFUSED: the migration has no explicit `USE <database>;` statement.");
        console.error("  Relying on the connection default risks hitting the wrong database.\n");
        process.exit(1);
    }

    if (useMatch[1] !== target) {
        console.log(`  rewriting    : USE ${useMatch[1]} -> USE ${target}`);
        sql = sql.replace(useMatch[0], `USE ${target};`);
    } else {
        console.log(`  USE statement: already ${target}`);
    }

    const statements = stripComments(sql)
        .split(";")
        .map((s) => s.trim())
        .filter(Boolean);
    console.log(`  statements   : ${statements.length}`);
    for (const s of statements) {
        console.log(`    - ${s.split("\n")[0].slice(0, 76)}${s.length > 76 ? "…" : ""}`);
    }

    if (!WRITE) {
        console.log("\n  Dry run — nothing was executed. Re-run with --write to apply.\n");
        process.exit(0);
    }

    const conn = await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USERNAME,
        password: process.env.DB_PASSWORD,
        database: target,
        multipleStatements: true,
        connectTimeout: 10000,
    });

    await conn.query(sql);

    // Confirm we ended up where we intended.
    const [[after]] = await conn.query("SELECT DATABASE() AS db");
    console.log(`\n  applied to   : ${after.db}`);
    if (after.db !== target) {
        console.error(`  WARNING: session ended on ${after.db}, expected ${target}`);
    }

    await conn.end();
    console.log("  done\n");
    process.exit(0);
})().catch((e) => {
    console.error("\n  Migration failed:", e.message, "\n");
    process.exit(1);
});
