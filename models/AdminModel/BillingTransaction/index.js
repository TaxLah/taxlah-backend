const db = require('../../../utils/sqlbuilder')

/* ─────────────────────────────────────────────────────────────
   1. LIST BILLING TRANSACTIONS
──────────────────────────────────────────────────────────────── */
async function AdminGetBillingTransactionsList(params = {}) {
    const page   = parseInt(params.page)  || 1
    const limit  = parseInt(params.limit) || 10
    const offset = (page - 1) * limit

    const {
        search = '', status = '', payment_gateway = '',
        payment_method = '', year = '', month = '', account_id = '',
        bill_id = ''
    } = params

    const where  = []
    const values = []

    if (search) {
        where.push(`(bt.txn_ref LIKE ? OR b.invoice_no LIKE ? OR bt.client_name LIKE ? OR bt.client_email LIKE ?)`)
        const s = `%${search}%`
        values.push(s, s, s, s)
    }
    if (status         && status         !== 'All') { where.push(`bt.status = ?`);           values.push(status) }
    if (payment_gateway && payment_gateway !== 'All') { where.push(`bt.payment_gateway = ?`); values.push(payment_gateway) }
    if (payment_method  && payment_method  !== 'All') { where.push(`bt.payment_method = ?`);  values.push(payment_method) }
    if (year)                                         { where.push(`bt.bill_year = ?`);        values.push(year) }
    if (month)                                        { where.push(`bt.bill_month = ?`);       values.push(month) }
    if (account_id)                                   { where.push(`bt.account_id = ?`);       values.push(account_id) }
    if (bill_id)                                      { where.push(`bt.bill_id = ?`);          values.push(bill_id) }

    const clause = where.length ? `WHERE ${where.join(' AND ')}` : ''

    try {
        // ── KPI summary ──
        const summaryClause = year ? `WHERE bt.bill_year = ?` : ''
        const summaryVals   = year ? [year] : []

        const [summary] = await db.raw(`
            SELECT
                COUNT(*)                                                              AS total,
                SUM(CASE WHEN bt.status = 'Success'  THEN 1    ELSE 0 END)           AS success,
                SUM(CASE WHEN bt.status = 'Pending'  THEN 1    ELSE 0 END)           AS pending,
                SUM(CASE WHEN bt.status = 'Failed'   THEN 1    ELSE 0 END)           AS failed,
                IFNULL(SUM(CASE WHEN bt.status = 'Success' THEN bt.amount END), 0)   AS revenue
            FROM billing_transaction bt ${summaryClause}
        `, summaryVals)

        // ── Available years ──
        const yearTabs = await db.raw(`
            SELECT bill_year, COUNT(*) AS count
            FROM billing_transaction
            GROUP BY bill_year
            ORDER BY bill_year DESC
        `)

        // ── Paginated rows ──
        const [{ c: total }] = await db.raw(`
            SELECT COUNT(*) AS c
            FROM billing_transaction bt
            LEFT JOIN bill b ON b.bill_id = bt.bill_id
            ${clause}
        `, values)

        const rows = await db.raw(`
            SELECT
                bt.txn_id, bt.txn_ref,
                bt.bill_id, b.bill_no, b.invoice_no,
                bt.account_id,
                a.account_fullname, a.account_email, a.company_name,
                bt.bill_year, bt.bill_month,
                bt.payment_gateway, bt.gateway_purchase_id,
                bt.gateway_event_type, bt.gateway_status_raw,
                bt.payment_method, bt.bank_name,
                bt.amount, bt.currency,
                bt.client_email, bt.client_name,
                bt.status, bt.failure_reason, bt.is_test,
                bt.paid_at, bt.failed_at, bt.refunded_at,
                bt.created_at
            FROM billing_transaction bt
            LEFT JOIN bill b    ON b.bill_id    = bt.bill_id
            LEFT JOIN account a ON a.account_id = bt.account_id
            ${clause}
            ORDER BY bt.created_at DESC
            LIMIT ${limit} OFFSET ${offset}
        `, values)

        return {
            status: true,
            data: {
                summary: {
                    total:   parseInt(summary.total),
                    success: parseInt(summary.success),
                    pending: parseInt(summary.pending),
                    failed:  parseInt(summary.failed),
                    revenue: parseFloat(summary.revenue),
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
        console.error('[AdminModel/BillingTransaction] List:', e)
        return { status: false, data: null }
    }
}

/* ─────────────────────────────────────────────────────────────
   2. GET TRANSACTION DETAILS  (includes full chip_payload + chip_callback)
──────────────────────────────────────────────────────────────── */
async function AdminGetBillingTransactionDetails(txn_id) {
    try {
        const rows = await db.raw(`
            SELECT
                bt.*,
                b.bill_no, b.invoice_no, b.bill_type, b.bill_description,
                b.billing_period_start, b.billing_period_end,
                b.subtotal, b.sst_rate, b.sst_amount, b.total_amount AS bill_total,
                a.account_fullname, a.account_email, a.account_contact, a.company_name
            FROM billing_transaction bt
            LEFT JOIN bill    b ON b.bill_id    = bt.bill_id
            LEFT JOIN account a ON a.account_id = bt.account_id
            WHERE bt.txn_id = ?
            LIMIT 1
        `, [txn_id])

        if (!rows.length) return { status: false, data: null }
        return { status: true, data: rows[0] }
    } catch (e) {
        console.error('[AdminModel/BillingTransaction] Details:', e)
        return { status: false, data: null }
    }
}

module.exports = {
    AdminGetBillingTransactionsList,
    AdminGetBillingTransactionDetails,
}
