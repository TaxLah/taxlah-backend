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
        // Columns are listed explicitly rather than `a.*`: the account table holds IC
        // numbers, salary bands and the account secret key, and this payload goes to a
        // browser. Only what the screen actually renders is selected.
        const sql = `
            SELECT s.*,
                   a.account_name, a.account_fullname, a.account_email, a.account_contact,
                   a.account_ic, a.account_gender, a.account_dob, a.account_status,
                   a.account_verified, a.account_is_employed, a.account_is_tax_declared,
                   a.account_salary_range, a.account_address_1, a.account_address_2,
                   a.account_address_3, a.account_address_postcode, a.account_address_city,
                   a.account_address_state, a.created_date AS account_created_date,
                   p.package_name, p.package_code, p.price_amount AS pkg_price,
                   p.features, p.storage_limit_mb, p.max_receipts, p.max_reports,
                   p.package_badge, p.package_color
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

/**
 * Event timeline for a subscription.
 *
 * subscription_history is written by SubscriptionService on every state change but has
 * never been exposed to the admin API, so this data existed with no way to read it.
 */
async function AdminGetSubscriptionHistory(subscription_id, limit = 50) {
    try {
        const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200)
        const sql = `
            SELECT history_id, subscription_id, account_id, event_type, event_description,
                   old_status, new_status, metadata, event_date
            FROM subscription_history
            WHERE subscription_id = ?
            ORDER BY event_date DESC, history_id DESC
            LIMIT ${safeLimit}
        `
        const rows = await db.raw(sql, [subscription_id])
        return { status: true, data: rows }
    } catch (e) {
        console.error('[AdminModel/Subscription] AdminGetSubscriptionHistory:', e)
        return { status: false, data: [] }
    }
}

/** Payments recorded against a subscription, newest first. */
async function AdminGetSubscriptionPayments(subscription_id, limit = 50) {
    try {
        const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200)
        const sql = `
            SELECT payment_id, payment_ref, amount, currency, payment_gateway,
                   payment_status, period_start, period_end, paid_date, created_date
            FROM subscription_payment
            WHERE subscription_id = ?
            ORDER BY created_date DESC
            LIMIT ${safeLimit}
        `
        const rows = await db.raw(sql, [subscription_id])
        return { status: true, data: rows }
    } catch (e) {
        console.error('[AdminModel/Subscription] AdminGetSubscriptionPayments:', e)
        return { status: false, data: [] }
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

module.exports = {
    AdminGetSubscriptionsList,
    AdminGetSubscriptionDetails,
    AdminGetSubscriptionHistory,
    AdminGetSubscriptionPayments,
    AdminGetUserSubscription,
    AdminUpdateSubscription,
    AdminRemoveSubscription
}
