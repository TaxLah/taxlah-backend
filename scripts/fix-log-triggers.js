#!/usr/bin/env node
/**
 * Repairs the AFTER INSERT audit triggers that copy their whole table.
 *
 *   NODE_ENV=staging node scripts/fix-log-triggers.js
 *   NODE_ENV=staging node scripts/fix-log-triggers.js --write
 *
 * `account_ai` and `auth_access_ai` are both written as:
 *
 *     INSERT INTO <table>_logs SELECT * FROM <table>
 *
 * with no WHERE, so every insert copies the entire table into its log. The cost
 * of a signup therefore grows with the number of users already signed up: at
 * 1,566 accounts, one registration writes ~1,566 log rows per table, and the two
 * log tables have passed 1.2 million rows each. It also makes the log break
 * outright whenever the base table gains a column the log lacks, because
 * `SELECT *` then returns the wrong number of values.
 *
 * The AFTER UPDATE triggers on the same tables are already written correctly —
 * an explicit column list with NEW values — so this rewrites the INSERT triggers
 * into that same shape, which is what they were meant to be.
 *
 * This is a repair script rather than a migration because it must DROP the old
 * trigger, and scripts/run-migration.js refuses DROP by design: migrations here
 * stay additive. Nothing here touches a row of user data — only trigger
 * definitions. The 1.2M already-written log rows are left alone; pruning them is
 * a separate, explicitly-approved decision.
 *
 * Safety: it refuses to touch a trigger that is not in the known-broken
 * `INSERT INTO ... SELECT * FROM ...` form, so a trigger someone has already
 * fixed by hand is reported and skipped rather than overwritten.
 *
 * Dry run by default. Nothing changes without --write.
 */

require("../envfunc")();

const mysql = require("mysql2/promise");

const WRITE = process.argv.includes("--write");

/** The triggers this script knows how to repair: trigger -> [base table, log table]. */
const TARGETS = [
    { trigger: "account_ai", base: "account", log: "account_logs" },
    { trigger: "auth_access_ai", base: "auth_access", log: "auth_access_logs" },
];

/** Matches the broken body: INSERT INTO <log> SELECT * FROM <base>, no WHERE. */
function isBrokenWholeTableCopy(statement, base, log) {
    const s = String(statement || "").replace(/\s+/g, " ").trim().toLowerCase();
    const expected = `insert into ${log} select * from ${base}`;
    return s === expected || s === `${expected};`;
}

(async () => {
    const env = process.env.NODE_ENV || "development";
    const target = process.env.DB_DATABASE;

    console.log(`\n  environment : ${env}`);
    console.log(`  database    : ${target} @ ${process.env.DB_HOST}`);
    console.log(`  mode        : ${WRITE ? "WRITE" : "DRY RUN"}\n`);

    const conn = await mysql.createConnection({
        host: process.env.DB_HOST === "localhost" ? "127.0.0.1" : process.env.DB_HOST,
        user: process.env.DB_USERNAME,
        password: process.env.DB_PASSWORD,
        database: target,
        connectTimeout: 10000,
    });

    let repaired = 0;
    let skipped = 0;

    for (const { trigger, base, log } of TARGETS) {
        console.log(`  --- ${trigger} (${base} -> ${log}) ---`);

        const [rows] = await conn.query(
            `SELECT ACTION_STATEMENT AS stmt FROM information_schema.TRIGGERS
              WHERE TRIGGER_SCHEMA = ? AND TRIGGER_NAME = ?`,
            [target, trigger]
        );

        if (!rows.length) {
            console.log(`      no such trigger — skipped\n`);
            skipped++;
            continue;
        }

        if (!isBrokenWholeTableCopy(rows[0].stmt, base, log)) {
            console.log(`      not the known-broken form — leaving it alone:`);
            console.log(`      ${String(rows[0].stmt).replace(/\s+/g, " ").slice(0, 120)}\n`);
            skipped++;
            continue;
        }

        // Log the columns the two tables genuinely share, in the base table's order,
        // so this stays correct in every environment (their schemas differ) and
        // survives future column additions without another hand-written list.
        const [cols] = await conn.query(
            `SELECT b.COLUMN_NAME AS name
               FROM information_schema.COLUMNS b
               JOIN information_schema.COLUMNS l
                 ON l.TABLE_SCHEMA = b.TABLE_SCHEMA
                AND l.TABLE_NAME = ?
                AND l.COLUMN_NAME = b.COLUMN_NAME
              WHERE b.TABLE_SCHEMA = ? AND b.TABLE_NAME = ?
              ORDER BY b.ORDINAL_POSITION`,
            [log, target, base]
        );

        if (!cols.length) {
            console.log(`      no shared columns between ${base} and ${log} — skipped\n`);
            skipped++;
            continue;
        }

        const names = cols.map((c) => c.name);
        const columnList = names.map((n) => `\`${n}\``).join(", ");
        const valueList = names.map((n) => `NEW.\`${n}\``).join(", ");
        const createSql =
            `CREATE TRIGGER \`${trigger}\` AFTER INSERT ON \`${base}\`\n` +
            `FOR EACH ROW\n` +
            `INSERT INTO \`${log}\` (${columnList})\n` +
            `VALUES (${valueList})`;

        console.log(`      logs ${names.length} shared column(s)`);
        console.log(`      replacement:`);
        console.log(
            createSql
                .split("\n")
                .map((l) => `        ${l.length > 150 ? l.slice(0, 150) + "…" : l}`)
                .join("\n")
        );

        if (!WRITE) {
            console.log(`      (dry run — not applied)\n`);
            continue;
        }

        // MySQL cannot swap a trigger atomically, so keep the gap as small as
        // possible and fail loudly if the CREATE does not land: between these two
        // statements, inserts into the base table are not logged.
        await conn.query(`DROP TRIGGER \`${trigger}\``);
        try {
            await conn.query(createSql);
        } catch (e) {
            console.error(
                `\n      CREATE FAILED after the DROP — ${trigger} no longer exists.\n` +
                `      Inserts into ${base} are NOT being logged. Recreate it with:\n\n${createSql};\n`
            );
            throw e;
        }

        const [after] = await conn.query(
            `SELECT ACTION_STATEMENT AS stmt FROM information_schema.TRIGGERS
              WHERE TRIGGER_SCHEMA = ? AND TRIGGER_NAME = ?`,
            [target, trigger]
        );
        console.log(`      applied — trigger present: ${after.length === 1}\n`);
        repaired++;
    }

    console.log(`  repaired: ${repaired}   skipped: ${skipped}`);
    if (!WRITE) console.log(`\n  Dry run — nothing changed. Re-run with --write to apply.`);
    console.log("");

    await conn.end();
    process.exit(0);
})().catch((e) => {
    console.error("\n  Trigger repair failed:", e.message, "\n");
    process.exit(1);
});
