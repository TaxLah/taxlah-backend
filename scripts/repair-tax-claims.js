#!/usr/bin/env node
/**
 * Collapses duplicate account_tax_claim rows and installs the unique key that stops
 * them coming back.
 *
 *   NODE_ENV=development node scripts/repair-tax-claims.js            # dry run
 *   NODE_ENV=development node scripts/repair-tax-claims.js --write
 *
 * Background: the worker's ON DUPLICATE KEY UPDATE never fired, because the intended
 * unique key includes taxsub_id and dependant_id and both are written as NULL — and
 * MySQL treats every NULL in a unique index as distinct. Every tax-eligible receipt
 * therefore inserted a new row holding the running total at that moment, so summing a
 * user's claims multiplies their relief.
 *
 * What this does per duplicate group (account_id, tax_year, tax_id, taxsub_key,
 * dependant_key):
 *
 *   1. Keeps the lowest claim_id as the survivor.
 *   2. Recomputes its claimed_amount from account_expenses — the same source of truth
 *      the worker itself derives from — capped at max_claimable.
 *   3. Marks the other rows status='Inactive'. NOTHING IS DELETED. Every query that
 *      reads claimed_amount filters status='Active', so this removes them from all
 *      totals while keeping the history.
 *   4. Repoints account_expenses.claim_id from the retired rows to the survivor.
 *
 * Then, once no duplicates remain, it adds UNIQUE KEY unique_claim_v2 over the
 * generated columns from migration 021, so a repeat is impossible rather than merely
 * unlikely.
 *
 * The data changes run in one transaction and are committed before any DDL — MySQL
 * implicitly commits on ALTER TABLE, so an index creation inside the transaction would
 * silently end it and make the rollback a no-op.
 */

require("../envfunc")();

const mysql = require("mysql2/promise");

const WRITE = process.argv.includes("--write");
const env = process.env.NODE_ENV || "development";

const money = (n) => Number(n || 0).toFixed(2);

