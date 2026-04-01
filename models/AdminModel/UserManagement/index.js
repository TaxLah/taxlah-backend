const db = require("../../../utils/sqlbuilder")

const sql_basic_account = `SELECT account_id, account_name, account_fullname, account_email, account_contact, account_status, created_date FROM account`
const sql_full_account  = `SELECT account_id, account_secret_key, account_name, account_fullname, account_email, account_contact, account_address_1, account_address_2, account_address_3, account_address_postcode, account_address_city, account_address_state, account_profile_image, account_status, created_date, last_modified FROM account`

/**
 * Get paginated list of users with filters
 * @param {object} params - { page, limit, search, status, sortBy, sortOrder }
 * @returns {object} { status: boolean, data: { users: [], total: number, page: number, totalPages: number } }
 */
async function AdminGetUsersList(params = {}) {
    let result = null
    try {
        const page = parseInt(params.page) || 1
        const limit = parseInt(params.limit) || 20
        const offset = (page - 1) * limit
        const search = params.search || ''
        const status = params.status || ''
        const sortBy = params.sortBy || 'created_date'
        const sortOrder = params.sortOrder || 'DESC'

        let whereConditions = []
        let queryParams = []

        // Search filter
        if (search) {
            whereConditions.push(`(account_name LIKE ? OR account_fullname LIKE ? OR account_email LIKE ? OR account_contact LIKE ?)`)
            const searchTerm = `%${search}%`
            queryParams.push(searchTerm, searchTerm, searchTerm, searchTerm)
        }

        // Status filter
        if (status && status !== 'All') {
            whereConditions.push(`account_status = ?`)
            queryParams.push(status)
        }

        const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : ''

        // Get total count
        const countSql = `SELECT COUNT(*) as total FROM account ${whereClause}`
        const countResult = await db.raw(countSql, queryParams)
        const total = countResult[0].total

        // Get users with pagination
        const validSortColumns = ['account_id', 'account_name', 'account_fullname', 'account_email', 'account_status', 'created_date']
        const validSortBy = validSortColumns.includes(sortBy) ? sortBy : 'created_date'
        const validSortOrder = ['ASC', 'DESC'].includes(sortOrder.toUpperCase()) ? sortOrder.toUpperCase() : 'DESC'

        const sql = `${sql_basic_account} ${whereClause} ORDER BY ${validSortBy} ${validSortOrder} LIMIT ${limit} OFFSET ${offset}`
        const users = await db.raw(sql, queryParams)

        const totalPages = Math.ceil(total / limit)

        result = {
            status: true,
            data: {
                users: users,
                total: total,
                page: page,
                limit: limit,
                totalPages: totalPages
            }
        }
    } catch (e) {
        console.log("Error AdminGetUsersList: ", e)
        result = { status: false, data: null }
    } finally {
        return result
    }
}

/**
 * Get single user details by ID with auth info
 * @param {number} account_id - User account ID
 * @returns {object} { status: boolean, data: object|null }
 */
async function AdminGetUserDetails(account_id) {
    let result = null
    try {
        const sql = `
            SELECT 
                a.account_id, a.account_secret_key, a.account_name, a.account_fullname, 
                a.account_email, a.account_contact, a.account_address_1, a.account_address_2, 
                a.account_address_3, a.account_address_postcode, a.account_address_city, 
                a.account_address_state, a.account_profile_image, a.account_status, 
                a.created_date, a.last_modified, a.account_ic, a.account_gender, a.account_dob, a.account_age, a.account_nationality, a.account_salary_range,
                auth.auth_id, auth.auth_username, auth.auth_usermail, auth.auth_role, 
                auth.auth_is_verified, auth.auth_status as auth_status
            FROM account a
            LEFT JOIN auth_access auth ON a.account_id = auth.account_id
            WHERE a.account_id = ?
            LIMIT 1
        `
        const data = await db.raw(sql, [account_id])
        
        if(data.length) {
            result = { status: true, data: data[0] }
        } else {
            result = { status: false, data: null }
        }
    } catch (e) {
        console.log("Error AdminGetUserDetails: ", e)
        result = { status: false, data: null }
    } finally {
        return result
    }
}

