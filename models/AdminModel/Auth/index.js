const db = require("../../../utils/sqlbuilder")

const sql_basic_admin_auth  = `SELECT aauth_id, aauth_reference_no, aauth_username, aauth_usermail, aauth_role, aauth_status, admin_id FROM admin_auth`
const sql_full_admin_auth   = `SELECT aauth_id, aauth_reference_no, aauth_username, aauth_usermail, aauth_role, aauth_status, admin_id, created_date FROM admin_auth`

/**
 * Check if admin username or email already exists
 * @param {string} username - Username or email to check
 * @returns {object} { status: boolean, data: object|null }
 */
async function AdminAuthCheckExistingUsername(username) {
    let result = null
    try {
        let data = await db.raw(`${sql_basic_admin_auth} WHERE aauth_status LIKE 'Active' AND ( aauth_username LIKE ? OR aauth_usermail LIKE ? ) LIMIT 1`, [username, username])
        if(data.length) {
            result = { status: true, data: data[0]}
        } else {
            result = { status: false, data: null }
        }
    } catch (e) {
        console.log("Error AdminAuthCheckExistingUsername: ", e)
        result = { status: false, data: null }
    } finally {
        return result
    }
}

/**
 * Check if admin email already exists
 * @param {string} email - Email to check
 * @returns {object} { status: boolean, data: object|null }
 */
async function AdminAuthCheckExistingEmail(email) {
    let result = null
    try {
        let data = await db.raw(`${sql_basic_admin_auth} WHERE aauth_status LIKE 'Active' AND ( aauth_username LIKE ? OR aauth_usermail LIKE ? ) LIMIT 1`, [email, email])
        if(data.length) {
            result = { status: true, data: data[0]}
        } else {
            result = { status: false, data: null }
        }
    } catch (e) {
        console.log("Error AdminAuthCheckExistingEmail: ", e)
        result = { status: false, data: null }
    } finally {
        return result
    } 
}

/**
 * Get admin auth access by ID
 * @param {number} aauth_id - Admin auth ID
 * @returns {object} { status: boolean, data: object|null }
 */
async function AdminAuthGetAccess(aauth_id) {
    let result = null
    try {
        let data = await db.raw(`${sql_full_admin_auth} WHERE aauth_id = ? LIMIT 1`, [aauth_id])
        if(data.length) {
            result = { status: true, data: data[0]}
        } else {
            result = { status: false, data: null }
        }
    } catch (e) {
        console.log("Error AdminAuthGetAccess: ", e)
        result = { status: false, data: null }
    } finally {
        return result
    } 
}

/**
 * Get admin auth access by username or email
 * @param {string} identifier - Username or email
 * @returns {object} { status: boolean, data: object|null }
 */
async function AdminAuthGetByIdentifier(identifier) {
    let result = null
    try {
        let sql = `SELECT aauth_id, aauth_reference_no, aauth_username, aauth_usermail, aauth_password, aauth_role, aauth_status, admin_id FROM admin_auth WHERE aauth_status = 'Active' AND (aauth_username = ? OR aauth_usermail = ?) LIMIT 1`
        let data = await db.raw(sql, [identifier, identifier])
        if(data.length) {
            result = { status: true, data: data[0]}
        } else {
            result = { status: false, data: null }
        }
    } catch (e) {
        console.log("Error AdminAuthGetByIdentifier: ", e)
        result = { status: false, data: null }
    } finally {
        return result
    } 
}

/**
 * Create admin auth access
 * @param {object} authData - Auth data object
 * @returns {object} { status: boolean, data: insertId|null }
 */
async function AdminAuthCreateAccess(authData) {
    let result = null
    try {
        let data = await db.insert('admin_auth', authData)
        if(data.insertId) {
            result = { status: true, data: data.insertId}
        } else {
            result = { status: false, data: null }
        }
    } catch (e) {
        console.log("Error AdminAuthCreateAccess: ", e)
        result = { status: false, data: null }
    } finally {
        return result
    } 
}

/**
 * Update admin auth access
 * @param {object} data - Data object with aauth_id
 * @returns {object} { status: boolean, data: affectedRows|null }
 */
async function AdminAuthUpdateAccess(data) {
    let result = null
    try {
        let updatedData = await db.update('admin_auth', data, { aauth_id: data.aauth_id })
        if(updatedData) {
            result = { status: true, data: updatedData}
        } else {
            result = { status: false, data: null }
        }
    } catch (e) {
        console.log("Error AdminAuthUpdateAccess: ", e)
        result = { status: false, data: null }
    } finally {
        return result
    } 
}

/**
 * Delete admin auth access (soft delete by setting status to Deleted)
 * @param {number} aauth_id - Admin auth ID
 * @returns {object} { status: boolean, data: affectedRows|null }
 */
async function AdminAuthDeleteAccess(aauth_id) {
    let result = null
    try {
        let data = await db.update('admin_auth', { aauth_status: 'Deleted' }, { aauth_id })
        if(data) {
            result = { status: true, data: data}
        } else {
            result = { status: false, data: null }
        }
    } catch (e) {
        console.log("Error AdminAuthDeleteAccess: ", e)
        result = { status: false, data: null }
    } finally {
        return result
    } 
}

module.exports = {
    AdminAuthCheckExistingUsername,
    AdminAuthCheckExistingEmail,
    AdminAuthGetAccess,
    AdminAuthGetByIdentifier,
    AdminAuthCreateAccess,
    AdminAuthUpdateAccess,
    AdminAuthDeleteAccess
}
