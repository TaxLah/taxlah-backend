/**
 * TaxClaimService — the single owner of account_tax_claim.
 *
 * The green "Tax Relief" figure in the app reads account_tax_claim; the per-row
 * badges read account_expenses.expenses_tax_eligible. Historically only one code
 * path (the AI worker) ever wrote claims, and only at one moment — so an expense
 * edited, deleted, re-dated into another year, categorised by NLP instead of AI,
 * or whose worker died mid-job drifted permanently out of the claims table. In
 * development that left 7 accounts showing RM0.00 relief above rows that plainly
 * said otherwise, and one expense pointing at another account's claim row.
 *
 * The invariant this file maintains:
 *
 *   For every (account_id, tax_year, tax_id):
 *     claimed_amount = LEAST(SUM of that account's Active, tax-eligible expenses
 *                            in that category and year), tax_max_claim)
 *
 * recomputeClaim() derives the figure from account_expenses — the source of
 * truth — inside the write statement itself, so concurrent callers cannot
 * interleave into a lost update. Every path that changes an expense's amount,
 * date, category, eligibility or status must call it for each (tax_id, year)
 * pair it touched. It never deletes: a claim whose expenses are all gone is
 * recorded as claimed_amount 0, not removed.
 */

const db = require('../utils/sqlbuilder');

/**
 * The eligible total for one (account, category, year), computed in SQL.
 *
 * Filters on expenses_year (indexed, and what the app filters by) rather than
 * YEAR(expenses_date), and deliberately does NOT filter on ai_processing_status:
 * the old worker query did, which silently excluded every NLP-categorised
 * expense (status 'None') from the total forever.
 */
const ELIGIBLE_SUM_SQL = `
    SELECT LEAST(COALESCE(SUM(expenses_total_amount), 0), ?)
      FROM account_expenses
     WHERE account_id = ?
       AND expenses_tax_category = ?
       AND expenses_tax_eligible = 'Yes'
       AND expenses_year = ?
       AND status = 'Active'`;

/**
 * Recomputes one claim row from its expenses and upserts it.
 *
 * Returns { claim_id, claimed_amount } — claim_id is the touched row's real PK
 * on both branches (LAST_INSERT_ID(claim_id) on the update branch), so callers
 * can safely stamp it onto expenses.
 */
async function recomputeClaim(account_id, tax_id, tax_year) {
    if (!account_id || !tax_id || !tax_year) {
        return { status: false, message: 'account_id, tax_id and tax_year are all required' };
    }

    try {
        const taxRow = await db.raw(
            `SELECT tax_max_claim, tax_requires_receipt, tax_is_auto_claim
               FROM tax_category WHERE tax_id = ? LIMIT 1`,
            [tax_id]
        );
        if (!taxRow.length) {
            return { status: false, message: `tax_id ${tax_id} does not exist` };
        }

        /**
         * Reliefs that are not earned by receipts are left alone.
         *
         * Individual relief, spouse and child relief are statutory or declared by
         * the user — addAutoClaimReliefs() writes them and no expense ever backs
         * them. Deriving them from account_expenses therefore computes 0 and wipes
         * a legitimate entitlement: on production that is RM1.77m across 216
         * accounts, RM9,000 of individual relief at a time.
         *
         * The guard lives here rather than in any one caller because every path
         * that touches an expense recomputes its category — so a user editing or
         * deleting an expense that happens to sit in one of these categories would
         * otherwise destroy their own relief.
         */
        const derivedFromReceipts =
            taxRow[0].tax_requires_receipt === 'Yes' && taxRow[0].tax_is_auto_claim === 'No';
        if (!derivedFromReceipts) {
            return {
                status: true,
                skipped: true,
                message: `tax_id ${tax_id} is not receipt-derived; claim left untouched`,
            };
        }

        const maxClaim = parseFloat(taxRow[0].tax_max_claim) || 0;

        const sumArgs = [maxClaim, account_id, tax_id, tax_year];

        const upsert = await db.raw(
            `INSERT INTO account_tax_claim
                (account_id, tax_year, tax_id, taxsub_id, dependant_id, claimed_amount,
                 max_claimable, claim_for, claim_status, status)
             VALUES
                (?, ?, ?, NULL, NULL, (${ELIGIBLE_SUM_SQL}), ?, 'Self', 'Draft', 'Active')
             ON DUPLICATE KEY UPDATE
                claim_id       = LAST_INSERT_ID(claim_id),
                claimed_amount = (${ELIGIBLE_SUM_SQL}),
                max_claimable  = VALUES(max_claimable),
                status         = 'Active',
                last_modified  = NOW()`,
            [
                account_id, tax_year, tax_id,
                ...sumArgs,          // VALUES branch subquery
                maxClaim,
                ...sumArgs           // UPDATE branch subquery
            ]
        );

        const claim_id = upsert.insertId;

        // Stamp the claim onto every expense it covers, and only those. The stamp is
        // scoped by account_id, which is what prevents the cross-account pointer this
        // table was found holding.
        await db.raw(
            `UPDATE account_expenses
                SET claim_id = ?
              WHERE account_id = ?
                AND expenses_tax_category = ?
                AND expenses_year = ?
                AND expenses_tax_eligible = 'Yes'
                AND status = 'Active'
                AND (claim_id IS NULL OR claim_id <> ?)`,
            [claim_id, account_id, tax_id, tax_year, claim_id]
        );

        const row = await db.raw(
            `SELECT claimed_amount FROM account_tax_claim WHERE claim_id = ? LIMIT 1`,
            [claim_id]
        );

        return {
            status: true,
            claim_id,
            claimed_amount: parseFloat(row[0]?.claimed_amount) || 0
        };
    } catch (error) {
        console.error('[TaxClaimService] recomputeClaim failed:', {
            account_id, tax_id, tax_year, error: error.message
        });
        return { status: false, message: error.message };
    }
}

/**
 * Recomputes every (tax_id, year) pair the account has ever had an eligible or
 * claimed expense in — including pairs whose expenses are now gone, so stale
 * claims get zeroed rather than left standing.
 */
async function recomputeAccount(account_id) {
    try {
        const pairs = await db.raw(
            `SELECT DISTINCT expenses_tax_category AS tax_id, expenses_year AS tax_year
               FROM account_expenses
              WHERE account_id = ? AND expenses_tax_category IS NOT NULL
              UNION
             SELECT DISTINCT tax_id, tax_year
               FROM account_tax_claim
              WHERE account_id = ? AND status = 'Active'`,
            [account_id, account_id]
        );

        const results = [];
        for (const p of pairs) {
            results.push({ ...p, ...(await recomputeClaim(account_id, p.tax_id, p.tax_year)) });
        }
        return { status: true, pairs: results };
    } catch (error) {
        console.error('[TaxClaimService] recomputeAccount failed:', account_id, error.message);
        return { status: false, message: error.message };
    }
}

module.exports = { recomputeClaim, recomputeAccount };