/**
 * Update user account status
 * @param {number} account_id - User account ID
 * @param {string} status - New status (Pending, Active, Suspended, Others)
 * @returns {object} { status: boolean, data: affectedRows|null }
 */
async function AdminUpdateUserStatus(account_id, status) {
    let result = null
    try {
        const validStatuses = ['Pending', 'Active', 'Suspended', 'Others']
        if (!validStatuses.includes(status)) {
            throw new Error('Invalid status value')
        }

        const data = await db.update('account', { account_status: status }, { account_id })
        
        if(data) {
            result = { status: true, data: data }
        } else {
            result = { status: false, data: null }
        }
    } catch (e) {
        console.log("Error AdminUpdateUserStatus: ", e)
        result = { status: false, data: null }
    } finally {
        return result
    }
}

/**
 * Update user profile information
 * @param {number} account_id - User account ID
 * @param {object} updateData - Data to update
 * @returns {object} { status: boolean, data: affectedRows|null }
 */
async function AdminUpdateUserProfile(account_id, updateData) {
    let result = null
    try {
        updateData.account_id = account_id
        const data = await db.update('account', updateData, { account_id })
        
        if(data) {
            result = { status: true, data: data }
        } else {
            result = { status: false, data: null }
        }
    } catch (e) {
        console.log("Error AdminUpdateUserProfile: ", e)
        result = { status: false, data: null }
    } finally {
        return result
    }
}

/**
 * Delete user account (CASCADE will delete auth_access, devices, etc.)
 * @param {number} account_id - User account ID
 * @returns {object} { status: boolean, data: affectedRows|null }
 */
async function AdminDeleteUser(account_id) {
    let result = null
    try {
        const data = await db.delete('account', { account_id })
        
        if(data) {
            result = { status: true, data: data }
        } else {
            result = { status: false, data: null }
        }
    } catch (e) {
        console.log("Error AdminDeleteUser: ", e)
        result = { status: false, data: null }
    } finally {
        return result
    }
}

/**
 * Get user statistics
 * @returns {object} { status: boolean, data: object|null }
 */
async function AdminGetUserStats() {
    let result = null
    try {
        const sql = `
            SELECT 
                COUNT(*) as total_users,
                SUM(CASE WHEN account_status = 'Active' THEN 1 ELSE 0 END) as active_users,
                SUM(CASE WHEN account_status = 'Pending' THEN 1 ELSE 0 END) as pending_users,
                SUM(CASE WHEN account_status = 'Suspended' THEN 1 ELSE 0 END) as suspended_users,
                SUM(CASE WHEN DATE(created_date) = CURDATE() THEN 1 ELSE 0 END) as new_today,
                SUM(CASE WHEN YEARWEEK(created_date, 1) = YEARWEEK(CURDATE(), 1) THEN 1 ELSE 0 END) as new_this_week,
                SUM(CASE WHEN MONTH(created_date) = MONTH(CURDATE()) AND YEAR(created_date) = YEAR(CURDATE()) THEN 1 ELSE 0 END) as new_this_month
            FROM account
        `
        const data = await db.raw(sql)
        
        if(data.length) {
            result = { status: true, data: data[0] }
        } else {
            result = { status: false, data: null }
        }
    } catch (e) {
        console.log("Error AdminGetUserStats: ", e)
        result = { status: false, data: null }
    } finally {
        return result
    }
}

/**
 * Get user activity logs (from account_logs table)
 * @param {number} account_id - User account ID
 * @param {number} limit - Number of logs to retrieve
 * @returns {object} { status: boolean, data: array|null }
 */
async function AdminGetUserActivityLogs(account_id, limit = 50) {
    let result = null
    try {
        const limitInt = parseInt(limit) || 50
        const sql = `SELECT * FROM account_logs WHERE account_id = ? ORDER BY last_modified DESC LIMIT ${limitInt}`
        const data = await db.raw(sql, [account_id])
        
        result = { status: true, data: data }
    } catch (e) {
        console.log("Error AdminGetUserActivityLogs: ", e)
        result = { status: false, data: null }
    } finally {
        return result
    }
}

module.exports = {
    AdminGetUsersList,
    AdminGetUserDetails,
    AdminUpdateUserStatus,
    AdminUpdateUserProfile,
    AdminDeleteUser,
    AdminGetUserStats,
    AdminGetUserActivityLogs
}
