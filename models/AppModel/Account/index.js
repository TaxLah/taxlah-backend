const db = require("../../../utils/sqlbuilder")

const sql_basic_account = `SELECT account_id, account_secret_key, account_name, account_fullname, account_email, account_contact, account_profile_image, account_status FROM account`
const sql_full_account  = `SELECT account_id, account_secret_key, account_name, account_fullname, account_email, account_contact, account_address_1, account_address_2, account_address_3, account_address_postcode, account_address_city, account_address_state, account_profile_image, account_status, created_date FROM account`

async function AccountGetInfo(account_id) {
    let result = null
    try {
        let account = await db.raw(`${sql_full_account} WHERE account_id LIKE ? LIMIT 1`, [account_id])
        if(account.length) {
            result = { status: true, data: account[0] }
        } else {
            result = { status: false, data: null }
        }
    } catch (e) {
        result = { status: false, data: null }
    } finally {
        return result
    }
}

async function AccountCreate(data) {
    let result = null
    try {
        let account = await db.insert('account', data)
        if(account.insertId) {
            result = { status: true, account_id: account.insertId }
        } else {
            result = { status: false, account_id: null }
        }
    } catch (e) {
        result = { status: false, account_id: null }
    } finally {
        return result
    }
}

async function AccountUpdate(data) {
    let result = null
    try {
        let updateData = await db.update('account', data, { account_id: data.account_id })
        if(updateData) {
            result = { status: true, data: updateData }
        } else {
            result = { status: false, data: null }
        }
    } catch (e) {
        console.log("Log E : ", e)
        result = { status: false, data: null }
    } finally {
        return result
    }
}

async function AccountDelete(account_id) {
    let result = null
    try {
        let deleteData = await db.delete('account', { account_id })
        if(deleteData.affectedRows) {
            result = { status: true, data: deleteData }
        } else {
            result = { status: false, data: null }
        }
    } catch (e) {
        result = { status: false, data: null }
    } finally {
        return result
    }
}

module.exports = {
    AccountGetInfo,
    AccountCreate,
    AccountUpdate,
    AccountDelete
}