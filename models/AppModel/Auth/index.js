const db = require("../../../utils/sqlbuilder")

const sql_basic_auth    = `SELECT auth_id, auth_reference_key, auth_username, auth_usermail, auth_role, auth_is_verified, auth_otp, auth_status, account_id FROM auth_access`
const sql_full_auth     = `SELECT auth_id, auth_reference_key, auth_username, auth_usermail, auth_role, auth_socmed, auth_is_verified, auth_otp, auth_status, account_id, created_date FROM auth_access`

async function AuthCheckExistingUsername(username) {
    let result = null
    try {
        let data = await db.raw(`${sql_basic_auth} WHERE auth_status LIKE 'Active' AND ( auth_username LIKE ? OR auth_usermail LIKE ? ) LIMIT 1`, [username, username])
        if(data.length) {
            result = { status: true, data: data[0]}
        } else {
            result = { status: false, data: null }
        }
    } catch (e) {
        console.log("")
        result = { status: false, data: null }
    } finally {
        return result
    }
}

async function AuthCheckExistingEmail(email) {
    let result = null
    try {
        let data = await db.raw(`${sql_basic_auth} WHERE auth_status LIKE 'Active' AND ( auth_username LIKE ? OR auth_usermail LIKE ? ) LIMIT 1`, [email, email])
        if(data.length) {
            result = { status: true, data: data[0]}
        } else {
            result = { status: false, data: null }
        }
    } catch (e) {
        console.log("")
        result = { status: false, data: null }
    }    finally {
        return result
    } 
}

async function AuthGetAccessAccount(auth_id) {
    let result = null
    try {
        let data = await db.raw(`${sql_full_auth} WHERE auth_id LIKE ? LIMIT 1`, [auth_id])
        if(data.length) {
            result = { status: true, data: data[0]}
        } else {
            result = { status: false, data: null }
        }
    } catch (e) {
        console.log("")
        result = { status: false, data: null }
    }    finally {
        return result
    } 
}

async function AuthCreateAccessAccount(account) {
    let result = null
    try {
        let data = await db.insert('auth_access', account)
        if(data.insertId) {
            result = { status: true, data: data.insertId}
        } else {
            result = { status: false, data: null }
        }
    } catch (e) {
        console.log("error create access : ", e)
        result = { status: false, data: null }
    }    finally {
        return result
    } 
}

async function AuthUpdateAccessAccount(data) {
    let result = null
    try {
        let updatedData = await db.update('auth_access', data, { auth_id: data.auth_id })
        if(updatedData) {
            result = { status: true, data: updatedData}
        } else {
            result = { status: false, data: null }
        }
    } catch (e) {
        console.log("")
        result = { status: false, data: null }
    }    finally {
        return result
    } 
}

async function AuthLogin(account_id) {
    let result = null
    try {
        let sql     = `SELECT auth_id, auth_username, auth_usermail, auth_password, account_id FROM auth_access WHERE auth_status LIKE 'Active' AND auth_id LIKE ? LIMIT 1`
        let query   = await db.raw(sql, [account_id])
        if(query.length) {
            result = { status: true, data: query[0] }
        } else {
            result = { status: false, data: null }
        }
    } catch (e) {
        console.log("Syntax error at model auth login : ", e)
        result = { status: false, data: null }
    } finally {
        return result
    }
}

module.exports = {
    AuthCheckExistingUsername,
    AuthCheckExistingEmail,
    AuthGetAccessAccount,
    AuthCreateAccessAccount,
    AuthUpdateAccessAccount,
    AuthLogin
}