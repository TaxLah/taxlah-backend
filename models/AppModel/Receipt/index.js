const db = require("../../../utils/sqlbuilder")

/**
 * Get paginated list of receipts for a user
 * @param {number} account_id - User account ID
 * @param {object} params - { page, limit, search, rc_id, status, sortBy, sortOrder }
 * @returns {object} { status: boolean, data: { receipts: [], total: number, page: number, totalPages: number } }
 */
async function GetReceiptsList(account_id, params = {}) {
    let result = null
    try {
        const page = parseInt(params.page) || 1
        const limit = parseInt(params.limit) || 20
        const offset = (page - 1) * limit
        const search = params.search || ''
        const rc_id = params.rc_id || ''
        const status = params.status || ''
        const sortBy = params.sortBy || 'created_date'
        const sortOrder = params.sortOrder || 'DESC'

        let whereConditions = [`r.account_id = ?`]
        let queryParams = [account_id]

        // Search filter
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

        const whereClause = `WHERE ${whereConditions.join(' AND ')}`

        // Get total count
        const countSql = `
            SELECT COUNT(*) as total 
            FROM receipt r 
            ${whereClause}
        `
        const countResult = await db.raw(countSql, queryParams)
        const total = countResult[0].total

        // Get receipts with pagination
        const validSortColumns = ['receipt_id', 'receipt_name', 'receipt_amount', 'created_date']
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
                r.rc_id,
                rc.rc_name as category_name,
                r.status, 
                r.created_date, 
                r.last_modified 
            FROM receipt r
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
        console.log("Error GetReceiptsList: ", e)
        result = { status: false, data: null }
    } finally {
        return result
    }
}

/**
 * Get single receipt details by ID for a specific user
 * @param {number} receipt_id - Receipt ID
 * @param {number} account_id - User account ID
 * @returns {object} { status: boolean, data: object|null }
 */
async function GetReceiptDetails(receipt_id, account_id) {
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
                r.rc_id,
                rc.rc_name as category_name,
                rc.rc_description as category_description,
                r.status, 
                r.created_date, 
                r.last_modified 
            FROM receipt r
            LEFT JOIN receipt_category rc ON r.rc_id = rc.rc_id
            WHERE r.receipt_id = ? AND r.account_id = ? AND r.status != 'Deleted'
            LIMIT 1
        `
        const data = await db.raw(sql, [receipt_id, account_id])
        
        if(data.length) {
            result = { status: true, data: data[0] }
        } else {
            result = { status: false, data: null }
        }
    } catch (e) {
        console.log("Error GetReceiptDetails: ", e)
        result = { status: false, data: null }
    } finally {
        return result
    }
}

/**
 * Create new receipt
 * @param {object} receiptData - Receipt data object
 * @returns {object} { status: boolean, data: insertId|null }
 */
async function CreateReceipt(receiptData) {
    let result = null
    try {
        const data = await db.insert('receipt', receiptData)
        
        if(data.insertId) {
            result = { status: true, data: data.insertId }
        } else {
            result = { status: false, data: null }
        }
    } catch (e) {
        console.log("Error CreateReceipt: ", e)
        result = { status: false, data: null }
    } finally {
        return result
    }
}

/**
 * Update receipt
 * @param {number} receipt_id - Receipt ID
 * @param {number} account_id - User account ID
 * @param {object} updateData - Data to update
 * @returns {object} { status: boolean, data: affectedRows|null }
 */
async function UpdateReceipt(receipt_id, account_id, updateData) {
    let result = null
    try {
        updateData.receipt_id = receipt_id
        const data = await db.update('receipt', updateData, { receipt_id, account_id })
        
        if(data) {
            result = { status: true, data: data }
        } else {
            result = { status: false, data: null }
        }
    } catch (e) {
        console.log("Error UpdateReceipt: ", e)
        result = { status: false, data: null }
    } finally {
        return result
    }
}

/**
 * Delete receipt (soft delete)
 * @param {number} receipt_id - Receipt ID
 * @param {number} account_id - User account ID
 * @returns {object} { status: boolean, data: affectedRows|null }
 */
async function DeleteReceipt(receipt_id, account_id) {
    let result = null
    try {
        const updateData = {
            receipt_id: receipt_id,
            status: 'Deleted'
        }
        const data = await db.update('receipt', updateData, { receipt_id, account_id })
        
        if(data) {
            result = { status: true, data: data }
        } else {
            result = { status: false, data: null }
        }
    } catch (e) {
        console.log("Error DeleteReceipt: ", e)
        result = { status: false, data: null }
    } finally {
        return result
    }
}

/**
 * Get receipt statistics for a user
 * @param {number} account_id - User account ID
 * @returns {object} { status: boolean, data: object|null }
 */
async function GetReceiptStats(account_id) {
    let result = null
    try {
        const sql = `
            SELECT 
                COUNT(*) as total_receipts,
                COUNT(CASE WHEN status = 'Active' THEN 1 END) as active_receipts,
                COUNT(CASE WHEN status = 'Inactive' THEN 1 END) as inactive_receipts,
                SUM(receipt_amount) as total_amount,
                AVG(receipt_amount) as average_amount
            FROM receipt 
            WHERE account_id = ? AND status != 'Deleted'
        `
        const data = await db.raw(sql, [account_id])
        
        if(data.length) {
            result = { status: true, data: data[0] }
        } else {
            result = { status: false, data: null }
        }
    } catch (e) {
        console.log("Error GetReceiptStats: ", e)
        result = { status: false, data: null }
    } finally {
        return result
    }
}

module.exports = {
    GetReceiptsList,
    GetReceiptDetails,
    CreateReceipt,
    UpdateReceipt,
    DeleteReceipt,
    GetReceiptStats
}
