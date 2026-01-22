const db = require("../../../utils/sqlbuilder")

async function UserNotificationGetList(params = { account_id, offset: 0, limit: 10 }) {
    let result = null
    try {
        let sql     = `SELECT notification_id, notification_title, read_status, archive_status, created_at FROM account_notification WHERE account_id LIKE ? ORDER BY created_at DESC LIMIT ${params.limit} OFFSET ${params.offset}`
        let query   = await db.raw(sql, [params.account_id])

        let sql2    = `SELECT COUNT(*) FROM account_notification WHERE account_id LIKE ?`
        let query2  = await db.raw(sql2, [params.account_id])

        result = {
            status: true,
            data: {
                row: query,
                total: query2[0]["TOTAL"],
                totalPages: Math.ceil(query2[0]["TOTAL"] / params.limit)
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
        await UserNotifiactionUpdate({notification_id, read_status: 'Yes'})
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

async function UserNotifiactionUpdate(params = { notification_id, read_status: 'No', archive_status: 'No', status: 'Active' }) {
    let result = null
    try {
        let sql = await db.update('account_notification', params, { notification_id: params.notification_id })
        if(sql.insertId) {
            result = { status: true, data: sql.insertId }
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