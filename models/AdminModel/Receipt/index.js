const db = require("../../../utils/sqlbuilder")

/**
 * Get paginated list of all receipts (across all users) for admin
 * @param {object} params - { page, limit, search, account_id, rc_id, status, sortBy, sortOrder }
 * @returns {object} { status: boolean, data: { receipts: [], total: number, page: number, totalPages: number } }
 */
async function AdminGetReceiptsList(params = {}) {
    let result = null
    try {
        const page = parseInt(params.page) || 1
        const limit = parseInt(params.limit) || 20
        const offset = (page - 1) * limit
        const search = params.search || ''
        const account_id = params.account_id || ''
        const rc_id = params.rc_id || ''
        const status = params.status || ''
        const sortBy = params.sortBy || 'created_date'
        const sortOrder = params.sortOrder || 'DESC'

        let whereConditions = []
        let queryParams = []

        // User filter (admin can filter by specific user)
        if (account_id) {
            whereConditions.push(`r.account_id = ?`)
            queryParams.push(account_id)
        }

        // Search filter (receipt name or description)
        if (search) {
            whereConditions.push(`(r.receipt_name LIKE ? OR r.receipt_description LIKE ?)`)
            const searchTerm = `%${search}%`
            queryParams.push(searchTerm, searchTerm)
        }

        // Category filter
        if (rc_id) {
            whereConditions.push(`r.rc_id = ?`)
            queryParams.push(rc_id)
        }

        // Status filter
        if (status && status !== 'All') {
            whereConditions.push(`r.status = ?`)
            queryParams.push(status)
        } else {
            // By default, exclude deleted receipts
            whereConditions.push(`r.status != 'Deleted'`)
        }

        const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : ''

        // Get total count
        const countSql = `
            SELECT COUNT(*) as total 
            FROM receipt r 
            ${whereClause}
        `
        const countResult = await db.raw(countSql, queryParams)
        const total = countResult[0].total

        // Get receipts with pagination
        const validSortColumns = ['receipt_id', 'receipt_name', 'receipt_amount', 'created_date', 'account_id']
        const validSortBy = validSortColumns.includes(sortBy) ? sortBy : 'created_date'
        const validSortOrder = ['ASC', 'DESC'].includes(sortOrder.toUpperCase()) ? sortOrder.toUpperCase() : 'DESC'

        const sql = `
            SELECT 
                r.receipt_id, 
                r.receipt_name, 
                r.receipt_description, 
                r.receipt_amount, 
                r.receipt_items,
                r.receipt_image_url, 
                r.account_id,
                a.account_name as user_name,
                a.account_email as user_email,
                r.rc_id,
                rc.rc_name as category_name,
                r.status, 
                r.created_date, 
                r.last_modified 
            FROM receipt r
            LEFT JOIN account a ON r.account_id = a.account_id
            LEFT JOIN receipt_category rc ON r.rc_id = rc.rc_id
            ${whereClause} 
            ORDER BY r.${validSortBy} ${validSortOrder} 
            LIMIT ${limit} OFFSET ${offset}
        `
        const receipts = await db.raw(sql, queryParams)

        const totalPages = Math.ceil(total / limit)

        result = {
            status: true,
            data: {
                receipts: receipts,
                total: total,
                page: page,
                limit: limit,
                totalPages: totalPages
            }
        }
    } catch (e) {
        console.log("Error AdminGetReceiptsList: ", e)
        result = { status: false, data: null }
    } finally {
        return result
    }
}

/**
 * Get single receipt details by receipt ID (admin view includes user info)
 * @param {number} receipt_id - Receipt ID
 * @returns {object} { status: boolean, data: object|null }
 */
async function AdminGetReceiptDetails(receipt_id) {
    let result = null
    try {
        const sql = `
            SELECT 
                r.receipt_id, 
                r.receipt_name, 
                r.receipt_description, 
                r.receipt_amount, 
                r.receipt_items,
                r.receipt_image_url, 
                r.account_id,
                a.account_name as user_name,
                a.account_email as user_email,
                a.account_contact as user_contact,
                r.rc_id,
                rc.rc_name as category_name,
                rc.rc_description as category_description,
                r.status, 
                r.created_date, 
                r.last_modified 
            FROM receipt r
            LEFT JOIN account a ON r.account_id = a.account_id
            LEFT JOIN receipt_category rc ON r.rc_id = rc.rc_id
            WHERE r.receipt_id = ? 
            LIMIT 1
        `
        const data = await db.raw(sql, [receipt_id])
        
        if(data.length) {
            result = { status: true, data: data[0] }
        } else {
            result = { status: false, data: null }
        }
    } catch (e) {
        console.log("Error AdminGetReceiptDetails: ", e)
        result = { status: false, data: null }
    } finally {
        return result
    }
}

