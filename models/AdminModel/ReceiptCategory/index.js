const db = require("../../../utils/sqlbuilder")

/**
 * Get paginated list of all receipt categories (admin management)
 * @param {object} params - { page, limit, search, status, sortBy, sortOrder }
 * @returns {object} { status: boolean, data: { categories: [], total: number, page: number, totalPages: number } }
 */
async function AdminGetReceiptCategoriesList(params = {}) {
    let result = null
    try {
        const page = parseInt(params.page) || 1
        const limit = parseInt(params.limit) || 20
        const offset = (page - 1) * limit
        const search = params.search || ''
        const status = params.status || ''
        const sortBy = params.sortBy || 'rc_id'
        const sortOrder = params.sortOrder || 'ASC'

        let whereConditions = []
        let queryParams = []

        // Search filter
        if (search) {
            whereConditions.push(`(rc_name LIKE ? OR rc_description LIKE ?)`)
            const searchTerm = `%${search}%`
            queryParams.push(searchTerm, searchTerm)
        }

        // Status filter
        if (status && status !== 'All') {
            whereConditions.push(`status = ?`)
            queryParams.push(status)
        }

        const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : ''

        // Get total count
        const countSql = `
            SELECT COUNT(*) as total 
            FROM receipt_category 
            ${whereClause}
        `
        const countResult = await db.raw(countSql, queryParams)
        const total = countResult[0].total

        // Get categories with pagination
        const validSortColumns = ['rc_id', 'rc_name', 'created_date', 'status']
        const validSortBy = validSortColumns.includes(sortBy) ? sortBy : 'rc_name'
        const validSortOrder = ['ASC', 'DESC'].includes(sortOrder.toUpperCase()) ? sortOrder.toUpperCase() : 'ASC'

        const sql = `
            SELECT 
                rc_id, 
                rc_name, 
                rc_description, 
                status, 
                created_date, 
                last_modified 
            FROM receipt_category 
            ${whereClause} 
            ORDER BY ${validSortBy} ${validSortOrder} 
            LIMIT ${limit} OFFSET ${offset}
        `
        const categories = await db.raw(sql, queryParams)

        const totalPages = Math.ceil(total / limit)

        result = {
            status: true,
            data: {
                categories: categories,
                total: total,
                page: page,
                limit: limit,
                totalPages: totalPages
            }
        }
    } catch (e) {
        console.log("Error AdminGetReceiptCategoriesList: ", e)
        result = { status: false, data: null }
    } finally {
        return result
    }
}

/**
 * Get single receipt category details by ID
 * @param {number} rc_id - Receipt category ID
 * @returns {object} { status: boolean, data: object|null }
 */
async function AdminGetReceiptCategoryDetails(rc_id) {
    let result = null
    try {
        const sql = `
            SELECT 
                rc_id, 
                rc_name, 
                rc_description, 
                status, 
                created_date, 
                last_modified 
            FROM receipt_category 
            WHERE rc_id = ? 
            LIMIT 1
        `
        const data = await db.raw(sql, [rc_id])
        
        if(data.length) {
            result = { status: true, data: data[0] }
        } else {
            result = { status: false, data: null }
        }
    } catch (e) {
        console.log("Error AdminGetReceiptCategoryDetails: ", e)
        result = { status: false, data: null }
    } finally {
        return result
    }
}

/**
 * Create new receipt category
 * @param {object} categoryData - { rc_name, rc_description, status }
 * @returns {object} { status: boolean, data: object|null }
 */
async function AdminCreateReceiptCategory(categoryData = {}) {
    let result = null
    try {
        const { rc_name, rc_description, status = 'Active' } = categoryData

        if (!rc_name) {
            return { status: false, message: 'Receipt category name is required', data: null }
        }

        const validStatuses = ['Active', 'Inactive']
        if (!validStatuses.includes(status)) {
            return { status: false, message: `Invalid status. Must be one of: ${validStatuses.join(', ')}`, data: null }
        }

        const sql = `
            INSERT INTO receipt_category 
            (rc_name, rc_description, status, created_date, last_modified)
            VALUES (?, ?, ?, NOW(), NOW())
        `

        const result_insert = await db.raw(sql, [rc_name, rc_description || '', status])
        
        if (result_insert.insertId) {
            const getResult = await AdminGetReceiptCategoryDetails(result_insert.insertId)
            result = getResult
        } else {
            result = { status: false, message: 'Failed to create receipt category', data: null }
        }

    } catch (e) {
        console.log("Error AdminCreateReceiptCategory: ", e)
        result = { status: false, message: e.message, data: null }
    } finally {
        return result
    }
}

