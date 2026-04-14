const db = require("../../../utils/sqlbuilder")
const { AuthDeleteAccount } = require("../Auth")

const sql_basic_account = `SELECT account_id, account_secret_key, account_name, account_fullname, account_email, account_contact, account_profile_image, account_status FROM account`
const sql_full_account  = `SELECT * FROM account`

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
    console.log("Log Data Create Account Profile : ", data)
    let result = null
    try {
        let account = await db.insert('account', data)
        if(account.insertId) {
            result = { status: true, account_id: account.insertId }
        } else {
            result = { status: false, account_id: null }
        }
    } catch (e) {
        console.log("Error Create Account Profile : ", e)
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
        let deleteData = await db.update('account', { account_status: 'Suspended' },  { account_id })
        if(deleteData) {
            let update_access = await AuthDeleteAccount(account_id)
            console.log("Log Function Delete Access : ", update_access)
            
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