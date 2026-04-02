/**
 * AppModel/BillingTransaction.js
 *
 * Mobile app-facing billing transaction queries.
 * All queries are scoped to the authenticated user's account_id.
 */

const db = require('../../utils/sqlbuilder')

const TXN_COLS = `
    t.txn_id, t.txn_ref,
    t.bill_id, t.account_id,
    t.bill_year, t.bill_month,
    t.payment_gateway, t.payment_method, t.bank_name,
    t.amount, t.currency, t.status,
    t.gateway_event_type, t.gateway_status_raw,
    t.paid_at, t.failed_at, t.refunded_at,
    t.failure_reason, t.is_test,
    t.created_at,
    b.bill_no, b.invoice_no, b.bill_type, b.bill_description,
    b.billing_year, b.billing_month,
    b.subtotal, b.sst_amount, b.total_amount AS bill_total,
    pkg.package_name, pkg.package_code
`

/* ─────────────────────────────────────────────────────────────
   1. LIST TRANSACTIONS  (paginated)
──────────────────────────────────────────────────────────────── */
async function AppGetTransactionsList(accountId, params = {}) {
    const page   = Math.max(1, parseInt(params.page)  || 1)
    const limit  = Math.min(50, parseInt(params.limit) || 10)
    const offset = (page - 1) * limit

    const { status = '', year = '', bill_id = '' } = params

    const where  = ['t.account_id = ?']
    const values = [accountId]

    if (status  && status  !== 'All') { where.push('t.status = ?');     values.push(status) }
    if (year)                         { where.push('t.bill_year = ?');   values.push(year) }
    if (bill_id)                      { where.push('t.bill_id = ?');     values.push(bill_id) }

    const clause = `WHERE ${where.join(' AND ')}`

    try {
        // ── Year tabs ──
        const yearTabs = await db.raw(`
            SELECT bill_year AS billing_year, COUNT(*) AS count
            FROM billing_transaction
            WHERE account_id = ?
            GROUP BY bill_year
            ORDER BY bill_year DESC
        `, [accountId])

        // ── Total count ──
        const [{ c: total }] = await db.raw(`
            SELECT COUNT(*) AS c
            FROM billing_transaction t
            LEFT JOIN bill b           ON b.bill_id          = t.bill_id
            LEFT JOIN account_subscription s   ON s.subscription_id = b.subscription_id
            LEFT JOIN subscription_package pkg ON pkg.sub_package_id = COALESCE(b.sub_package_id, s.sub_package_id)
            ${clause}
        `, values)

        // ── Rows ──
        const rows = await db.raw(`
            SELECT ${TXN_COLS}
            FROM billing_transaction t
            LEFT JOIN bill b           ON b.bill_id          = t.bill_id
            LEFT JOIN account_subscription s   ON s.subscription_id = b.subscription_id
            LEFT JOIN subscription_package pkg ON pkg.sub_package_id = COALESCE(b.sub_package_id, s.sub_package_id)
            ${clause}
            ORDER BY t.created_at DESC
            LIMIT ${limit} OFFSET ${offset}
        `, values)

        return {
            status: true,
            data: { yearTabs, rows, total, page, limit, totalPages: Math.ceil(total / limit) }
        }
    } catch (e) {
        console.error('[AppModel/BillingTransaction] List:', e)
        return { status: false, data: null }
    }
}

/* ─────────────────────────────────────────────────────────────
   2. GET TRANSACTION DETAIL
──────────────────────────────────────────────────────────────── */
async function AppGetTransactionDetails(accountId, txnRef) {
    try {
        const rows = await db.raw(`
            SELECT ${TXN_COLS}
            FROM billing_transaction t
            LEFT JOIN bill b           ON b.bill_id          = t.bill_id
            LEFT JOIN account_subscription s   ON s.subscription_id = b.subscription_id
            LEFT JOIN subscription_package pkg ON pkg.sub_package_id = COALESCE(b.sub_package_id, s.sub_package_id)
            WHERE t.txn_ref = ? AND t.account_id = ?
            LIMIT 1
        `, [txnRef, accountId])

        if (!rows.length) return { status: false, data: null }

        return { status: true, data: rows[0] }
    } catch (e) {
        console.error('[AppModel/BillingTransaction] Details:', e)
        return { status: false, data: null }
    }
}

module.exports = {
    AppGetTransactionsList,
    AppGetTransactionDetails,
}
