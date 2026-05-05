const db = require("../../../utils/sqlbuilder")

/**
 * Get paginated list of tax categories with filters
 * @param {object} params - { page, limit, search, status, sortBy, sortOrder }
 * @returns {object} { status: boolean, data: { categories: [], total: number, page: number, totalPages: number } }
 */
async function AdminGetTaxCategoriesList(params = {}) {
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
            whereConditions.push(`(tax_title LIKE ? OR tax_description LIKE ?)`)
            const searchTerm = `%${search}%`
            queryParams.push(searchTerm, searchTerm)
        }

        // Status filter
        if (status && status !== 'All') {
            whereConditions.push(`status = ?`)
            queryParams.push(status)
        }

        // Year filter
        const tax_year = params.tax_year || params.year || ''
        if (tax_year) {
            whereConditions.push(`tax_year = ?`)
            queryParams.push(tax_year)
        }

        const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : ''

        // Get total count
        const countSql = `SELECT COUNT(*) as total FROM tax_category ${whereClause}`
        const countResult = await db.raw(countSql, queryParams)
        const total = countResult[0].total

        // Get categories with pagination
        const validSortColumns = ['tax_id', 'tax_title', 'tax_max_claim', 'status', 'created_date']
        const validSortBy = validSortColumns.includes(sortBy) ? sortBy : 'created_date'
        const validSortOrder = ['ASC', 'DESC'].includes(sortOrder.toUpperCase()) ? sortOrder.toUpperCase() : 'DESC'

        const sql = `SELECT tax_id, tax_code, tax_title, tax_description, tax_max_claim, tax_content, status, created_date, last_modified FROM tax_category ${whereClause} ORDER BY ${validSortBy} ${validSortOrder} LIMIT ${limit} OFFSET ${offset}`
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
        console.log("Error AdminGetTaxCategoriesList: ", e)
        result = { status: false, data: null }
    } finally {
        return result
    }
}

/**
 * Get single tax category details by ID
 * @param {number} tax_id - Tax category ID
 * @returns {object} { status: boolean, data: object|null }
 */
async function AdminGetTaxCategoryDetails(tax_id) {
    let result = null
    try {
        const sql = `SELECT tax_id, tax_title, tax_description, tax_max_claim, tax_content, status, created_date, last_modified FROM tax_category WHERE tax_id = ? LIMIT 1`
        const data = await db.raw(sql, [tax_id])
        
        if(data.length) {
            result = { status: true, data: data[0] }
        } else {
            result = { status: false, data: null }
        }
    } catch (e) {
        console.log("Error AdminGetTaxCategoryDetails: ", e)
        result = { status: false, data: null }
    } finally {
        return result
    }
}

/**
 * Create new tax category
 * @param {object} categoryData - Category data object
 * @returns {object} { status: boolean, data: insertId|null }
 */
async function AdminCreateTaxCategory(categoryData) {
    let result = null
    try {
        const data = await db.insert('tax_category', categoryData)
        
        if(data.insertId) {
            result = { status: true, data: data.insertId }
        } else {
            result = { status: false, data: null }
        }
    } catch (e) {
        console.log("Error AdminCreateTaxCategory: ", e)
        result = { status: false, data: null }
    } finally {
        return result
    }
}

/**
 * Update tax category
 * @param {number} tax_id - Tax category ID
 * @param {object} updateData - Data to update
 * @returns {object} { status: boolean, data: affectedRows|null }
 */
async function AdminUpdateTaxCategory(tax_id, updateData) {
    let result = null
    try {
        updateData.tax_id = tax_id
        const data = await db.update('tax_category', updateData, { tax_id })
        
        if(data) {
            result = { status: true, data: data }
        } else {
            result = { status: false, data: null }
        }
    } catch (e) {
        console.log("Error AdminUpdateTaxCategory: ", e)
        result = { status: false, data: null }
    } finally {
        return result
    }
}

