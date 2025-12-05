const db = require("../../../utils/sqlbuilder")

/**
 * Get paginated list of tax subcategories with filters
 * @param {object} params - { page, limit, search, status, sortBy, sortOrder }
 * @returns {object} { status: boolean, data: { subcategories: [], total: number, page: number, totalPages: number } }
 */
async function AdminGetTaxSubcategoriesList(params = {}) {
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
            whereConditions.push(`(taxsub_title LIKE ? OR taxsub_description LIKE ?)`)
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
        const countSql = `SELECT COUNT(*) as total FROM tax_subcategory ${whereClause}`
        const countResult = await db.raw(countSql, queryParams)
        const total = countResult[0].total

        // Get subcategories with pagination
        const validSortColumns = ['taxsub_id', 'taxsub_title', 'taxsub_max_claim', 'status', 'created_date']
        const validSortBy = validSortColumns.includes(sortBy) ? sortBy : 'created_date'
        const validSortOrder = ['ASC', 'DESC'].includes(sortOrder.toUpperCase()) ? sortOrder.toUpperCase() : 'DESC'

        const sql = `
            SELECT 
                ts.taxsub_id, 
                ts.taxsub_tags, 
                ts.taxsub_title, 
                ts.taxsub_description, 
                ts.taxsub_content, 
                ts.taxsub_max_claim, 
                ts.tax_id,
                tc.tax_title as tax_category_name,
                ts.status, 
                ts.created_date, 
                ts.last_modified 
            FROM tax_subcategory ts
            LEFT JOIN tax_category tc ON ts.tax_id = tc.tax_id
            ${whereClause} 
            ORDER BY ${validSortBy} ${validSortOrder} 
            LIMIT ${limit} OFFSET ${offset}
        `
        const subcategories = await db.raw(sql, queryParams)

        const totalPages = Math.ceil(total / limit)

        result = {
            status: true,
            data: {
                subcategories: subcategories,
                total: total,
                page: page,
                limit: limit,
                totalPages: totalPages
            }
        }
    } catch (e) {
        console.log("Error AdminGetTaxSubcategoriesList: ", e)
        result = { status: false, data: null }
    } finally {
        return result
    }
}

/**
 * Get single tax subcategory details by ID
 * @param {number} taxsub_id - Tax subcategory ID
 * @returns {object} { status: boolean, data: object|null }
 */
async function AdminGetTaxSubcategoryDetails(taxsub_id) {
    let result = null
    try {
        const sql = `
            SELECT 
                ts.taxsub_id, 
                ts.taxsub_tags, 
                ts.taxsub_title, 
                ts.taxsub_description, 
                ts.taxsub_content, 
                ts.taxsub_max_claim, 
                ts.tax_id,
                tc.tax_title as tax_category_name,
                ts.status, 
                ts.created_date, 
                ts.last_modified 
            FROM tax_subcategory ts
            LEFT JOIN tax_category tc ON ts.tax_id = tc.tax_id
            WHERE ts.taxsub_id = ? 
            LIMIT 1
        `
        const data = await db.raw(sql, [taxsub_id])
        
        if(data.length) {
            result = { status: true, data: data[0] }
        } else {
            result = { status: false, data: null }
        }
    } catch (e) {
        console.log("Error AdminGetTaxSubcategoryDetails: ", e)
        result = { status: false, data: null }
    } finally {
        return result
    }
}

/**
 * Create new tax subcategory
 * @param {object} subcategoryData - Subcategory data object
 * @returns {object} { status: boolean, data: insertId|null }
 */
async function AdminCreateTaxSubcategory(subcategoryData) {
    let result = null
    try {
        const data = await db.insert('tax_subcategory', subcategoryData)
        
        if(data.insertId) {
            result = { status: true, data: data.insertId }
        } else {
            result = { status: false, data: null }
        }
    } catch (e) {
        console.log("Error AdminCreateTaxSubcategory: ", e)
        result = { status: false, data: null }
    } finally {
        return result
    }
}

/**
 * Update tax subcategory
 * @param {number} taxsub_id - Tax subcategory ID
 * @param {object} updateData - Data to update
 * @returns {object} { status: boolean, data: affectedRows|null }
 */
async function AdminUpdateTaxSubcategory(taxsub_id, updateData) {
    let result = null
    try {
        updateData.taxsub_id = taxsub_id
        const data = await db.update('tax_subcategory', updateData, { taxsub_id })
        
        if(data) {
            result = { status: true, data: data }
        } else {
            result = { status: false, data: null }
        }
    } catch (e) {
        console.log("Error AdminUpdateTaxSubcategory: ", e)
        result = { status: false, data: null }
    } finally {
        return result
    }
}

/**
 * Update tax subcategory status
 * @param {number} taxsub_id - Tax subcategory ID
 * @param {string} status - New status (Active, Inactive, Deleted, Others)
 * @returns {object} { status: boolean, data: affectedRows|null }
 */
async function AdminUpdateTaxSubcategoryStatus(taxsub_id, status) {
    let result = null
    try {
        const validStatuses = ['Active', 'Inactive', 'Deleted', 'Others']
        if (!validStatuses.includes(status)) {
            throw new Error('Invalid status value')
        }

        const data = await db.update('tax_subcategory', { status: status }, { taxsub_id })
        
        if(data) {
            result = { status: true, data: data }
        } else {
            result = { status: false, data: null }
        }
    } catch (e) {
        console.log("Error AdminUpdateTaxSubcategoryStatus: ", e)
        result = { status: false, data: null }
    } finally {
        return result
    }
}

/**
 * Delete tax subcategory (soft delete by setting status to Deleted)
 * @param {number} taxsub_id - Tax subcategory ID
 * @returns {object} { status: boolean, data: affectedRows|null }
 */
async function AdminDeleteTaxSubcategory(taxsub_id) {
    let result = null
    try {
        const data = await db.update('tax_subcategory', { status: 'Deleted' }, { taxsub_id })
        
        if(data) {
            result = { status: true, data: data }
        } else {
            result = { status: false, data: null }
        }
    } catch (e) {
        console.log("Error AdminDeleteTaxSubcategory: ", e)
        result = { status: false, data: null }
    } finally {
        return result
    }
}

/**
 * Get tax subcategory statistics
 * @returns {object} { status: boolean, data: object|null }
 */
async function AdminGetTaxSubcategoryStats() {
    let result = null
    try {
        const sql = `
            SELECT 
                COUNT(*) as total_subcategories,
                SUM(CASE WHEN status = 'Active' THEN 1 ELSE 0 END) as active_subcategories,
                SUM(CASE WHEN status = 'Inactive' THEN 1 ELSE 0 END) as inactive_subcategories,
                SUM(CASE WHEN status = 'Deleted' THEN 1 ELSE 0 END) as deleted_subcategories,
                SUM(taxsub_max_claim) as total_max_claim
            FROM tax_subcategory
        `
        const data = await db.raw(sql)
        
        if(data.length) {
            result = { status: true, data: data[0] }
        } else {
            result = { status: false, data: null }
        }
    } catch (e) {
        console.log("Error AdminGetTaxSubcategoryStats: ", e)
        result = { status: false, data: null }
    } finally {
        return result
    }
}

module.exports = {
    AdminGetTaxSubcategoriesList,
    AdminGetTaxSubcategoryDetails,
    AdminCreateTaxSubcategory,
    AdminUpdateTaxSubcategory,
    AdminUpdateTaxSubcategoryStatus,
    AdminDeleteTaxSubcategory,
    AdminGetTaxSubcategoryStats
}