(async () => {
    const conn = await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USERNAME,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_DATABASE,
        connectTimeout: 15000,
    });

    console.log(`\n  environment : ${env} (${process.env.DB_DATABASE} @ ${process.env.DB_HOST})`);
    console.log(`  mode        : ${WRITE ? "WRITE" : "DRY RUN"}\n`);

    // ── Preconditions ────────────────────────────────────────────────────────
    const [cols] = await conn.query(
        `SELECT COLUMN_NAME FROM information_schema.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'account_tax_claim'
            AND COLUMN_NAME IN ('taxsub_key','dependant_key','active_key')`
    );
    if (cols.length !== 3) {
        console.error("  Migrations 021 and 022 must both be applied here " +
                      "(need taxsub_key, dependant_key, active_key).\n");
        process.exit(1);
    }
    console.log("  generated key columns present  ✓");

    // ── Find duplicate groups ────────────────────────────────────────────────
    const [groups] = await conn.query(
        `SELECT account_id, tax_year, tax_id, taxsub_key, dependant_key,
                COUNT(*) AS copies, MIN(claim_id) AS keep_id,
                SUM(claimed_amount) AS summed_now, MAX(max_claimable) AS cap
           FROM account_tax_claim
          WHERE status = 'Active'
          GROUP BY account_id, tax_year, tax_id, taxsub_key, dependant_key
         HAVING COUNT(*) > 1
          ORDER BY copies DESC`
    );

    if (!groups.length) {
        console.log("  no duplicate groups found");
    } else {
        const dupRows = groups.reduce((s, g) => s + (g.copies - 1), 0);
        const accounts = new Set(groups.map((g) => g.account_id)).size;
        console.log(`  duplicate groups               : ${groups.length}`);
        console.log(`  rows to retire                 : ${dupRows}`);
        console.log(`  accounts affected              : ${accounts}\n`);
    }

    if (WRITE) await conn.beginTransaction();

    let retired = 0;
    let repointed = 0;
    let amountChanged = 0;
    const samples = [];

    try {
        for (const g of groups) {
            // Truth = eligible completed expenses for this account/category/year, capped.
            // Mirrors the worker's own calculation.
            const [[sum]] = await conn.query(
                `SELECT COALESCE(SUM(expenses_total_amount), 0) AS total
                   FROM account_expenses
                  WHERE account_id = ? AND expenses_tax_category = ?
                    AND expenses_tax_eligible = 'Yes'
                    AND YEAR(expenses_date) = ?
                    AND ai_processing_status = 'Completed'`,
                [g.account_id, g.tax_id, g.tax_year]
            );

            const truth = Math.min(Number(sum.total), Number(g.cap));

            const [[before]] = await conn.query(
                `SELECT claimed_amount FROM account_tax_claim WHERE claim_id = ?`,
                [g.keep_id]
            );

            const [victims] = await conn.query(
                `SELECT claim_id FROM account_tax_claim
                  WHERE status='Active' AND account_id=? AND tax_year=? AND tax_id=?
                    AND taxsub_key=? AND dependant_key=? AND claim_id <> ?`,
                [g.account_id, g.tax_year, g.tax_id, g.taxsub_key, g.dependant_key, g.keep_id]
            );
            const victimIds = victims.map((v) => v.claim_id);

            if (samples.length < 8) {
                samples.push(
                    `    acct ${String(g.account_id).padEnd(6)}cat ${String(g.tax_id).padEnd(4)}` +
                    `${String(g.copies).padStart(3)} rows  summed RM ${money(g.summed_now).padStart(11)}` +
                    `  ->  kept RM ${money(truth).padStart(10)}` +
                    (Math.abs(Number(before.claimed_amount) - truth) > 0.005 ? "  (survivor amount corrected)" : "")
                );
            }

            if (Math.abs(Number(before.claimed_amount) - truth) > 0.005) amountChanged++;

            if (WRITE) {
                await conn.query(
                    `UPDATE account_tax_claim SET claimed_amount = ?, last_modified = NOW() WHERE claim_id = ?`,
                    [truth, g.keep_id]
                );

                if (victimIds.length) {
                    // Repoint the expenses that referenced a row we are about to retire,
                    // so no expense is left pointing at an inactive claim.
                    const [r] = await conn.query(
                        `UPDATE account_expenses SET claim_id = ? WHERE claim_id IN (?)`,
                        [g.keep_id, victimIds]
                    );
                    repointed += r.affectedRows;

                    // Retire, do not delete.
                    await conn.query(
                        `UPDATE account_tax_claim
                            SET status = 'Inactive',
                                verification_notes = CONCAT(COALESCE(verification_notes,''),
                                  ' [merged into claim ', ?, ' on ', NOW(), ' — duplicate created before unique_claim_v2]'),
                                last_modified = NOW()
                          WHERE claim_id IN (?)`,
                        [g.keep_id, victimIds]
                    );
                    retired += victimIds.length;
                }
            } else {
                retired += victimIds.length;
            }
        }

        if (samples.length) {
            console.log("  sample of what changes:");
            samples.forEach((s) => console.log(s));
            console.log("");
        }

        console.log(`  rows retired (marked Inactive)  : ${retired}`);
        console.log(`  expenses repointed              : ${WRITE ? repointed : "(dry run)"}`);
        console.log(`  survivors with corrected amount : ${amountChanged}`);

        // Commit the data changes BEFORE any DDL. MySQL implicitly commits on
        // ALTER TABLE, so an ALTER inside this block would silently end the
        // transaction and make the rollback below a no-op — which is exactly what
        // happened the first time this ran.
        if (WRITE) {
            await conn.commit();
            console.log("\n  data changes committed");
        }

        // ── Install the guard, once the data is clean ────────────────────────
        const [idx] = await conn.query(
            `SELECT INDEX_NAME FROM information_schema.STATISTICS
              WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='account_tax_claim'
                AND INDEX_NAME='unique_claim_v2' LIMIT 1`
        );

        if (idx.length) {
            console.log(`  unique_claim_v2                 : already present`);
        } else if (WRITE) {
            await conn.query(
                `ALTER TABLE account_tax_claim
                   ADD UNIQUE KEY unique_claim_v2
                   (account_id, tax_year, tax_id, taxsub_key, dependant_key, active_key)`
            );
            console.log(`  unique_claim_v2                 : created — duplicates now impossible`);
        } else {
            console.log(`  unique_claim_v2                 : would be created after the merge`);
        }

        if (!WRITE) {
            console.log("\n  Dry run — nothing changed. Re-run with --write to apply.");
        }
    } catch (e) {
        // Only meaningful if we failed before the commit above; DDL failures after it
        // leave the data changes in place, which is safe — they are correct either way.
        if (WRITE) await conn.rollback().catch(() => {});
        console.error("\n  FAILED:", e.message, "\n");
        await conn.end();
        process.exit(1);
    }

    // ── Verify ───────────────────────────────────────────────────────────────
    const [[after]] = await conn.query(
        `SELECT COUNT(*) AS active FROM account_tax_claim WHERE status='Active'`
    );
    const [[distinct]] = await conn.query(
        `SELECT COUNT(*) AS n FROM (
            SELECT 1 FROM account_tax_claim WHERE status='Active'
            GROUP BY account_id, tax_year, tax_id, taxsub_key, dependant_key) x`
    );
    const [[orphan]] = await conn.query(
        `SELECT COUNT(*) AS n FROM account_expenses e
           JOIN account_tax_claim c ON c.claim_id = e.claim_id
          WHERE c.status <> 'Active'`
    );
    const [[total]] = await conn.query(`SELECT COUNT(*) AS n FROM account_tax_claim`);

    console.log("\n  verification");
    console.log(`    total rows (nothing deleted)  : ${total.n}`);
    console.log(`    active rows                   : ${after.active}`);
    console.log(`    distinct on the new key       : ${distinct.n}`);
    console.log(`    remaining duplicates          : ${after.active - distinct.n}`);
    console.log(`    expenses pointing at inactive : ${orphan.n}\n`);

    await conn.end();
    process.exit(0);
})().catch((e) => {
    console.error("\n  Repair failed:", e.message, "\n");
    process.exit(1);
});