/**
 * Update tax category status
 * @param {number} tax_id - Tax category ID
 * @param {string} status - New status (Active, Inactive, Deleted, Others)
 * @returns {object} { status: boolean, data: affectedRows|null }
 */
async function AdminUpdateTaxCategoryStatus(tax_id, status) {
    let result = null
    try {
        const validStatuses = ['Active', 'Inactive', 'Deleted', 'Others']
        if (!validStatuses.includes(status)) {
            throw new Error('Invalid status value')
        }

        const data = await db.update('tax_category', { status: status }, { tax_id })
        
        if(data) {
            result = { status: true, data: data }
        } else {
            result = { status: false, data: null }
        }
    } catch (e) {
        console.log("Error AdminUpdateTaxCategoryStatus: ", e)
        result = { status: false, data: null }
    } finally {
        return result
    }
}

/**
 * Delete tax category (soft delete by setting status to Deleted)
 * @param {number} tax_id - Tax category ID
 * @returns {object} { status: boolean, data: affectedRows|null }
 */
async function AdminDeleteTaxCategory(tax_id) {
    let result = null
    try {
        const data = await db.update('tax_category', { status: 'Deleted' }, { tax_id })
        
        if(data) {
            result = { status: true, data: data }
        } else {
            result = { status: false, data: null }
        }
    } catch (e) {
        console.log("Error AdminDeleteTaxCategory: ", e)
        result = { status: false, data: null }
    } finally {
        return result
    }
}

/**
 * Get tax category statistics
 * @returns {object} { status: boolean, data: object|null }
 */
async function AdminGetTaxCategoryStats(params = {}) {
    let result = null
    try {

        let whereConditions = []
        let queryParams = []

        // Year filter
        const tax_year = params.tax_year || params.year || ''
        if (tax_year) {
            whereConditions.push(`tax_year = ?`)
            queryParams.push(tax_year)
        }

        const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : ''

        const sql = `
            SELECT 
                COUNT(*) as total_categories,
                SUM(CASE WHEN status = 'Active' THEN 1 ELSE 0 END) as active_categories,
                SUM(CASE WHEN status = 'Inactive' THEN 1 ELSE 0 END) as inactive_categories,
                SUM(CASE WHEN status = 'Deleted' THEN 1 ELSE 0 END) as deleted_categories,
                SUM(tax_max_claim) as total_max_claim
            FROM tax_category ${whereClause}
        `
        const data = await db.raw(sql, queryParams)
        
        if(data.length) {
            result = { status: true, data: data[0] }
        } else {
            result = { status: false, data: null }
        }
    } catch (e) {
        console.log("Error AdminGetTaxCategoryStats: ", e)
        result = { status: false, data: null }
    } finally {
        return result
    }
}

/**
 * Check if a tax_code already exists for the given tax_year (duplicate guard)
 * @param {string} tax_code
 * @param {number} tax_year
 * @param {number|null} exclude_tax_id - Exclude this ID when checking (for updates)
 */
async function AdminCheckTaxCategoryDuplicate(tax_code, tax_year, exclude_tax_id = null) {
    let result = null
    try {
        let sql = `SELECT tax_id FROM tax_category WHERE tax_code = ? AND tax_year = ? AND status != 'Deleted'`
        let params = [tax_code, tax_year]
        if (exclude_tax_id) {
            sql += ` AND tax_id != ?`
            params.push(exclude_tax_id)
        }
        sql += ' LIMIT 1'
        const data = await db.raw(sql, params)
        result = { status: true, exists: data.length > 0, data: data[0] || null }
    } catch (e) {
        console.log('Error AdminCheckTaxCategoryDuplicate: ', e)
        result = { status: false, exists: false, data: null }
    } finally {
        return result
    }
}

module.exports = {
    AdminGetTaxCategoriesList,
    AdminGetTaxCategoryDetails,
    AdminCreateTaxCategory,
    AdminUpdateTaxCategory,
    AdminUpdateTaxCategoryStatus,
    AdminDeleteTaxCategory,
    AdminGetTaxCategoryStats,
    AdminCheckTaxCategoryDuplicate
}
