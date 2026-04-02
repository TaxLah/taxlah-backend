const db = require('../../../utils/sqlbuilder')

const BILL_COLS = `
    b.bill_id, b.bill_no, b.invoice_no,
    b.account_id, b.subscription_id, b.sub_package_id,
    b.bill_type, b.bill_description,
    b.billing_year, b.billing_month,
    b.billing_period_start, b.billing_period_end,
    b.bill_date, b.due_date, b.paid_at,
    b.subtotal, b.sst_rate, b.sst_amount, b.total_amount, b.currency,
    b.chip_purchase_id, b.checkout_url,
    b.status, b.reminder_count, b.reminder_sent_at,
    b.notes, b.created_at, b.last_modified,
    a.account_name, a.account_fullname, a.account_email,
    a.account_contact, a.company_name,
    s.subscription_ref, s.billing_period, s.status AS subscription_status,
    pkg.package_name, pkg.package_code
`

/* ─────────────────────────────────────────────────────────────
   1. LIST BILLS
──────────────────────────────────────────────────────────────── */
async function AdminGetBillsList(params = {}) {
    const page   = parseInt(params.page)  || 1
    const limit  = parseInt(params.limit) || 10
    const offset = (page - 1) * limit

    const { search = '', status = '', bill_type = '', year = '', month = '', account_id = '' } = params

    console.log("Log Query Params : ", params)

    const where  = []
    const values = []

    if (search) {
        where.push(`(b.bill_no LIKE ? OR b.invoice_no LIKE ? OR a.account_fullname LIKE ? OR a.account_email LIKE ? OR a.company_name LIKE ?)`)
        const s = `%${search}%`
        values.push(s, s, s, s, s)
    }
    if (status    && status    !== 'All') { where.push(`b.status = ?`);       values.push(status) }
    if (bill_type && bill_type !== 'All') { where.push(`b.bill_type = ?`);    values.push(bill_type) }
    if (year)                             { where.push(`b.billing_year = ?`); values.push(year) }
    if (month)                            { where.push(`b.billing_month = ?`);values.push(month) }
    if (account_id)                       { where.push(`b.account_id = ?`);   values.push(account_id) }

    const clause = where.length ? `WHERE ${where.join(' AND ')}` : ''

    try {
        // ── Header KPI summary (filtered by year if provided) ──
        const summaryClause = year ? `WHERE b.billing_year = ?` : ''
        const summaryVals   = year ? [year] : []

        console.log("Log Clause : ", clause)
        console.log("Log Summary Clause : ", summaryClause)

        const [summary] = await db.raw(`
            SELECT
                COUNT(*)                                                      AS total_bills,
                SUM(CASE WHEN b.status = 'Paid'    THEN 1 ELSE 0 END)        AS paid,
                SUM(CASE WHEN b.status = 'Pending' THEN 1 ELSE 0 END)        AS pending,
                SUM(CASE WHEN b.status = 'Overdue' THEN 1 ELSE 0 END)        AS overdue,
                IFNULL(SUM(CASE WHEN b.status = 'Paid'    THEN b.total_amount END), 0) AS revenue,
                IFNULL(SUM(CASE WHEN b.status IN ('Pending','Overdue') THEN b.total_amount END), 0) AS outstanding
            FROM bill b ${summaryClause}
        `, summaryVals)

        // ── Bill type breakdown (same year filter) ──
        const breakdown = await db.raw(`
            SELECT
                b.bill_type,
                COUNT(*)                                AS count,
                IFNULL(SUM(b.total_amount), 0)          AS amount
            FROM bill b ${summaryClause}
            GROUP BY b.bill_type
            ORDER BY amount DESC
        `, summaryVals)

        // ── Available years for year tabs ──
        const yearTabs = await db.raw(`
            SELECT billing_year, COUNT(*) AS count
            FROM bill
            GROUP BY billing_year
            ORDER BY billing_year DESC
        `)

        // ── Paginated rows ──
        const [{ c: total }] = await db.raw(`
            SELECT COUNT(*) AS c
            FROM bill b
            JOIN account a ON a.account_id = b.account_id
            ${clause}
        `, values)

        const rows = await db.raw(`
            SELECT ${BILL_COLS}
            FROM bill b
            JOIN  account a             ON a.account_id      = b.account_id
            LEFT JOIN account_subscription s   ON s.subscription_id = b.subscription_id
            LEFT JOIN subscription_package pkg ON pkg.sub_package_id = COALESCE(b.sub_package_id, s.sub_package_id)
            ${clause}
            ORDER BY b.bill_date DESC
            LIMIT ${limit} OFFSET ${offset}
        `, values)

        return {
            status: true,
            data: {
                summary: {
                    totalBills:   parseInt(summary.total_bills),
                    paid:         parseInt(summary.paid),
                    pending:      parseInt(summary.pending),
                    overdue:      parseInt(summary.overdue),
                    revenue:      parseFloat(summary.revenue),
                    outstanding:  parseFloat(summary.outstanding),
                },
                breakdown,
                yearTabs,
                rows,
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            }
        }
    } catch (e) {
        console.error('[AdminModel/Bill] List:', e)
        return { status: false, data: null }
    }
}

