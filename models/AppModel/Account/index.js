const db = require("../../../utils/sqlbuilder")
const { AuthDeleteAccount } = require("../Auth")

const sql_basic_account = `SELECT account_id, account_secret_key, account_name, account_fullname, account_email, account_contact, account_profile_image, account_status FROM account`
const sql_full_account  = `SELECT * FROM account`

async function CheckAccountByEmail(account_email) {
    let result = null
    try {
        let data = await db.select("account", { account_email }, "*", 0, 1)
        console.log("Log Data Email : ", data)
        if(data.length) {
            result = { status: true, is_error: false, account_id: data[0]["account_id"] }
        } else {
            result = { status: false, is_error: false, account_id: null }
        }
    } catch (e) {
        console.log("[CheckAccountByEmail] error :", e)
        result = { status: false, is_error: true, account_id: null }
    } 
    return result
}

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
        let deleteData = await db.update('account', { account_status: 'Suspended', is_deleted: 1 },  { account_id })
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

async function CreateApprovalAccount(params = 
    { 
        email, 
        account, 
        dependant, 
        is_verified: "Pending", 
        verified_date: null, 
        otp_number: null, 
        otp_expired_date: null 
    }
) {
    let result = null
    try {
        let data = await db.insert("account_approval", params)
        if(data.insertId) {
            result = { status: true, data: data.insertId }
        } else {
            result = { status: false, data: null }
        }
    } catch (e) {
        console.log("[CreateApprovalAccount] error : ", e)
        result = { status: false }
    } finally {
        return result
    }
}

async function CheckApprovalAccountByEmail(email) {
    let result = null
    try {
        let data = await db.raw(`SELECT * FROM account_approval WHERE email = ? AND is_deleted = 0 ORDER BY id DESC LIMIT 1`, [email])
        if(data.length) {
            result = { status: true, data: data[0], error: false }
        } else {
            result = { status: false, data: null, error: false }
        }
    } catch (e) {
        console.log("[CheckApprovalAccountByEmail] error : ", e)
        result = { status: false, data: null, error: true }
    } finally {
        return result
    }
}

async function UpdateApprovalAccount(id, params = 
    { 
        email, 
        account, 
        dependant, 
        is_verified: "Pending", 
        verified_date: null, 
        otp_number: null, 
        otp_expired_date: null 
    }
) {
    let result = null
    try {
        let data = await db.update("account_approval", params, { id })
        if(data) {
            result = { status: true, data: data }
        } else {
            result = { status: false, data: null }
        }
    } catch (e) {
        console.log("[CreateApprovalAccount] error : ", e)
        result = { status: false }
    } finally {
        return result
    }
}

module.exports = {
    CheckAccountByEmail,
    AccountGetInfo,
    AccountCreate,
    AccountUpdate,
    AccountDelete,
    CreateApprovalAccount,
    CheckApprovalAccountByEmail,
    UpdateApprovalAccount
}