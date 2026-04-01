const db = require('../../../utils/sqlbuilder')

// ----- User Activity Report -----
async function AdminReportUserActivity(params = {}) {
    const page   = parseInt(params.page)  || 1
    const limit  = parseInt(params.limit) || 20
    const offset = (page - 1) * limit
    const search = params.search || ''
    const status = params.status || ''
    const dateFrom = params.dateFrom || ''
    const dateTo   = params.dateTo   || ''

    let where  = []
    let values = []

    if (search) {
        where.push(`(a.account_name LIKE ? OR a.account_email LIKE ?)`)
        const t = `%${search}%`
        values.push(t, t)
    }
    if (status && status !== 'All') {
        where.push(`a.account_status = ?`)
        values.push(status)
    }
    if (dateFrom) { where.push(`a.created_date >= ?`); values.push(dateFrom) }
    if (dateTo)   { where.push(`a.created_date <= ?`); values.push(dateTo)   }

    const clause = where.length ? `WHERE ${where.join(' AND ')}` : ''

    try {
        const countSql = `SELECT COUNT(*) as c FROM account a ${clause}`
        const total = (await db.raw(countSql, values))[0].c

        const sql = `
            SELECT
                a.account_id, a.account_name, a.account_email, a.account_status, a.created_date,
                COUNT(DISTINCT e.expenses_id) AS total_expenses,
                COUNT(DISTINCT r.receipt_id)  AS total_receipts,
                IFNULL(SUM(e.expenses_total_amount), 0) AS total_expense_amount,
                sub.status AS subscription_status, sub.current_period_end,
                pkg.package_name
            FROM account a
            LEFT JOIN account_expenses e   ON a.account_id = e.account_id AND e.status = 'Active'
            LEFT JOIN receipt r            ON a.account_id = r.account_id AND r.status != 'Deleted'
            LEFT JOIN account_subscription sub ON a.account_id = sub.account_id AND sub.status IN ('Active','Trial')
            LEFT JOIN subscription_package pkg ON sub.sub_package_id = pkg.sub_package_id
            ${clause}
            GROUP BY a.account_id
            ORDER BY a.created_date DESC
            LIMIT ${limit} OFFSET ${offset}
        `
        const rows = await db.raw(sql, values)
        return { status: true, data: { rows, total, page, limit, totalPages: Math.ceil(total / limit) } }
    } catch (e) {
        console.error('[AdminModel/Report] AdminReportUserActivity:', e)
        return { status: false, data: null }
    }
}

