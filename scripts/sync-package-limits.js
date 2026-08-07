#!/usr/bin/env node
/**
 * Copies package entitlement values from development to another environment.
 *
 *   NODE_ENV=staging node scripts/sync-package-limits.js           # dry run
 *   NODE_ENV=staging node scripts/sync-package-limits.js --write
 *
 * Only three numeric columns are touched: storage_limit_mb, max_receipts, max_reports.
 *
 * Deliberately NOT synced:
 *   status        — whether a plan is visible to the app is a per-environment decision
 *   price_amount  — production pricing must never be overwritten from development
 *   package_code  — the key live subscriptions match on
 *
 * Rows are matched by package_code. Nothing is inserted or deleted; a package present in
 * development but missing here is reported and skipped.
 */

const path = require("path");
const yenv = require("yenv");
const mysql = require("mysql2/promise");

const WRITE = process.argv.includes("--write");
const target = process.env.NODE_ENV || "development";

if (target === "development") {
    console.error("\n  development is the source. Set NODE_ENV to the environment you want to update.\n");
    process.exit(1);
}

const SYNCED = ["storage_limit_mb", "max_receipts", "max_reports"];

const connect = async (envName) => {
    const e = yenv(path.join(__dirname, "..", "env.yaml"), { env: envName });
    const conn = await mysql.createConnection({
        host: e.DB_HOST,
        user: e.DB_USERNAME,
        password: e.DB_PASSWORD,
        database: e.DB_DATABASE,
        connectTimeout: 10000,
    });
    return { conn, database: e.DB_DATABASE, host: e.DB_HOST };
};

(async () => {
    const src = await connect("development");
    const dst = await connect(target);

    console.log(`\n  source : development (${src.database} @ ${src.host})`);
    console.log(`  target : ${target} (${dst.database} @ ${dst.host})`);
    console.log(`  mode   : ${WRITE ? "WRITE" : "DRY RUN"}\n`);

    const cols = ["package_code", ...SYNCED].join(", ");
    const [srcRows] = await src.conn.query(`SELECT ${cols} FROM subscription_package`);
    const [dstRows] = await dst.conn.query(`SELECT ${cols}, status FROM subscription_package`);
    const dstByCode = new Map(dstRows.map((r) => [r.package_code, r]));

    let changed = 0;
    let missing = 0;

    for (const s of srcRows) {
        const d = dstByCode.get(s.package_code);
        if (!d) {
            console.log(`  SKIP     ${s.package_code} — not present in ${target}`);
            missing++;
            continue;
        }

        const diffs = SYNCED.filter((c) => String(d[c]) !== String(s[c]));
        if (!diffs.length) {
            console.log(`  same     ${s.package_code}`);
            continue;
        }

        const summary = diffs.map((c) => `${c}: ${d[c]} → ${s[c]}`).join(", ");
        console.log(`  ${WRITE ? "update  " : "would   "} ${s.package_code.padEnd(9)} ${summary}   [status ${d.status}, untouched]`);

        if (WRITE) {
            await dst.conn.query(
                `UPDATE subscription_package
                    SET storage_limit_mb = ?, max_receipts = ?, max_reports = ?, last_modified = NOW()
                  WHERE package_code = ?`,
                [s.storage_limit_mb, s.max_receipts, s.max_reports, s.package_code]
            );
        }
        changed++;
    }

    console.log(`\n  ${changed} package(s) ${WRITE ? "updated" : "to update"}${missing ? `, ${missing} missing in target` : ""}`);

    if (WRITE) {
        const [after] = await dst.conn.query(`SELECT ${cols}, status FROM subscription_package ORDER BY sort_order`);
        console.log("\n  Result:");
        for (const r of after) {
            console.log(`    ${r.package_code.padEnd(9)} storage ${String(r.storage_limit_mb).padEnd(6)} receipts ${String(r.max_receipts).padEnd(6)} reports ${String(r.max_reports).padEnd(6)} ${r.status}`);
        }
    } else {
        console.log("  Dry run — nothing changed. Re-run with --write to apply.");
    }

    console.log("");
    await src.conn.end();
    await dst.conn.end();
    process.exit(0);
})().catch((e) => {
    console.error("\n  Sync failed:", e.message, "\n");
    process.exit(1);
});
