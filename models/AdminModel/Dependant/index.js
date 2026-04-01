const db = require('../../../utils/sqlbuilder')

// ----- List user dependants -----
async function AdminGetDependantsList(account_id, params = {}) {
    const page   = parseInt(params.page)  || 1
    const limit  = parseInt(params.limit) || 20
    const offset = (page - 1) * limit
    const search = params.search || ''
    const status = params.status || ''

    let where  = [`account_id = ?`]
    let values = [account_id]

    if (search) {
        where.push(`(dependant_name LIKE ? OR dependant_relationship LIKE ?)`)
        const t = `%${search}%`
        values.push(t, t)
    }
    if (status && status !== 'All') {
        where.push(`status = ?`)
        values.push(status)
    }

    const clause = `WHERE ${where.join(' AND ')}`

    try {
        const total = (await db.raw(`SELECT COUNT(*) as c FROM account_dependant ${clause}`, values))[0].c
        const rows  = await db.raw(`SELECT * FROM account_dependant ${clause} ORDER BY created_date DESC LIMIT ${limit} OFFSET ${offset}`, values)
        return { status: true, data: { rows, total, page, limit, totalPages: Math.ceil(total / limit) } }
    } catch (e) {
        console.error('[AdminModel/Dependant] AdminGetDependantsList:', e)
        return { status: false, data: null }
    }
}

// ----- Dependant details -----
async function AdminGetDependantDetails(dependant_id) {
    try {
        const rows = await db.raw(`SELECT * FROM account_dependant WHERE dependant_id = ? LIMIT 1`, [dependant_id])
        if (!rows.length) return { status: false, data: null }
        return { status: true, data: rows[0] }
    } catch (e) {
        console.error('[AdminModel/Dependant] AdminGetDependantDetails:', e)
        return { status: false, data: null }
    }
}

// ----- Create dependant -----
async function AdminCreateDependant(data) {
    try {
        const row = await db.insert('account_dependant', data)
        if (!row.insertId) return { status: false, data: null }
        return { status: true, data: row.insertId }
    } catch (e) {
        console.error('[AdminModel/Dependant] AdminCreateDependant:', e)
        return { status: false, data: null }
    }
}

// ----- Update dependant -----
async function AdminUpdateDependant(dependant_id, data) {
    try {
        const row = await db.update('account_dependant', data, { dependant_id })
        return { status: row > 0, data: row }
    } catch (e) {
        console.error('[AdminModel/Dependant] AdminUpdateDependant:', e)
        return { status: false, data: null }
    }
}

// ----- Delete dependant -----
async function AdminDeleteDependant(dependant_id) {
    try {
        const row = await db.delete('account_dependant', { dependant_id })
        return { status: !!row.affectedRows, data: row.affectedRows }
    } catch (e) {
        console.error('[AdminModel/Dependant] AdminDeleteDependant:', e)
        return { status: false, data: null }
    }
}

module.exports = { AdminGetDependantsList, AdminGetDependantDetails, AdminCreateDependant, AdminUpdateDependant, AdminDeleteDependant }
