#!/usr/bin/env node
/**
 * Reconciles account_tax_claim with account_expenses — the source of truth.
 *
 *   NODE_ENV=development node scripts/reconcile-tax-claims.js           # dry run
 *   NODE_ENV=development node scripts/reconcile-tax-claims.js --write   # apply
 *
 * (scripts/repair-tax-claims.js was the earlier, different repair: it collapsed
 * the duplicate rows the broken upsert created. This one heals the drift left by
 * paths that never maintained claims at all.)
 *
 * What drifted, and how — all observed in development data:
 *   - NLP-categorised expenses were marked eligible but no claim was ever
 *     written, so the app's green Tax Relief figure read RM0.00 above rows that
 *     plainly said otherwise (account 1: 4 eligible rows, 0 claims);
 *   - the AI worker marked the expense eligible before writing the claim, so a
 *     failure between the two left the pair permanently inconsistent;
 *   - edits, deletions and category overrides never recomputed claims;
 *   - one expense held a claim_id belonging to a different account.
 *
 * Additive only, per the standing rule that repairs never destroy data:
 *   - recomputes/upserts a claim for every (account, year, category) that has
 *     ever had an eligible expense or an active claim — a stale claim recomputes
 *     to its true figure, including 0; the row is kept, never deleted;
 *   - repoints claim_id on expenses to their own account's claim row;
 *   - clears the impossible state eligible='Yes' with no category, listing every
 *     row it changes.
 */

require('dotenv').config();
require('../envfunc')();

const db = require('../utils/sqlbuilder');
const { recomputeClaim } = require('../services/TaxClaimService');

const WRITE = process.argv.includes('--write');

(async () => {
    console.log(`\n=== Tax claim reconciliation (${WRITE ? 'WRITE' : 'dry run'}) ===\n`);

    // ── 1. The impossible state: eligible with no category ──
    const impossible = await db.raw(
        `SELECT expenses_id, account_id
           FROM account_expenses
          WHERE expenses_tax_eligible = 'Yes'
            AND expenses_tax_category IS NULL
            AND status = 'Active'`
    );
    console.log(`eligible-with-no-category rows: ${impossible.length}`);
    if (WRITE) {
        for (const row of impossible) {
            await db.raw(
                `UPDATE account_expenses SET expenses_tax_eligible = 'No', last_modified = NOW()
                  WHERE expenses_id = ?`,
                [row.expenses_id]
            );
            console.log(`  cleared eligibility on expenses_id=${row.expenses_id} (account ${row.account_id})`);
        }
    }

    // ── 2. Recompute every (account, year, category) pair ──
    const pairs = await db.raw(
        `SELECT DISTINCT account_id, expenses_year AS tax_year, expenses_tax_category AS tax_id
           FROM account_expenses
          WHERE expenses_tax_category IS NOT NULL
          UNION
         SELECT DISTINCT account_id, tax_year, tax_id
           FROM account_tax_claim
          WHERE status = 'Active'`
    );
    console.log(`(account, year, category) pairs to check: ${pairs.length}`);

    let drift = 0;
    for (const p of pairs) {
        const before = await db.raw(
            `SELECT claimed_amount FROM account_tax_claim
              WHERE account_id = ? AND tax_year = ? AND tax_id = ? AND status = 'Active' LIMIT 1`,
            [p.account_id, p.tax_year, p.tax_id]
        );

        const expected = await db.raw(
            `SELECT LEAST(COALESCE((
                        SELECT SUM(ae.expenses_total_amount)
                          FROM account_expenses ae
                         WHERE ae.account_id = ? AND ae.expenses_tax_category = tc.tax_id
                           AND ae.expenses_year = ? AND ae.expenses_tax_eligible = 'Yes'
                           AND ae.status = 'Active'
                    ), 0), tc.tax_max_claim) AS expected
               FROM tax_category tc
              WHERE tc.tax_id = ?`,
            [p.account_id, p.tax_year, p.tax_id]
        );

        const current = before.length ? parseFloat(before[0].claimed_amount) : null;
        const target = expected.length ? parseFloat(expected[0].expected) : 0;

        if (current === null || Math.abs(current - target) > 0.005) {
            drift++;
            console.log(`  account ${p.account_id} year ${p.tax_year} tax ${p.tax_id}: ${current === null ? '(no claim)' : current} -> ${target}`);
            if (WRITE) {
                const r = await recomputeClaim(p.account_id, p.tax_id, p.tax_year);
                if (!r.status) console.error(`    RECOMPUTE FAILED: ${r.message}`);
            }
        }
    }
    console.log(`pairs with drift: ${drift}`);

    // ── 3. claim_id pointers referencing another account's claim ──
    const crossed = await db.raw(
        `SELECT ae.expenses_id, ae.account_id AS expense_account, atc.account_id AS claim_account
           FROM account_expenses ae
           JOIN account_tax_claim atc ON atc.claim_id = ae.claim_id
          WHERE ae.claim_id IS NOT NULL AND atc.account_id <> ae.account_id`
    );
    console.log(`cross-account claim pointers: ${crossed.length}`);
    // Step 2's recompute restamps claim_id for eligible rows; whatever remains crossed
    // after that points from non-eligible rows and is cleared to NULL.
    if (WRITE) {
        for (const c of crossed) {
            const still = await db.raw(
                `SELECT atc.account_id FROM account_expenses ae
                  JOIN account_tax_claim atc ON atc.claim_id = ae.claim_id
                 WHERE ae.expenses_id = ?`,
                [c.expenses_id]
            );
            if (still.length && still[0].account_id !== c.expense_account) {
                await db.raw(`UPDATE account_expenses SET claim_id = NULL WHERE expenses_id = ?`, [c.expenses_id]);
                console.log(`  cleared foreign claim pointer on expenses_id=${c.expenses_id}`);
            }
        }
    }

    // ── 4. After-state ──
    const after = await db.raw(
        `SELECT COUNT(*) AS mismatched
           FROM account_expenses ae
           LEFT JOIN account_tax_claim atc
             ON atc.account_id = ae.account_id AND atc.tax_year = ae.expenses_year
            AND atc.tax_id = ae.expenses_tax_category AND atc.status = 'Active'
          WHERE ae.expenses_tax_eligible = 'Yes' AND ae.status = 'Active'
            AND ae.expenses_tax_category IS NOT NULL
            AND atc.claim_id IS NULL`
    );
    console.log(`\neligible expenses with no active claim after ${WRITE ? 'repair' : 'dry run'}: ${after[0].mismatched}`);
    console.log(WRITE ? '\nDone.' : '\nDry run — nothing was written. Re-run with --write to apply.');
    process.exit(0);
})().catch((e) => {
    console.error('Reconciliation failed:', e);
    process.exit(1);
});
