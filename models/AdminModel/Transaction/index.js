const db = require('../../../utils/sqlbuilder')

// ----- List all transactions -----
async function AdminGetTransactionsList(params = {}) {
    const page   = parseInt(params.page)  || 1
    const limit  = parseInt(params.limit) || 20
    const offset = (page - 1) * limit
    const search = params.search || ''
    const status = params.status || ''

    let where  = []
    let values = []

    if (search) {
        where.push(`(a.account_name LIKE ? OR a.account_email LIKE ? OR sp.payment_ref LIKE ? OR sp.gateway_transaction_id LIKE ?)`)
        const t = `%${search}%`
        values.push(t, t, t, t)
    }
    if (status && status !== 'All') {
        where.push(`sp.payment_status = ?`)
        values.push(status)
    }

    const clause = where.length ? `WHERE ${where.join(' AND ')}` : ''

    const sql = `
        SELECT sp.*, a.account_name, a.account_email,
               s.subscription_ref, pkg.package_name, pkg.package_code
        FROM subscription_payment sp
        JOIN account a ON sp.account_id = a.account_id
        LEFT JOIN account_subscription s ON sp.subscription_id = s.subscription_id
        LEFT JOIN subscription_package pkg ON s.sub_package_id = pkg.sub_package_id
        ${clause}
        ORDER BY sp.created_date DESC
        LIMIT ${limit} OFFSET ${offset}
    `
    const countSql = `
        SELECT COUNT(*) as c FROM subscription_payment sp
        JOIN account a ON sp.account_id = a.account_id
        ${clause}
    `
    try {
        const total = (await db.raw(countSql, values))[0].c
        const rows  = await db.raw(sql, values)
        return { status: true, data: { rows, total, page, limit, totalPages: Math.ceil(total / limit) } }
    } catch (e) {
        console.error('[AdminModel/Transaction] AdminGetTransactionsList:', e)
        return { status: false, data: null }
    }
}

// ----- Transaction details -----
async function AdminGetTransactionDetails(payment_id) {
    try {
        const sql = `
            SELECT sp.*, a.account_name, a.account_email, a.account_contact,
                   s.subscription_ref, s.billing_period, s.status AS subscription_status,
                   pkg.package_name, pkg.package_code
            FROM subscription_payment sp
            JOIN account a ON sp.account_id = a.account_id
            LEFT JOIN account_subscription s ON sp.subscription_id = s.subscription_id
            LEFT JOIN subscription_package pkg ON s.sub_package_id = pkg.sub_package_id
            WHERE sp.payment_id = ? LIMIT 1
        `
        const rows = await db.raw(sql, [payment_id])
        if (!rows.length) return { status: false, data: null }
        return { status: true, data: rows[0] }
    } catch (e) {
        console.error('[AdminModel/Transaction] AdminGetTransactionDetails:', e)
        return { status: false, data: null }
    }
}

// ----- Create manual transaction/bill -----
async function AdminCreateTransaction(data) {
    try {
        const row = await db.insert('subscription_payment', data)
        if (!row.insertId) return { status: false, data: null }
        return { status: true, data: row.insertId }
    } catch (e) {
        console.error('[AdminModel/Transaction] AdminCreateTransaction:', e)
        return { status: false, data: null }
    }
}

// ----- Update transaction status -----
async function AdminUpdateTransactionStatus(payment_id, payment_status, extra = {}) {
    try {
        const updateData = { payment_status, ...extra }
        if (payment_status === 'Paid')     updateData.paid_date     = new Date()
        if (payment_status === 'Failed')   updateData.failed_date   = new Date()
        if (payment_status === 'Refunded') updateData.refunded_date = new Date()
        const row = await db.update('subscription_payment', updateData, { payment_id })
        return { status: row > 0, data: row }
    } catch (e) {
        console.error('[AdminModel/Transaction] AdminUpdateTransactionStatus:', e)
        return { status: false, data: null }
    }
}

// ----- Delete transaction -----
async function AdminDeleteTransaction(payment_id) {
    try {
        const row = await db.delete('subscription_payment', { payment_id })
        return { status: !!row.affectedRows, data: row.affectedRows }
    } catch (e) {
        console.error('[AdminModel/Transaction] AdminDeleteTransaction:', e)
        return { status: false, data: null }
    }
}

// ----- Get accounts with active FCM devices (for broadcast) -----
async function AdminGetTargetAccounts(account_ids = []) {
    try {
        if (account_ids.length === 0) {
            // All active accounts with devices
            const rows = await db.raw(`
                SELECT DISTINCT ad.account_id, ad.device_fcm_token, a.account_email, a.account_name
                FROM account_device ad
                JOIN account a ON ad.account_id = a.account_id
                WHERE ad.device_status = 'Active' AND ad.device_enable_fcm = 'Yes'
                  AND ad.device_fcm_token IS NOT NULL AND ad.device_fcm_token != ''
                  AND a.status = 'Active'
            `)
            return { status: true, data: rows }
        }
        const placeholders = account_ids.map(() => '?').join(',')
        const rows = await db.raw(`
            SELECT DISTINCT ad.account_id, ad.device_fcm_token, a.account_email, a.account_name
            FROM account_device ad
            JOIN account a ON ad.account_id = a.account_id
            WHERE ad.account_id IN (${placeholders})
              AND ad.device_status = 'Active' AND ad.device_enable_fcm = 'Yes'
              AND ad.device_fcm_token IS NOT NULL
        `, account_ids)
        return { status: true, data: rows }
    } catch (e) {
        console.error('[AdminModel/Transaction] AdminGetTargetAccounts:', e)
        return { status: false, data: [] }
    }
}

module.exports = { AdminGetTransactionsList, AdminGetTransactionDetails, AdminCreateTransaction, AdminUpdateTransactionStatus, AdminDeleteTransaction, AdminGetTargetAccounts }
