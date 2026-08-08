#!/usr/bin/env node
/**
 * Re-queues receipt analyses that are stuck in Queued/Processing.
 *
 *   NODE_ENV=production node scripts/requeue-stranded-ai-jobs.js
 *   NODE_ENV=production node scripts/requeue-stranded-ai-jobs.js --write
 *
 * MUST be run on the server: the queue lives in Redis at 127.0.0.1, so running
 * this from a laptop would enqueue into a local Redis that nothing consumes —
 * a silent no-op that looks like it worked.
 *
 * Why rows get stranded: the DB row is marked Queued when the job is added to
 * Redis, so anything that loses the job without touching the row leaves it
 * pending forever. That happened when the queue names gained an environment
 * prefix (`ai-receipt` -> `production:ai-receipt`): every job enqueued under the
 * old name was left in a queue no worker listens on any more. It also happens if
 * the API dies mid-job, since the worker runs in the API process.
 *
 * This re-dispatches those rows onto the queue the worker actually consumes,
 * rebuilding the job payload from the database rather than trusting anything
 * cached. Additive: nothing is deleted, and a row that is genuinely mid-analysis
 * (younger than STALE_AFTER_MINUTES) is left alone.
 *
 * Dry run by default. Nothing is enqueued without --write.
 */

require("../envfunc")();

const db = require("../utils/sqlbuilder");
const ExpensesModel = require("../models/AppModel/Expenses");

const WRITE = process.argv.includes("--write");
const STALE_AFTER_MINUTES = 30;

(async () => {
    const env = process.env.NODE_ENV || "development";
    console.log(`\n  environment : ${env}`);
    console.log(`  database    : ${process.env.DB_DATABASE} @ ${process.env.DB_HOST}`);
    console.log(`  queue       : ${env}:ai-receipt @ ${process.env.REDIS_HOST || "127.0.0.1"}`);
    console.log(`  mode        : ${WRITE ? "WRITE" : "DRY RUN"}\n`);

    const stranded = await db.raw(
        `SELECT expenses_id, account_id, expenses_merchant_name, expenses_date,
                expenses_total_amount, ai_processing_status, last_modified
           FROM account_expenses
          WHERE status = 'Active'
            AND ai_processing_status IN ('Queued','Processing')
            AND last_modified < DATE_SUB(NOW(), INTERVAL ? MINUTE)
          ORDER BY expenses_id`,
        [STALE_AFTER_MINUTES]
    );

    if (!stranded.length) {
        console.log("  Nothing stranded. Done.\n");
        process.exit(0);
    }

    console.log(`  ${stranded.length} stranded expense(s):`);
    for (const r of stranded) {
        const days = Math.round((Date.now() - new Date(r.last_modified).getTime()) / 86400000);
        console.log(
            `    - id=${r.expenses_id} account=${r.account_id} ${r.ai_processing_status}` +
            ` ${days}d  ${String(r.expenses_merchant_name || "").slice(0, 40)}`
        );
    }

    if (!WRITE) {
        console.log("\n  Dry run — nothing was enqueued. Re-run with --write to apply.\n");
        process.exit(0);
    }

    console.log("");
    let ok = 0;
    let failed = 0;

    for (const row of stranded) {
        const itemsResult = await ExpensesModel.getExpenseItems(row.expenses_id);
        const items = (itemsResult.data || []).map((i) => ({
            item_name: i.item_name,
            item_quantity: i.item_quantity,
            item_unit_price: i.item_unit_price,
            item_total_price: i.item_total_price,
        }));

        const dispatched = await ExpensesModel.dispatchAIReceiptAnalysis(
            row.expenses_id,
            row.account_id,
            {
                merchant: row.expenses_merchant_name,
                date: row.expenses_date,
                total_amount: parseFloat(row.expenses_total_amount),
                items,
            }
        );

        if (dispatched.status) {
            // Re-stamp so the row reads as freshly queued, and so a second run of
            // this script does not pick it up while the worker is still on it.
            await db.raw(
                `UPDATE account_expenses
                    SET ai_processing_status = 'Queued', last_modified = NOW()
                  WHERE expenses_id = ?`,
                [row.expenses_id]
            );
            ok++;
            console.log(`    queued  id=${row.expenses_id} (job ${dispatched.job_id})`);
        } else {
            failed++;
            console.error(`    FAILED  id=${row.expenses_id} — could not enqueue`);
        }
    }

    console.log(`\n  re-queued: ${ok}   failed: ${failed}`);
    console.log("  Watch pm2 logs for [AI-Receipt] job completions.\n");

    // The queue holds Redis connections open, so exit explicitly.
    process.exit(failed ? 1 : 0);
})().catch((e) => {
    console.error("\n  Re-queue failed:", e.message, "\n");
    process.exit(1);
});
