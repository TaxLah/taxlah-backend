const db = require('../../../utils/sqlbuilder')

// ----- Packages List -----
async function AdminGetPackagesList(params = {}) {
    const page   = parseInt(params.page)   || 1
    const limit  = parseInt(params.limit)  || 20
    const offset = (page - 1) * limit
    const search = params.search || ''
    const status = params.status || ''

    let where  = []
    let values = []

    if (search) {
        where.push(`(package_name LIKE ? OR package_code LIKE ? OR package_description LIKE ?)`)
        const s = `%${search}%`
        values.push(s, s, s)
    }
    if (status && status !== 'All') {
        where.push(`status = ?`)
        values.push(status)
    }

    const clause = where.length ? `WHERE ${where.join(' AND ')}` : ''

    try {
        const total   = (await db.raw(`SELECT COUNT(*) as c FROM subscription_package ${clause}`, values))[0].c
        const rows    = await db.raw(`SELECT * FROM subscription_package ${clause} ORDER BY sort_order ASC, created_date DESC LIMIT ${limit} OFFSET ${offset}`, values)
        return { status: true, data: { rows, total, page, limit, totalPages: Math.ceil(total / limit) } }
    } catch (e) {
        console.error('[AdminModel/Package] AdminGetPackagesList:', e)
        return { status: false, data: null }
    }
}

// ----- Package Details -----
async function AdminGetPackageDetails(package_id) {
    try {
        const rows = await db.raw(`SELECT * FROM subscription_package WHERE sub_package_id = ? LIMIT 1`, [package_id])
        if (!rows.length) return { status: false, data: null }
        return { status: true, data: rows[0] }
    } catch (e) {
        console.error('[AdminModel/Package] AdminGetPackageDetails:', e)
        return { status: false, data: null }
    }
}

// ----- Create Package -----
async function AdminCreatePackage(data) {
    try {
        const row = await db.insert('subscription_package', data)
        if (!row.insertId) return { status: false, data: null }
        return { status: true, data: row.insertId }
    } catch (e) {
        console.error('[AdminModel/Package] AdminCreatePackage:', e)
        return { status: false, data: null }
    }
}

// ----- Update Package -----
async function AdminUpdatePackage(package_id, data) {
    try {
        const row = await db.update('subscription_package', data, { sub_package_id: package_id })
        return { status: row > 0, data: row }
    } catch (e) {
        console.error('[AdminModel/Package] AdminUpdatePackage:', e)
        return { status: false, data: null }
    }
}

// ----- Delete (Archive) Package -----
async function AdminDeletePackage(package_id) {
    try {
        const row = await db.update('subscription_package', { status: 'Archived' }, { sub_package_id: package_id })
        return { status: row > 0, data: row }
    } catch (e) {
        console.error('[AdminModel/Package] AdminDeletePackage:', e)
        return { status: false, data: null }
    }
}

// ----- Assign subscription to user -----
async function AdminAssignSubscription(data) {
    // data: { account_id, sub_package_id, status, billing_period, price_amount, start_date, current_period_start, current_period_end, subscription_ref }
    try {
        const row = await db.insert('account_subscription', data)
        if (!row.insertId) return { status: false, data: null }
        return { status: true, data: row.insertId }
    } catch (e) {
        console.error('[AdminModel/Package] AdminAssignSubscription:', e)
        return { status: false, data: null }
    }
}

module.exports = { AdminGetPackagesList, AdminGetPackageDetails, AdminCreatePackage, AdminUpdatePackage, AdminDeletePackage, AdminAssignSubscription }
