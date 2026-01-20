const db = require("../../../utils/sqlbuilder")

/**
 * Create a new inquiry
 * @param {object} params - { inquiry_name, inquiry_email, inquiry_subject, inquiry_message }
 * @returns {object} { status: boolean, data: inquiry_id or null }
 */
async function CreateInquiry(params = {}) {
    let result = null
    try {
        const inquiry_name      = params.inquiry_name || null
        const inquiry_email     = params.inquiry_email || null
        const inquiry_subject   = params.inquiry_subject || null
        const inquiry_message   = params.inquiry_message || null

        const sql = `
            INSERT INTO inquiry 
            (inquiry_name, inquiry_email, inquiry_subject, inquiry_message, inquiry_status) 
            VALUES (?, ?, ?, ?, 'Pending')
        `
        const insertResult = await db.raw(sql, [
            inquiry_name,
            inquiry_email,
            inquiry_subject,
            inquiry_message
        ])

        result = {
            status: true,
            data: {
                inquiry_id: insertResult.insertId
            }
        }
    } catch (e) {
        console.log("Error CreateInquiry: ", e)
        result = { status: false, data: null }
    } finally {
        return result
    }
}

/**
 * Get inquiry details by ID
 * @param {number} inquiry_id - Inquiry ID
 * @returns {object} { status: boolean, data: inquiry object or null }
 */
async function GetInquiryDetails(inquiry_id) {
    let result = null
    try {
        const sql = `
            SELECT 
                inquiry_id,
                inquiry_name,
                inquiry_email,
                inquiry_subject,
                inquiry_message,
                inquiry_status,
                created_at,
                last_modified
            FROM inquiry
            WHERE inquiry_id = ?
        `
        const inquiry = await db.raw(sql, [inquiry_id])

        result = {
            status: true,
            data: inquiry.length > 0 ? inquiry[0] : null
        }
    } catch (e) {
        console.log("Error GetInquiryDetails: ", e)
        result = { status: false, data: null }
    } finally {
        return result
    }
}

/**
 * Get paginated list of inquiries
 * @param {object} params - { page, limit, search, status, sortBy, sortOrder }
 * @returns {object} { status: boolean, data: { inquiries: [], total: number, page: number, totalPages: number } }
 */
async function GetInquiriesList(params = {}) {
    let result = null
    try {
        const page = parseInt(params.page) || 1
        const limit = parseInt(params.limit) || 20
        const offset = (page - 1) * limit
        const search = params.search || ''
        const status = params.status || ''
        const sortBy = params.sortBy || 'created_at'
        const sortOrder = params.sortOrder || 'DESC'

        let whereConditions = []
        let queryParams = []

        // Search filter
        if (search) {
            whereConditions.push(`(inquiry_name LIKE ? OR inquiry_email LIKE ? OR inquiry_subject LIKE ?)`)
            const searchTerm = `%${search}%`
            queryParams.push(searchTerm, searchTerm, searchTerm)
        }

        // Status filter
        if (status && status !== 'All') {
            whereConditions.push(`inquiry_status = ?`)
            queryParams.push(status)
        } else {
            // By default, exclude deleted inquiries
            whereConditions.push(`inquiry_status != 'Deleted'`)
        }

        const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : ''

        // Get total count
        const countSql = `
            SELECT COUNT(*) as total 
            FROM inquiry 
            ${whereClause}
        `
        const countResult = await db.raw(countSql, queryParams)
        const total = countResult[0].total

        // Get inquiries with pagination
        const validSortColumns = ['inquiry_id', 'inquiry_name', 'inquiry_email', 'inquiry_status', 'created_at']
        const validSortBy = validSortColumns.includes(sortBy) ? sortBy : 'created_at'
        const validSortOrder = ['ASC', 'DESC'].includes(sortOrder.toUpperCase()) ? sortOrder.toUpperCase() : 'DESC'

        const sql = `
            SELECT 
                inquiry_id,
                inquiry_name,
                inquiry_email,
                inquiry_subject,
                inquiry_message,
                inquiry_status,
                created_at,
                last_modified
            FROM inquiry
            ${whereClause} 
            ORDER BY ${validSortBy} ${validSortOrder} 
            LIMIT ${limit} OFFSET ${offset}
        `
        const inquiries = await db.raw(sql, queryParams)

        const totalPages = Math.ceil(total / limit)

        result = {
            status: true,
            data: {
                inquiries: inquiries,
                total: total,
                page: page,
                limit: limit,
                totalPages: totalPages
            }
        }
    } catch (e) {
        console.log("Error GetInquiriesList: ", e)
        result = { status: false, data: null }
    } finally {
        return result
    }
}

/**
 * Update inquiry status
 * @param {number} inquiry_id - Inquiry ID
 * @param {string} status - New status
 * @returns {object} { status: boolean, data: affected rows or null }
 */
async function UpdateInquiryStatus(inquiry_id, status) {
    let result = null
    try {
        const sql = `
            UPDATE inquiry 
            SET inquiry_status = ?, 
                last_modified = NOW() 
            WHERE inquiry_id = ?
        `
        const updateResult = await db.raw(sql, [status, inquiry_id])

        result = {
            status: true,
            data: {
                affectedRows: updateResult.affectedRows
            }
        }
    } catch (e) {
        console.log("Error UpdateInquiryStatus: ", e)
        result = { status: false, data: null }
    } finally {
        return result
    }
}

/**
 * Delete inquiry (soft delete)
 * @param {number} inquiry_id - Inquiry ID
 * @returns {object} { status: boolean, data: affected rows or null }
 */
async function DeleteInquiry(inquiry_id) {
    let result = null
    try {
        const sql = `
            UPDATE inquiry 
            SET inquiry_status = 'Deleted', 
                last_modified = NOW() 
            WHERE inquiry_id = ?
        `
        const deleteResult = await db.raw(sql, [inquiry_id])

        result = {
            status: true,
            data: {
                affectedRows: deleteResult.affectedRows
            }
        }
    } catch (e) {
        console.log("Error DeleteInquiry: ", e)
        result = { status: false, data: null }
    } finally {
        return result
    }
}

module.exports = {
    CreateInquiry,
    GetInquiryDetails,
    GetInquiriesList,
    UpdateInquiryStatus,
    DeleteInquiry
}
