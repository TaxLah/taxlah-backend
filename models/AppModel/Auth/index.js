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
        let data = await db.raw(`${sql_full_auth} WHERE auth_id LIKE ? AND auth_status LIKE 'Active' LIMIT 1`, [auth_id])
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

async function AuthCheckActiveStatus(account_id) {
    let result = null
    try {
        let data = await db.raw(
            `SELECT a.auth_status, acc.account_status
            FROM auth_access a
            INNER JOIN account acc ON acc.account_id = a.account_id
            WHERE a.account_id = ? AND acc.account_status = 'Active' AND a.auth_status = 'Active' LIMIT 1`,
            [account_id]
        )
        if (data.length && data[0].auth_status === 'Active' && data[0].account_status === 'Active') {
            result = { status: true }
        } else {
            result = { status: false }
        }
    } catch (e) {
        console.log("Syntax error at AuthCheckActiveStatus : ", e)
        result = { status: false }
    } finally {
        return result
    }
}

async function AuthDeleteAccount(account_id) {
    let result = null
    try {
        let sql = await db.update("auth_access", { auth_status: 'Suspended' }, { account_id })
        if(sql) {
            result = { status: true }
        } else {
            result = { status: false }
        }
    } catch (e) {
        console.log("Syntax error at delete auth account : ", e)
        result = { status: false }
    } finally {
        return result
    }
}

async function AuthGetByEmail(email) {
    let result = null
    try {
        let data = await db.raw(
            `SELECT auth_id, auth_username, auth_usermail, account_id
            FROM auth_access
            WHERE auth_usermail = ? AND auth_status = 'Active'
            LIMIT 1`,
            [email]
        )
        result = data.length ? { status: true, data: data[0] } : { status: false, data: null }
    } catch (e) {
        console.log('AuthGetByEmail error:', e)
        result = { status: false, data: null }
    } finally {
        return result
    }
}

async function AuthSetOtp(auth_id, otp) {
    let result = null
    try {
        await db.raw(
            `UPDATE auth_access SET auth_otp = ?, last_modified = NOW() WHERE auth_id = ?`,
            [otp, auth_id]
        )
        result = { status: true }
    } catch (e) {
        console.log('AuthSetOtp error:', e)
        result = { status: false }
    } finally {
        return result
    }
}

async function AuthVerifyOtp(email, otp) {
    let result = null
    try {
        let data = await db.raw(
            `SELECT auth_id, auth_otp
             FROM auth_access
             WHERE auth_usermail = ? AND auth_status = 'Active'
             LIMIT 1`,
            [email]
        )
        if (!data.length) {
            result = { status: false, message: 'Account not found.' }
        } else if (data[0].auth_otp !== otp) {
            result = { status: false, message: 'Invalid OTP.' }
        } else {
            result = { status: true, auth_id: data[0].auth_id }
        }
    } catch (e) {
        console.log('AuthVerifyOtp error:', e)
        result = { status: false, message: 'Server error.' }
    } finally {
        return result
    }
}

async function AuthResetPassword(auth_id, hashedPassword) {
    let result = null
    try {
        await db.raw(
            `UPDATE auth_access SET auth_password = ?, auth_otp = NULL, last_modified = NOW() WHERE auth_id = ?`,
            [hashedPassword, auth_id]
        )
        result = { status: true }
    } catch (e) {
        console.log('AuthResetPassword error:', e)
        result = { status: false }
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
    AuthLogin,
    AuthDeleteAccount,
    AuthGetByEmail,
    AuthSetOtp,
    AuthVerifyOtp,
    AuthResetPassword,
    AuthCheckActiveStatus,
}