/**
 * Update receipt category
 * @param {number} rc_id - Receipt category ID
 * @param {object} updateData - { rc_name, rc_description, status }
 * @returns {object} { status: boolean, data: object|null }
 */
async function AdminUpdateReceiptCategory(rc_id, updateData = {}) {
    let result = null
    try {
        const updates = []
        const values = []

        if (updateData.rc_name !== undefined) {
            updates.push(`rc_name = ?`)
            values.push(updateData.rc_name)
        }

        if (updateData.rc_description !== undefined) {
            updates.push(`rc_description = ?`)
            values.push(updateData.rc_description)
        }

        if (updateData.status !== undefined) {
            const validStatuses = ['Active', 'Inactive']
            if (!validStatuses.includes(updateData.status)) {
                return { status: false, message: `Invalid status. Must be one of: ${validStatuses.join(', ')}`, data: null }
            }
            updates.push(`status = ?`)
            values.push(updateData.status)
        }

        if (updates.length === 0) {
            return { status: false, message: 'No data to update', data: null }
        }

        updates.push(`last_modified = NOW()`)

        const sql = `UPDATE receipt_category SET ${updates.join(', ')} WHERE rc_id = ?`
        values.push(rc_id)

        await db.raw(sql, values)

        // Fetch and return updated category
        const getResult = await AdminGetReceiptCategoryDetails(rc_id)
        result = getResult

    } catch (e) {
        console.log("Error AdminUpdateReceiptCategory: ", e)
        result = { status: false, message: e.message, data: null }
    } finally {
        return result
    }
}

/**
 * Update receipt category status
 * @param {number} rc_id - Receipt category ID
 * @param {string} status - Status: Active, Inactive
 * @returns {object} { status: boolean, message: string }
 */
async function AdminUpdateReceiptCategoryStatus(rc_id, status) {
    let result = null
    try {
        const validStatuses = ['Active', 'Inactive']
        
        if (!validStatuses.includes(status)) {
            return { status: false, message: `Invalid status. Must be one of: ${validStatuses.join(', ')}` }
        }

        const sql = `UPDATE receipt_category SET status = ?, last_modified = NOW() WHERE rc_id = ?`
        
        await db.raw(sql, [status, rc_id])

        result = { status: true, message: `Receipt category status updated to ${status}` }

    } catch (e) {
        console.log("Error AdminUpdateReceiptCategoryStatus: ", e)
        result = { status: false, message: "Failed to update receipt category status" }
    } finally {
        return result
    }
}

/**
 * Delete receipt category (hard delete since it's admin-only)
 * @param {number} rc_id - Receipt category ID
 * @returns {object} { status: boolean, message: string }
 */
async function AdminDeleteReceiptCategory(rc_id) {
    let result = null
    try {
        // Check if category is used in any receipts
        const checkSql = `SELECT COUNT(*) as count FROM receipt WHERE rc_id = ?`
        const checkResult = await db.raw(checkSql, [rc_id])
        
        if (checkResult[0].count > 0) {
            return { status: false, message: 'Cannot delete category that is in use by receipts' }
        }

        const sql = `DELETE FROM receipt_category WHERE rc_id = ?`
        
        await db.raw(sql, [rc_id])

        result = { status: true, message: 'Receipt category deleted successfully' }

    } catch (e) {
        console.log("Error AdminDeleteReceiptCategory: ", e)
        result = { status: false, message: 'Failed to delete receipt category' }
    } finally {
        return result
    }
}

/**
 * Get receipt category statistics
 * @returns {object} { status: boolean, data: { total, active, inactive } }
 */
async function AdminGetReceiptCategoryStats() {
    let result = null
    try {
        const sql = `
            SELECT 
                COUNT(*) as total,
                COALESCE(SUM(CASE WHEN status = 'Active' THEN 1 ELSE 0 END), 0) as active,
                COALESCE(SUM(CASE WHEN status = 'Inactive' THEN 1 ELSE 0 END), 0) as inactive
            FROM receipt_category
        `
        const data = await db.raw(sql, [])
        
        result = { 
            status: true, 
            data: data[0] || { total: 0, active: 0, inactive: 0 }
        }
    } catch (e) {
        console.log("Error AdminGetReceiptCategoryStats: ", e)
        result = { status: false, data: null }
    } finally {
        return result
    }
}

module.exports = {
    AdminGetReceiptCategoriesList,
    AdminGetReceiptCategoryDetails,
    AdminCreateReceiptCategory,
    AdminUpdateReceiptCategory,
    AdminUpdateReceiptCategoryStatus,
    AdminDeleteReceiptCategory,
    AdminGetReceiptCategoryStats
}
