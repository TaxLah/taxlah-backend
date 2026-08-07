const db = require("../../../utils/sqlbuilder")

async function UserNotificationGetList(params = { account_id, offset: 0, limit: 10 }) {
    let result = null
    try {
        // LIMIT/OFFSET cannot be bound parameters, so they are coerced before interpolation.
        const limit  = Math.min(Math.max(parseInt(params.limit, 10) || 10, 1), 100)
        const offset = Math.max(parseInt(params.offset, 10) || 0, 0)

        let sql     = `SELECT notification_id, notification_title, read_status, archive_status, created_at FROM account_notification WHERE account_id LIKE ? ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`
        let query   = await db.raw(sql, [params.account_id])

        let sql2    = `SELECT COUNT(*) AS total FROM account_notification WHERE account_id LIKE ?`
        let query2  = await db.raw(sql2, [params.account_id])

        const total = Number(query2[0]?.total) || 0

        result = {
            status: true,
            data: {
                row: query,
                total,
                totalPages: Math.ceil(total / limit)
            }
        }
    } catch (e) {
        console.log("err notif : ", e)
        result = { status: false, data: { row: [], total: 0, totalData: 0 }}
    }  finally {
        return result
    }
}

async function UserNotificationGetInfo(account_id, notification_id) {
    let result = null
    try {
        let sql = await db.raw(`SELECT * FROM account_notification WHERE account_id = ? AND notification_id = ? LIMIT 1`, [account_id, notification_id])
        result  = {
            status: true,
            data: sql.length ? sql[0] : null
        }
        // Only mark read when the notification actually belongs to this account —
        // otherwise any account_id could flip another user's notification to read.
        if (sql.length) {
            await UserNotifiactionUpdate({ account_id, notification_id, read_status: 'Yes' })
        }
    } catch (e) {
        result = { status: false, data: null }
    }  finally {
        return result
    }
}

async function UserNotificationCreate(params = { account_id, notification_title: '', notification_description: '', read_status: 'No', archive_status: 'No', status: 'Active' }) {
    let result = null
    try {
        let sql = await db.insert('account_notification', params)
        if(sql.insertId) {
            result = { status: true, data: sql.insertId }
        } else {
            result = { status: false, data: null }
        }
    } catch (e) {
        console.log("err create notif : ", e)
        result = { status: false, data: null }
    }  finally {
        return result
    }
}

async function UserNotifiactionUpdate(params = { account_id, notification_id, read_status: 'No', archive_status: 'No', status: 'Active' }) {
    let result = null
    try {
        // account_id and notification_id identify the row; everything else is the update.
        const { account_id, notification_id, ...fields } = params

        const where = { notification_id }
        if (account_id) where.account_id = account_id

        // db.update returns the affectedRows count itself, not a result object —
        // the previous `sql.insertId` read a property off a number and was always undefined.
        let affectedRows = await db.update('account_notification', fields, where)
        if(affectedRows) {
            result = { status: true, data: affectedRows }
        } else {
            result = { status: false, data: null }
        }
    } catch (e) {
        result = { status: false, data: null }
    }  finally {
        return result
    }
}

async function UserNotificationDelete(account_id) {
    let result = null
    try {
        let sql = await db.delete('account_notification', { account_id })
        if(sql.affectedRows) {
            result = { status: true }
        } else {
            result = { status: false }
        }
    } catch (e) {
        result = { status: false }
    }  finally {
        return result
    }
}

module.exports = {
    UserNotificationGetList,
    UserNotificationGetInfo,
    UserNotificationCreate,
    UserNotifiactionUpdate,
    UserNotificationDelete
}