/**
 * Update receipt details (admin can update any receipt)
 * @param {number} receipt_id - Receipt ID
 * @param {object} updateData - { receipt_name, receipt_description, receipt_amount, rc_id, status, receipt_items, receipt_image_url }
 * @returns {object} { status: boolean, data: object|null }
 */
async function AdminUpdateReceipt(receipt_id, updateData = {}) {
    let result = null
    try {
        const updates = []
        const values = []

        if (updateData.receipt_name !== undefined) {
            updates.push(`receipt_name = ?`)
            values.push(updateData.receipt_name)
        }

        if (updateData.receipt_description !== undefined) {
            updates.push(`receipt_description = ?`)
            values.push(updateData.receipt_description)
        }

        if (updateData.receipt_amount !== undefined) {
            updates.push(`receipt_amount = ?`)
            values.push(updateData.receipt_amount)
        }

        if (updateData.rc_id !== undefined) {
            updates.push(`rc_id = ?`)
            values.push(updateData.rc_id)
        }

        if (updateData.receipt_items !== undefined) {
            updates.push(`receipt_items = ?`)
            values.push(JSON.stringify(updateData.receipt_items))
        }

        if (updateData.receipt_image_url !== undefined) {
            updates.push(`receipt_image_url = ?`)
            values.push(updateData.receipt_image_url)
        }

        if (updateData.status !== undefined) {
            updates.push(`status = ?`)
            values.push(updateData.status)
        }

        if (updates.length === 0) {
            return { status: false, data: null }
        }

        updates.push(`last_modified = NOW()`)

        const sql = `UPDATE receipt SET ${updates.join(', ')} WHERE receipt_id = ?`
        values.push(receipt_id)

        await db.raw(sql, values)

        // Fetch and return updated receipt
        const getResult = await AdminGetReceiptDetails(receipt_id)
        result = getResult

    } catch (e) {
        console.log("Error AdminUpdateReceipt: ", e)
        result = { status: false, data: null }
    } finally {
        return result
    }
}

/**
 * Update receipt status (admin can change status of any receipt)
 * @param {number} receipt_id - Receipt ID
 * @param {string} status - Status: Active, Inactive, Deleted, Others
 * @returns {object} { status: boolean, message: string }
 */
async function AdminUpdateReceiptStatus(receipt_id, status) {
    let result = null
    try {
        const validStatuses = ['Active', 'Inactive', 'Deleted', 'Others']
        
        if (!validStatuses.includes(status)) {
            return { status: false, message: `Invalid status. Must be one of: ${validStatuses.join(', ')}` }
        }

        const sql = `UPDATE receipt SET status = ?, last_modified = NOW() WHERE receipt_id = ?`
        
        await db.raw(sql, [status, receipt_id])

        result = { status: true, message: `Receipt status updated to ${status}` }

    } catch (e) {
        console.log("Error AdminUpdateReceiptStatus: ", e)
        result = { status: false, message: "Failed to update receipt status" }
    } finally {
        return result
    }
}

/**
 * Soft delete receipt (set status to Deleted)
 * @param {number} receipt_id - Receipt ID
 * @returns {object} { status: boolean, message: string }
 */
async function AdminDeleteReceipt(receipt_id) {
    let result = null
    try {
        const sql = `UPDATE receipt SET status = 'Deleted', last_modified = NOW() WHERE receipt_id = ?`
        
        await db.raw(sql, [receipt_id])

        result = { status: true, message: 'Receipt deleted successfully' }

    } catch (e) {
        console.log("Error AdminDeleteReceipt: ", e)
        result = { status: false, message: 'Failed to delete receipt' }
    } finally {
        return result
    }
}

/**
 * Get receipt statistics (admin overview)
 * @returns {object} { status: boolean, data: { total, active, inactive, deleted } }
 */
async function AdminGetReceiptStats() {
    let result = null
    try {
        const sql = `
            SELECT 
                COUNT(*) as total,
                COALESCE(SUM(CASE WHEN status = 'Active' THEN 1 ELSE 0 END), 0) as active,
                COALESCE(SUM(CASE WHEN status = 'Inactive' THEN 1 ELSE 0 END), 0) as inactive,
                COALESCE(SUM(CASE WHEN status = 'Deleted' THEN 1 ELSE 0 END), 0) as deleted
            FROM receipt
        `
        const data = await db.raw(sql, [])
        
        result = { 
            status: true, 
            data: data[0] || { total: 0, active: 0, inactive: 0, deleted: 0 }
        }
    } catch (e) {
        console.log("Error AdminGetReceiptStats: ", e)
        result = { status: false, data: null }
    } finally {
        return result
    }
}

module.exports = {
    AdminGetReceiptsList,
    AdminGetReceiptDetails,
    AdminUpdateReceipt,
    AdminUpdateReceiptStatus,
    AdminDeleteReceipt,
    AdminGetReceiptStats
}