// ----- Transaction Report -----
async function AdminReportTransactions(params = {}) {
    const page   = parseInt(params.page)  || 1
    const limit  = parseInt(params.limit) || 20
    const offset = (page - 1) * limit
    const search = params.search || ''
    const status = params.status || ''
    const dateFrom = params.dateFrom || ''
    const dateTo   = params.dateTo   || ''

    let where  = []
    let values = []

    if (search) {
        where.push(`(a.account_name LIKE ? OR a.account_email LIKE ? OR sp.payment_ref LIKE ?)`)
        const t = `%${search}%`
        values.push(t, t, t)
    }
    if (status && status !== 'All') {
        where.push(`sp.payment_status = ?`)
        values.push(status)
    }
    if (dateFrom) { where.push(`sp.created_date >= ?`); values.push(dateFrom) }
    if (dateTo)   { where.push(`sp.created_date <= ?`); values.push(dateTo)   }

    const clause = where.length ? `WHERE ${where.join(' AND ')}` : ''

    try {
        const countSql = `SELECT COUNT(*) as c FROM subscription_payment sp JOIN account a ON sp.account_id = a.account_id ${clause}`
        const total = (await db.raw(countSql, values))[0].c

        const sql = `
            SELECT sp.payment_id, sp.payment_ref, sp.amount, sp.currency, sp.payment_status,
                   sp.payment_gateway, sp.created_date, sp.paid_date,
                   a.account_name, a.account_email,
                   pkg.package_name, pkg.package_code
            FROM subscription_payment sp
            JOIN account a ON sp.account_id = a.account_id
            LEFT JOIN account_subscription s ON sp.subscription_id = s.subscription_id
            LEFT JOIN subscription_package pkg ON s.sub_package_id = pkg.sub_package_id
            ${clause}
            ORDER BY sp.created_date DESC
            LIMIT ${limit} OFFSET ${offset}
        `
        const rows = await db.raw(sql, values)

        // Summary totals
        const [summary] = await db.raw(`
            SELECT
                IFNULL(SUM(CASE WHEN sp.payment_status='Paid' THEN sp.amount ELSE 0 END), 0) AS total_collected,
                COUNT(CASE WHEN sp.payment_status='Paid' THEN 1 END) AS paid_count,
                COUNT(CASE WHEN sp.payment_status='Pending' THEN 1 END) AS pending_count,
                COUNT(CASE WHEN sp.payment_status='Failed' THEN 1 END) AS failed_count
            FROM subscription_payment sp
            JOIN account a ON sp.account_id = a.account_id
            ${clause}
        `, values)

        return { status: true, data: { rows, summary, total, page, limit, totalPages: Math.ceil(total / limit) } }
    } catch (e) {
        console.error('[AdminModel/Report] AdminReportTransactions:', e)
        return { status: false, data: null }
    }
}

// ----- Data Usage Report -----
async function AdminReportDataUsage(params = {}) {
    const page   = parseInt(params.page)  || 1
    const limit  = parseInt(params.limit) || 20
    const offset = (page - 1) * limit
    const search = params.search || ''

    let where  = []
    let values = []

    if (search) {
        where.push(`(a.account_name LIKE ? OR a.account_email LIKE ?)`)
        const t = `%${search}%`
        values.push(t, t)
    }

    const clause = where.length ? `WHERE ${where.join(' AND ')}` : ''

    try {
        const countSql = `SELECT COUNT(*) as c FROM account a ${clause}`
        const total = (await db.raw(countSql, values))[0].c

        const sql = `
            SELECT
                a.account_id, a.account_name, a.account_email,
                IFNULL(acs.storage_current_space, 0)           AS storage_used_mb,
                IFNULL(acs.storage_default_space, 0)           AS storage_limit_mb,
                IFNULL(ac.credit_balance, 0)                   AS credit_balance,
                IFNULL(ac.free_receipts_used, 0)               AS free_receipts_used,
                IFNULL(ac.free_receipts_limit, 0)              AS free_receipts_limit,
                COUNT(DISTINCT r.receipt_id)                   AS total_receipts,
                COUNT(DISTINCT e.expenses_id)                  AS total_expenses,
                COUNT(DISTINCT d.device_id)                    AS registered_devices
            FROM account a
            LEFT JOIN account_storage acs ON a.account_id = acs.account_id
            LEFT JOIN account_credit  ac  ON a.account_id = ac.account_id
            LEFT JOIN receipt          r  ON a.account_id = r.account_id AND r.status != 'Deleted'
            LEFT JOIN account_expenses e  ON a.account_id = e.account_id AND e.status = 'Active'
            LEFT JOIN account_device   d  ON a.account_id = d.account_id AND d.device_status = 'Active'
            ${clause}
            GROUP BY a.account_id
            ORDER BY storage_used_mb DESC
            LIMIT ${limit} OFFSET ${offset}
        `
        const rows = await db.raw(sql, values)
        return { status: true, data: { rows, total, page, limit, totalPages: Math.ceil(total / limit) } }
    } catch (e) {
        console.error('[AdminModel/Report] AdminReportDataUsage:', e)
        return { status: false, data: null }
    }
}

module.exports = { AdminReportUserActivity, AdminReportTransactions, AdminReportDataUsage }
