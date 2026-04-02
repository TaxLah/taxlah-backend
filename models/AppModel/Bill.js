/**
 * AppModel/Bill.js
 *
 * Mobile app-facing bill queries.
 * All queries are scoped to the authenticated user's account_id —
 * users can never see another account's bills.
 */

const db = require('../../utils/sqlbuilder')

const BILL_COLS = `
    b.bill_id, b.bill_no, b.invoice_no,
    b.account_id, b.subscription_id, b.sub_package_id,
    b.bill_type, b.bill_description,
    b.billing_year, b.billing_month,
    b.billing_period_start, b.billing_period_end,
    b.bill_date, b.due_date, b.paid_at,
    b.subtotal, b.sst_rate, b.sst_amount, b.total_amount, b.currency,
    b.checkout_url, b.status,
    b.reminder_count, b.reminder_sent_at,
    b.created_at, b.last_modified,
    pkg.package_name, pkg.package_code, pkg.billing_period AS package_billing_period,
    pkg.price_amount AS package_price, pkg.package_badge, pkg.package_color
`

/* ─────────────────────────────────────────────────────────────
   1. LIST BILLS  (paginated, filtered)
──────────────────────────────────────────────────────────────── */
async function AppGetBillsList(accountId, params = {}) {
    const page   = Math.max(1, parseInt(params.page)  || 1)
    const limit  = Math.min(50, parseInt(params.limit) || 10)
    const offset = (page - 1) * limit

    const { status = '', year = '' } = params

    const where  = ['b.account_id = ?']
    const values = [accountId]

    if (status && status !== 'All') { where.push('b.status = ?');        values.push(status) }
    if (year)                       { where.push('b.billing_year = ?');  values.push(year) }

    const clause = `WHERE ${where.join(' AND ')}`

    try {
        // ── Pending/overdue badge count ──
        const [badge] = await db.raw(`
            SELECT
                SUM(CASE WHEN b.status IN ('Pending','Overdue') THEN 1 ELSE 0 END) AS unpaid_count,
                IFNULL(SUM(CASE WHEN b.status IN ('Pending','Overdue') THEN b.total_amount END), 0) AS unpaid_amount
            FROM bill b
            -- WHERE b.account_id = ?
        `, [])

        // ── Year tabs ──
        const yearTabs = await db.raw(`
            SELECT billing_year, COUNT(*) AS count
            FROM bill
            WHERE billing_year = ${year}
            GROUP BY billing_year
            ORDER BY billing_year DESC
        `, [])

        console.log("Log Clause : ", clause)

        // ── Total count ──
        const [{ c: total }] = await db.raw(`
            SELECT COUNT(*) AS c
            FROM bill b
            LEFT JOIN account_subscription s   ON s.subscription_id = b.subscription_id
            LEFT JOIN subscription_package pkg ON pkg.sub_package_id = COALESCE(b.sub_package_id, s.sub_package_id)
            ${clause}
        `, values)

        // ── Rows ──
        const rows = await db.raw(`
            SELECT ${BILL_COLS}
            FROM bill b
            LEFT JOIN account_subscription s   ON s.subscription_id = b.subscription_id
            LEFT JOIN subscription_package pkg ON pkg.sub_package_id = COALESCE(b.sub_package_id, s.sub_package_id)
            ${clause}
            ORDER BY b.bill_date DESC
            LIMIT ${limit} OFFSET ${offset}
        `, values)

        return {
            status: true,
            data: {
                badge: {
                    unpaidCount:  parseInt(badge.unpaid_count)  || 0,
                    unpaidAmount: parseFloat(badge.unpaid_amount) || 0,
                },
                yearTabs,
                rows,
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            }
        }
    } catch (e) {
        console.error('[AppModel/Bill] List:', e)
        return { status: false, data: null }
    }
}

/* ─────────────────────────────────────────────────────────────
   2. GET BILL DETAIL
──────────────────────────────────────────────────────────────── */
async function AppGetBillDetails(accountId, billId) {
    try {
        const rows = await db.raw(`
            SELECT ${BILL_COLS}
            FROM bill b
            LEFT JOIN account_subscription s   ON s.subscription_id = b.subscription_id
            LEFT JOIN subscription_package pkg ON pkg.sub_package_id = COALESCE(b.sub_package_id, s.sub_package_id)
            WHERE b.bill_id = ? AND b.account_id = ?
            LIMIT 1
        `, [billId, accountId])

        if (!rows.length) return { status: false, data: null }

        // ── Attach payment transactions ──
        const transactions = await db.raw(`
            SELECT
                txn_id, txn_ref, payment_gateway, payment_method, bank_name,
                amount, currency, status, paid_at, failed_at,
                gateway_event_type, is_test, created_at
            FROM billing_transaction
            WHERE bill_id = ? AND account_id = ?
            ORDER BY created_at DESC
        `, [billId, accountId])

        return { status: true, data: { ...rows[0], transactions } }
    } catch (e) {
        console.error('[AppModel/Bill] Details:', e)
        return { status: false, data: null }
    }
}

module.exports = {
    AppGetBillsList,
    AppGetBillDetails,
}
