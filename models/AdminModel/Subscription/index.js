const db = require('../../../utils/sqlbuilder')

// ----- List all subscriptions -----
async function AdminGetSubscriptionsList(params = {}) {
    const page   = parseInt(params.page)  || 1
    const limit  = parseInt(params.limit) || 20
    const offset = (page - 1) * limit
    const search = params.search || ''
    const status = params.status || ''

    let where  = []
    let values = []

    if (search) {
        where.push(`(a.account_name LIKE ? OR a.account_email LIKE ? OR s.subscription_ref LIKE ?)`)
        const t = `%${search}%`
        values.push(t, t, t)
    }
    if (status && status !== 'All') {
        where.push(`s.status = ?`)
        values.push(status)
    }

    const clause = where.length ? `WHERE ${where.join(' AND ')}` : ''

    const sql = `
        SELECT s.*, a.account_name, a.account_email, p.package_name, p.package_code, p.billing_period AS pkg_billing_period
        FROM account_subscription s
        JOIN account a ON s.account_id = a.account_id
        JOIN subscription_package p ON s.sub_package_id = p.sub_package_id
        ${clause}
        ORDER BY s.created_date DESC
        LIMIT ${limit} OFFSET ${offset}
    `
    const countSql = `
        SELECT COUNT(*) as c FROM account_subscription s
        JOIN account a ON s.account_id = a.account_id
        ${clause}
    `
    try {
        const total = (await db.raw(countSql, values))[0].c
        const rows  = await db.raw(sql, values)
        return { status: true, data: { rows, total, page, limit, totalPages: Math.ceil(total / limit) } }
    } catch (e) {
        console.error('[AdminModel/Subscription] AdminGetSubscriptionsList:', e)
        return { status: false, data: null }
    }
}

// ----- Subscription details -----
async function AdminGetSubscriptionDetails(subscription_id) {
    try {
        const sql = `
            SELECT s.*, a.account_name, a.account_email, a.account_contact,
                   p.package_name, p.package_code, p.price_amount AS pkg_price, p.features
            FROM account_subscription s
            JOIN account a ON s.account_id = a.account_id
            JOIN subscription_package p ON s.sub_package_id = p.sub_package_id
            WHERE s.subscription_id = ? LIMIT 1
        `
        const rows = await db.raw(sql, [subscription_id])
        if (!rows.length) return { status: false, data: null }
        return { status: true, data: rows[0] }
    } catch (e) {
        console.error('[AdminModel/Subscription] AdminGetSubscriptionDetails:', e)
        return { status: false, data: null }
    }
}

// ----- Get user's active subscription -----
async function AdminGetUserSubscription(account_id) {
    try {
        const sql = `
            SELECT s.*, p.package_name, p.package_code, p.price_amount AS pkg_price, p.features
            FROM account_subscription s
            JOIN subscription_package p ON s.sub_package_id = p.sub_package_id
            WHERE s.account_id = ?
            ORDER BY s.created_date DESC LIMIT 1
        `
        const rows = await db.raw(sql, [account_id])
        if (!rows.length) return { status: false, data: null }
        return { status: true, data: rows[0] }
    } catch (e) {
        console.error('[AdminModel/Subscription] AdminGetUserSubscription:', e)
        return { status: false, data: null }
    }
}

// ----- Update subscription -----
async function AdminUpdateSubscription(subscription_id, data) {
    try {
        const row = await db.update('account_subscription', data, { subscription_id })
        return { status: row > 0, data: row }
    } catch (e) {
        console.error('[AdminModel/Subscription] AdminUpdateSubscription:', e)
        return { status: false, data: null }
    }
}

// ----- Remove (expire) subscription -----
async function AdminRemoveSubscription(subscription_id) {
    try {
        const row = await db.update('account_subscription', { status: 'Expired', ended_at: new Date() }, { subscription_id })
        return { status: row > 0, data: row }
    } catch (e) {
        console.error('[AdminModel/Subscription] AdminRemoveSubscription:', e)
        return { status: false, data: null }
    }
}

module.exports = { AdminGetSubscriptionsList, AdminGetSubscriptionDetails, AdminGetUserSubscription, AdminUpdateSubscription, AdminRemoveSubscription }