/* ─────────────────────────────────────────────────────────────
   2. GET BILL DETAILS
──────────────────────────────────────────────────────────────── */
async function AdminGetBillDetails(bill_id) {
    try {
        const rows = await db.raw(`
            SELECT ${BILL_COLS}
            FROM bill b
            JOIN  account a             ON a.account_id      = b.account_id
            LEFT JOIN account_subscription s   ON s.subscription_id = b.subscription_id
            LEFT JOIN subscription_package pkg ON pkg.sub_package_id = COALESCE(b.sub_package_id, s.sub_package_id)
            WHERE b.bill_id = ?
            LIMIT 1
        `, [bill_id])

        if (!rows.length) return { status: false, data: null }

        // ── Attach transactions for this bill ──
        const transactions = await db.raw(`
            SELECT txn_id, txn_ref, payment_gateway, payment_method, bank_name,
            amount, currency, status, paid_at, failed_at, gateway_event_type,
            gateway_status_raw, is_test, created_at
            FROM billing_transaction
            WHERE bill_id = ?
            ORDER BY created_at DESC
        `, [bill_id])

        return { status: true, data: { ...rows[0], transactions } }
    } catch (e) {
        console.error('[AdminModel/Bill] Details:', e)
        return { status: false, data: null }
    }
}

/* ─────────────────────────────────────────────────────────────
   3. CREATE BILL (manual / admin-initiated)
──────────────────────────────────────────────────────────────── */
async function AdminCreateBill(data) {
    try {
        const { BillingCreateBill } = require('../../AppModel/BillingService')
        return await BillingCreateBill(data)
    } catch (e) {
        console.error('[AdminModel/Bill] Create:', e)
        return { status: false, error: e.message }
    }
}

/* ─────────────────────────────────────────────────────────────
   4. UPDATE BILL (notes, due_date, status)
──────────────────────────────────────────────────────────────── */
async function AdminUpdateBill(bill_id, data) {
    try {
        const row = await db.update('bill', data, { bill_id })
        return { status: row > 0, data: row }
    } catch (e) {
        console.error('[AdminModel/Bill] Update:', e)
        return { status: false, data: null }
    }
}

/* ─────────────────────────────────────────────────────────────
   5. UPDATE BILL STATUS
──────────────────────────────────────────────────────────────── */
async function AdminUpdateBillStatus(bill_id, status) {
    try {
        if (status === 'Paid') {
            const { BillingMarkBillPaid } = require('../../AppModel/BillingService')
            return await BillingMarkBillPaid(bill_id)
        }
        const { BillingUpdateBillStatus } = require('../../AppModel/BillingService')
        return await BillingUpdateBillStatus(bill_id, status)
    } catch (e) {
        console.error('[AdminModel/Bill] UpdateStatus:', e)
        return { status: false, error: e.message }
    }
}

/* ─────────────────────────────────────────────────────────────
   6. RECORD REMINDER SENT
──────────────────────────────────────────────────────────────── */
async function AdminRecordReminderSent(bill_id) {
    try {
        const { BillingRecordReminderSent } = require('../../AppModel/BillingService')
        return await BillingRecordReminderSent(bill_id)
    } catch (e) {
        console.error('[AdminModel/Bill] RecordReminderSent:', e)
        return { status: false, error: e.message }
    }
}

module.exports = {
    AdminGetBillsList,
    AdminGetBillDetails,
    AdminCreateBill,
    AdminUpdateBill,
    AdminUpdateBillStatus,
    AdminRecordReminderSent,
}
