const db = require("../../../utils/sqlbuilder")
const crypto = require('crypto')

// Helper function to generate UUID v4
function generateUUID() {
    return crypto.randomUUID()
}

/**
 * Get paginated list of merchants with filters
 * @param {object} params - { page, limit, search, category, status, sortBy, sortOrder }
 * @returns {object} { status: boolean, data: { merchants: [], total: number, page: number, totalPages: number } }
 */
async function AdminGetMerchantsList(params = {}) {
    let result = null
    try {
        const page = parseInt(params.page) || 1
        const limit = parseInt(params.limit) || 20
        const offset = (page - 1) * limit
        const search = params.search || ''
        const category = params.category || ''
        const status = params.status || ''
        const sortBy = params.sortBy || 'created_date'
        const sortOrder = params.sortOrder || 'DESC'

        let whereConditions = []
        let queryParams = []

        // Search filter
        if (search) {
            whereConditions.push(`merchant_name LIKE ?`)
            const searchTerm = `%${search}%`
            queryParams.push(searchTerm)
        }

        // Category filter
        if (category) {
            whereConditions.push(`merchant_category = ?`)
            queryParams.push(category)
        }

        // Status filter
        if (status && status !== 'All') {
            whereConditions.push(`status = ?`)
            queryParams.push(status)
        }

        const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : ''

        // Get total count
        const countSql = `SELECT COUNT(*) as total FROM merchant ${whereClause}`
        const countResult = await db.raw(countSql, queryParams)
        const total = countResult[0].total

        // Get merchants with pagination
        const validSortColumns = ['merchant_id', 'merchant_name', 'merchant_category', 'status', 'created_date']
        const validSortBy = validSortColumns.includes(sortBy) ? sortBy : 'created_date'
        const validSortOrder = ['ASC', 'DESC'].includes(sortOrder.toUpperCase()) ? sortOrder.toUpperCase() : 'DESC'

        const sql = `
            SELECT 
                merchant_id, 
                merchant_uniq_no, 
                merchant_name, 
                merchant_category, 
                merchant_image, 
                status, 
                created_date, 
                last_modified 
            FROM merchant 
            ${whereClause} 
            ORDER BY ${validSortBy} ${validSortOrder} 
            LIMIT ${limit} OFFSET ${offset}
        `
        const merchants = await db.raw(sql, queryParams)

        const totalPages = Math.ceil(total / limit)

        result = {
            status: true,
            data: {
                merchants: merchants,
                total: total,
                page: page,
                totalPages: totalPages
            }
        }

        return result
    } catch (error) {
        console.log("Error at AdminGetMerchantsList: ", error)
        result = {
            status: false,
            message: error.message || 'Error fetching merchants list'
        }
        return result
    }
}

/**
 * Get merchant details by ID
 * @param {number} merchant_id - Merchant ID
 * @returns {object} { status: boolean, data: merchant object }
 */
async function AdminGetMerchantDetails(merchant_id) {
    let result = null
    try {
        const sql = `
            SELECT 
                merchant_id, 
                merchant_uniq_no, 
                merchant_name, 
                merchant_category, 
                merchant_image, 
                status, 
                created_date, 
                last_modified 
            FROM merchant 
            WHERE merchant_id = ?
        `
        const merchants = await db.raw(sql, [merchant_id])

        if (!merchants || merchants.length === 0) {
            result = {
                status: false,
                message: 'Merchant not found'
            }
            return result
        }

        result = {
            status: true,
            data: merchants[0]
        }

        return result
    } catch (error) {
        console.log("Error at AdminGetMerchantDetails: ", error)
        result = {
            status: false,
            message: error.message || 'Error fetching merchant details'
        }
        return result
    }
}

/**
 * Create a new merchant
 * @param {object} merchantData - { merchant_name, merchant_category, merchant_image }
 * @returns {object} { status: boolean, data: { merchant_id, merchant_uniq_no } }
 */
async function AdminCreateMerchant(merchantData) {
    let result = null
    try {
        const {
            merchant_name,
            merchant_category,
            merchant_image
        } = merchantData

        // Validate required fields
        if (!merchant_name || !merchant_category || !merchant_image) {
            result = {
                status: false,
                message: 'Merchant name, category, and image are required'
            }
            return result
        }

        const merchant_uniq_no = generateUUID()
        const status = 'Active'

        const sql = `
            INSERT INTO merchant 
            (merchant_uniq_no, merchant_name, merchant_category, merchant_image, status, created_date, last_modified) 
            VALUES (?, ?, ?, ?, ?, NOW(), NOW())
        `

        const insertResult = await db.raw(sql, [merchant_uniq_no, merchant_name, merchant_category, merchant_image, status])

        result = {
            status: true,
            data: {
                merchant_id: insertResult.insertId,
                merchant_uniq_no: merchant_uniq_no,
                message: 'Merchant created successfully'
            }
        }

        return result
    } catch (error) {
        console.log("Error at AdminCreateMerchant: ", error)
        result = {
            status: false,
            message: error.message || 'Error creating merchant'
        }
        return result
    }
}

/**
 * Update merchant details
 * @param {number} merchant_id - Merchant ID
 * @param {object} merchantData - { merchant_name, merchant_category, merchant_image }
 * @returns {object} { status: boolean }
 */
