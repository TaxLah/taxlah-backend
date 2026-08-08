const db = require("../../../utils/sqlbuilder")

/**
 * Deleting a notification archives it.
 *
 * archive_status already exists on the table for exactly this, so a removal is a flag
 * rather than a DELETE: the row stays, which keeps the record of what was sent to whom
 * intact even after a user clears their list.
 */
const NOT_ARCHIVED = `archive_status = 'No'`

async function UserNotificationGetList(params = { account_id, offset: 0, limit: 10 }) {
    let result = null
    try {
        // LIMIT/OFFSET cannot be bound parameters, so they are coerced before interpolation.
        const limit  = Math.min(Math.max(parseInt(params.limit, 10) || 10, 1), 100)
        const offset = Math.max(parseInt(params.offset, 10) || 0, 0)

        // The archive filter has to be here as well as on the count — without it a
        // deleted notification kept appearing in the list it was just removed from.
        let sql     = `SELECT notification_id, notification_title, notification_description, read_status, archive_status, created_at
                       FROM account_notification
                       WHERE account_id = ? AND ${NOT_ARCHIVED}
                       ORDER BY created_at DESC, notification_id DESC
                       LIMIT ${limit} OFFSET ${offset}`
        let query   = await db.raw(sql, [params.account_id])

        let sql2    = `SELECT
                           COUNT(*) AS total,
                           SUM(CASE WHEN read_status = 'No' THEN 1 ELSE 0 END) AS unread
                       FROM account_notification
                       WHERE account_id = ? AND ${NOT_ARCHIVED}`
        let query2  = await db.raw(sql2, [params.account_id])

        const total  = Number(query2[0]?.total) || 0
        // Counted across everything the user still has, not just the page in front of
        // them — the badge is a total, and paging must not change it.
        const unread = Number(query2[0]?.unread) || 0

        result = {
            status: true,
            data: {
                row: query,
                total,
                unread,
                totalPages: Math.max(Math.ceil(total / limit), 1)
            }
        }
    } catch (e) {
        console.log("err notif : ", e)
        result = { status: false, data: { row: [], total: 0, unread: 0, totalPages: 1 }}
    }  finally {
        return result
    }
}

async function UserNotificationGetInfo(account_id, notification_id) {
    let result = null
    try {
        // An archived notification is gone as far as the user is concerned; opening one
        // by id should not bring it back.
        let sql = await db.raw(
            `SELECT * FROM account_notification WHERE account_id = ? AND notification_id = ? AND ${NOT_ARCHIVED} LIMIT 1`,
            [account_id, notification_id]
        )
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

/** Marks every unread notification the user still has as read. */
async function UserNotificationMarkAllRead(account_id) {
    try {
        const affected = await db.raw(
            `UPDATE account_notification
             SET read_status = 'Yes', last_modified = NOW()
             WHERE account_id = ? AND read_status = 'No' AND ${NOT_ARCHIVED}`,
            [account_id]
        )
        // Zero rows is a legitimate outcome — everything was already read.
        return { status: true, data: affected?.affectedRows ?? 0 }
    } catch (e) {
        console.log("err notif mark all read : ", e)
        return { status: false, data: 0 }
    }
}

/**
 * Removes one notification from the user's list.
 *
 * Scoped by account_id as well as id, so a guessed notification_id cannot archive
 * somebody else's notification.
 */
async function UserNotificationArchive(account_id, notification_id) {
    try {
        const affected = await db.raw(
            `UPDATE account_notification
             SET archive_status = 'Yes', last_modified = NOW()
             WHERE account_id = ? AND notification_id = ? AND ${NOT_ARCHIVED}`,
            [account_id, notification_id]
        )
        return { status: (affected?.affectedRows ?? 0) > 0, data: affected?.affectedRows ?? 0 }
    } catch (e) {
        console.log("err notif archive : ", e)
        return { status: false, data: 0 }
    }
}

/**
 * Clears the user's whole list.
 *
 * This replaced a real `DELETE FROM account_notification WHERE account_id = ?`. Nothing
 * called it yet, which is the only reason no history was ever destroyed — a "clear all"
 * button wired to the old version would have permanently erased every notification the
 * system had sent that account.
 */
async function UserNotificationArchiveAll(account_id) {
    try {
        const affected = await db.raw(
            `UPDATE account_notification
             SET archive_status = 'Yes', last_modified = NOW()
             WHERE account_id = ? AND ${NOT_ARCHIVED}`,
            [account_id]
        )
        return { status: true, data: affected?.affectedRows ?? 0 }
    } catch (e) {
        console.log("err notif archive all : ", e)
        return { status: false, data: 0 }
    }
}

module.exports = {
    UserNotificationGetList,
    UserNotificationGetInfo,
    UserNotificationCreate,
    UserNotifiactionUpdate,
    UserNotificationMarkAllRead,
    UserNotificationArchive,
    UserNotificationArchiveAll
}