const db = require("../../../utils/sqlbuilder")

const sql_basic_account = `
    SELECT
        a.account_id,
        a.account_name,
        a.account_fullname,
        a.account_email,
        a.account_contact,
        a.account_status,
        a.account_is_employed,
        a.account_is_tax_declared,
        a.created_date,
        (SELECT COUNT(*) FROM account_expenses ae WHERE ae.account_id = a.account_id) AS total_expenses,
        (SELECT COUNT(*) FROM account_dependant ad WHERE ad.account_id = a.account_id) AS total_dependants
    FROM account a`
const sql_full_account  = `SELECT account_id, account_secret_key, account_name, account_fullname, account_email, account_contact, account_address_1, account_address_2, account_address_3, account_address_postcode, account_address_city, account_address_state, account_profile_image, account_status, created_date, last_modified FROM account`

/**
 * Get paginated list of users with filters
 * @param {object} params - { page, limit, search, status, sortBy, sortOrder }
 * @returns {object} { status: boolean, data: { users: [], total: number, page: number, totalPages: number } }
 */
async function AdminGetUsersList(params = {}) {
    let result = null
    try {
        const page      = Math.max(1, parseInt(params.page)  || 1)
        const limit     = Math.min(100, Math.max(1, parseInt(params.limit) || 20))
        const search    = params.search    || ''
        const status    = params.status    || ''
        const sortBy    = params.sortBy    || 'account_id'
        const sortOrder = params.sortOrder || 'DESC'

        const validSortColumns  = ['account_id', 'account_name', 'account_fullname', 'account_email', 'account_status', 'created_date', 'account_is_employed', 'account_is_tax_declared']
        const validSortBy       = validSortColumns.includes(sortBy) ? sortBy : 'account_id'
        const validSortOrder    = ['ASC', 'DESC'].includes(sortOrder.toUpperCase()) ? sortOrder.toUpperCase() : 'DESC'

        // Secondary sort by account_id ensures a stable, deterministic order when sortBy is not account_id.
        // Since account has no deletions, account_id is monotonically increasing and safe to use as a tiebreaker.
        const secondarySort = validSortBy !== 'account_id' ? `, account_id ${validSortOrder}` : ''
        const orderClause   = `ORDER BY ${validSortBy} ${validSortOrder}${secondarySort}`

        // --- Build filter conditions (search, status) ---
        let filterConditions = []
        let filterParams     = []

        // Search filter
        if (search) {
            filterConditions.push(`(a.account_name LIKE ? OR a.account_fullname LIKE ? OR a.account_email LIKE ? OR a.account_contact LIKE ?)`)
            const searchTerm = `%${search}%`
            filterParams.push(searchTerm, searchTerm, searchTerm, searchTerm)
        }

        // Status filter
        if (status && status !== 'All') {
            filterConditions.push(`a.account_status = ?`)
            filterParams.push(status)
        }

        const filterClause = filterConditions.length > 0 ? `WHERE ${filterConditions.join(' AND ')}` : ''

        // --- Total count (filter only, no cursor) ---
        const countResult = await db.raw(`SELECT COUNT(*) as total FROM account a ${filterClause}`, filterParams)
        const total       = countResult[0].total
        const totalPages  = Math.ceil(total / limit)

        // --- Cursor Pagination ---
        // Algorithm: derive the cursor from page + limit without storing a cursor token.
        // Since account rows are never deleted, account_id increases monotonically.
        //
        // For page 1  → no cursor condition needed; fetch the first `limit` rows.
        // For page N  → find the account_id of the LAST row of the previous page via a
        //               lightweight subquery on the PK only (fast index-only scan), then
        //               add a WHERE clause on account_id so the main query uses an index
        //               range scan instead of a full OFFSET scan.
        //
        //   prevPageLastRowOffset = (page - 1) * limit - 1   (0-based index of that row)
        //
        //   Subquery:
        //     SELECT account_id FROM account
        //     [filterClause]
        //     ORDER BY [sortBy] [sortOrder], account_id [sortOrder]
        //     LIMIT 1 OFFSET prevPageLastRowOffset
        //
        //   Cursor condition:
        //     account_id < cursorId   (for DESC)
        //     account_id > cursorId   (for ASC)

        let cursorConditions = [...filterConditions]
        let mainQueryParams  = [...filterParams]
        let whereClause      = filterClause

        if (page > 1) {
            // MySQL prepared statements do not allow ? placeholders inside LIMIT/OFFSET
            // of a subquery. The offset is a computed integer (never user input), so it
            // is safe to inline directly into the SQL string.
            const prevPageLastRowOffset = (page - 1) * limit - 1
            const cursorOp = validSortOrder === 'DESC' ? '<' : '>'

            // Subquery fetches only account_id (PK) — avoids reading full row data.
            // OFFSET is inlined as a literal integer — not a bind parameter.
            const cursorSubquery = `(SELECT account_id FROM account a ${filterClause} ${orderClause} LIMIT 1 OFFSET ${prevPageLastRowOffset})`

            cursorConditions.push(`a.account_id ${cursorOp} ${cursorSubquery}`)

            // Params: outer filter params + inner subquery filter params (no offset param)
            mainQueryParams = [...filterParams, ...filterParams]

            whereClause = `WHERE ${cursorConditions.join(' AND ')}`
        }

        // --- Main query — no OFFSET, cursor WHERE clause drives an index range scan ---
        const sql   = `${sql_basic_account} ${whereClause} ${orderClause} LIMIT ${limit}`

        const users = await db.raw(sql, mainQueryParams)

        result = {
            status: true,
            data: {
                users:       users,
                total:       total,
                page:        page,
                limit:       limit,
                totalPages:  totalPages,
                hasNextPage: page < totalPages,
                hasPrevPage: page > 1
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
                a.*,
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
        const data = await db.update('account', 
            { account_status: "Suspended", account_verified: "Unverified", is_deleted: 1 }, 
            { account_id }
        )
        
        if(data) {
            await db.update("auth_access", 
                { auth_is_verified: "No", auth_status: "Suspended", is_deleted: 1 }, 
                { account_id }
            )
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

/**
 * Get paginated approval list for a user by account_id (joined via email)
 * @param {number} account_id
 * @param {object} params - { page, limit, is_verified }
 */
async function AdminGetUserApprovalList(account_id, params = {}) {
    let result = null
    try {
        const page   = Math.max(1, parseInt(params.page)  || 1)
        const limit  = Math.min(100, Math.max(1, parseInt(params.limit) || 20))
        const offset = (page - 1) * limit

        const filterConditions = ['aa.email = (SELECT account_email FROM account WHERE account_id = ? LIMIT 1)', 'aa.is_deleted = 0']
        const filterParams     = [account_id]

        if (params.is_verified) {
            filterConditions.push('aa.is_verified = ?')
            filterParams.push(params.is_verified)
        }

        const whereClause = `WHERE ${filterConditions.join(' AND ')}`

        const total      = (await db.raw(`SELECT COUNT(*) AS total FROM account_approval aa ${whereClause}`, filterParams))[0].total
        const totalPages = Math.ceil(total / limit)

        const rows = await db.raw(
            `SELECT
                aa.id,
                aa.email,
                aa.is_verified,
                aa.verified_date,
                aa.otp_expired_date,
                aa.created_at,
                aa.last_modified
            FROM account_approval aa
            ${whereClause}
            ORDER BY aa.created_at DESC
            LIMIT ${limit} OFFSET ${offset}`,
            filterParams
        )

        result = {
            status: true,
            data: {
                approvals:   rows,
                total,
                page,
                limit,
                totalPages,
                hasNextPage: page < totalPages,
                hasPrevPage: page > 1
            }
        }
    } catch (e) {
        console.error('Error AdminGetUserApprovalList:', e)
        result = { status: false, data: null }
    }
    return result
}

/**
 * Get paginated subscription payment history for a user
 * @param {number} account_id
 * @param {object} params - { page, limit, status, payment_gateway }
 */
async function AdminGetUserSubscriptionPayments(account_id, params = {}) {
    let result = null
    try {
        const page    = Math.max(1, parseInt(params.page)  || 1)
        const limit   = Math.min(100, Math.max(1, parseInt(params.limit) || 20))
        // OFFSET and LIMIT cannot be bind params in MySQL prepared statements — inline as integers
        const offset  = (page - 1) * limit

        const filterConditions = ['sp.account_id = ?']
        const filterParams     = [account_id]

        if (params.status) {
            filterConditions.push('sp.payment_status = ?')
            filterParams.push(params.status)
        }

        if (params.payment_gateway) {
            filterConditions.push('sp.payment_gateway = ?')
            filterParams.push(params.payment_gateway)
        }

        const whereClause = `WHERE ${filterConditions.join(' AND ')}`

        const total       = (await db.raw(`SELECT COUNT(*) AS total FROM subscription_payment sp ${whereClause}`, filterParams))[0].total
        const totalPages  = Math.ceil(total / limit)

        const rows = await db.raw(
            `SELECT
                sp.payment_id,
                sp.subscription_id,
                sp.payment_ref,
                sp.amount,
                sp.currency,
                sp.period_start,
                sp.period_end,
                sp.payment_gateway,
                sp.gateway_transaction_id,
                sp.payment_status,
                sp.created_date,
                sp.paid_date,
                sp.failed_date,
                sp.refunded_date
            FROM subscription_payment sp
            ${whereClause}
            ORDER BY sp.created_date DESC
            LIMIT ${limit} OFFSET ${offset}`,
            filterParams
        )

        result = {
            status: true,
            data: {
                payments:    rows,
                total,
                page,
                limit,
                totalPages,
                hasNextPage: page < totalPages,
                hasPrevPage: page > 1
            }
        }
    } catch (e) {
        console.error('Error AdminGetUserSubscriptionPayments:', e)
        result = { status: false, data: null }
    }
    return result
}

module.exports = {
    AdminGetUsersList,
    AdminGetUserDetails,
    AdminUpdateUserStatus,
    AdminUpdateUserProfile,
    AdminDeleteUser,
    AdminGetUserStats,
    AdminGetUserActivityLogs,
    AdminGetUserSubscriptionPayments,
    AdminGetUserApprovalList
}