async function AdminUpdateMerchant(merchant_id, merchantData) {
    let result = null
    try {
        const {
            merchant_name,
            merchant_category,
            merchant_image
        } = merchantData

        // Check if merchant exists
        const checkSql = `SELECT merchant_id FROM merchant WHERE merchant_id = ?`
        const checkResult = await db.raw(checkSql, [merchant_id])

        if (!checkResult || checkResult.length === 0) {
            result = {
                status: false,
                message: 'Merchant not found'
            }
            return result
        }

        // Build update query dynamically based on provided fields
        let updateFields = []
        let updateParams = []

        if (merchant_name !== undefined && merchant_name !== null) {
            updateFields.push(`merchant_name = ?`)
            updateParams.push(merchant_name)
        }

        if (merchant_category !== undefined && merchant_category !== null) {
            updateFields.push(`merchant_category = ?`)
            updateParams.push(merchant_category)
        }

        if (merchant_image !== undefined && merchant_image !== null) {
            updateFields.push(`merchant_image = ?`)
            updateParams.push(merchant_image)
        }

        if (updateFields.length === 0) {
            result = {
                status: false,
                message: 'No fields to update'
            }
            return result
        }

        updateFields.push(`last_modified = NOW()`)
        updateParams.push(merchant_id)

        const sql = `UPDATE merchant SET ${updateFields.join(', ')} WHERE merchant_id = ?`

        await db.raw(sql, updateParams)

        result = {
            status: true,
            message: 'Merchant updated successfully'
        }

        return result
    } catch (error) {
        console.log("Error at AdminUpdateMerchant: ", error)
        result = {
            status: false,
            message: error.message || 'Error updating merchant'
        }
        return result
    }
}

/**
 * Update merchant status
 * @param {number} merchant_id - Merchant ID
 * @param {string} status - New status (Active, Inactive, Deleted)
 * @returns {object} { status: boolean }
 */
async function AdminUpdateMerchantStatus(merchant_id, status) {
    let result = null
    try {
        const validStatuses = ['Active', 'Inactive', 'Deleted', 'Others']

        if (!validStatuses.includes(status)) {
            result = {
                status: false,
                message: `Invalid status. Allowed: ${validStatuses.join(', ')}`
            }
            return result
        }

        // Check if merchant exists
        const checkSql = `SELECT merchant_id FROM merchant WHERE merchant_id = ?`
        const checkResult = await db.raw(checkSql, [merchant_id])

        if (!checkResult || checkResult.length === 0) {
            result = {
                status: false,
                message: 'Merchant not found'
            }
            return result
        }

        const sql = `UPDATE merchant SET status = ?, last_modified = NOW() WHERE merchant_id = ?`

        await db.raw(sql, [status, merchant_id])

        result = {
            status: true,
            message: 'Merchant status updated successfully'
        }

        return result
    } catch (error) {
        console.log("Error at AdminUpdateMerchantStatus: ", error)
        result = {
            status: false,
            message: error.message || 'Error updating merchant status'
        }
        return result
    }
}

/**
 * Delete merchant (soft delete)
 * @param {number} merchant_id - Merchant ID
 * @returns {object} { status: boolean }
 */
async function AdminDeleteMerchant(merchant_id) {
    let result = null
    try {
        // Check if merchant exists
        const checkSql = `SELECT merchant_id FROM merchant WHERE merchant_id = ?`
        const checkResult = await db.raw(checkSql, [merchant_id])

        if (!checkResult || checkResult.length === 0) {
            result = {
                status: false,
                message: 'Merchant not found'
            }
            return result
        }

        // Soft delete - mark as deleted
        const sql = `UPDATE merchant SET status = 'Deleted', last_modified = NOW() WHERE merchant_id = ?`

        await db.raw(sql, [merchant_id])

        result = {
            status: true,
            message: 'Merchant deleted successfully'
        }

        return result
    } catch (error) {
        console.log("Error at AdminDeleteMerchant: ", error)
        result = {
            status: false,
            message: error.message || 'Error deleting merchant'
        }
        return result
    }
}

/**
 * Get merchant count by status (for analytics)
 * @returns {object} { status: boolean, data: { total, active, inactive, deleted } }
 */
async function AdminGetMerchantStats() {
    let result = null
    try {
        const sql = `
            SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN status = 'Active' THEN 1 ELSE 0 END) as active,
                SUM(CASE WHEN status = 'Inactive' THEN 1 ELSE 0 END) as inactive,
                SUM(CASE WHEN status = 'Deleted' THEN 1 ELSE 0 END) as deleted
            FROM merchant
        `
        const stats = await db.raw(sql, [])

        if (!stats || stats.length === 0) {
            result = {
                status: true,
                data: {
                    total: 0,
                    active: 0,
                    inactive: 0,
                    deleted: 0
                }
            }
            return result
        }

        result = {
            status: true,
            data: {
                total: stats[0].total || 0,
                active: stats[0].active || 0,
                inactive: stats[0].inactive || 0,
                deleted: stats[0].deleted || 0
            }
        }

        return result
    } catch (error) {
        console.log("Error at AdminGetMerchantStats: ", error)
        result = {
            status: false,
            message: error.message || 'Error fetching merchant statistics'
        }
        return result
    }
}

module.exports = {
    AdminGetMerchantsList,
    AdminGetMerchantDetails,
    AdminCreateMerchant,
    AdminUpdateMerchant,
    AdminUpdateMerchantStatus,
    AdminDeleteMerchant,
    AdminGetMerchantStats
}
