const db = require("../../../utils/sqlbuilder")

/**
 * Get paginated list of receipts for a user
 * @param {number} account_id - User account ID
 * @param {object} params - { page, limit, search, rc_id, status, sortBy, sortOrder }
 * @returns {object} { status: boolean, data: { receipts: [], total: number, page: number, totalPages: number } }
 */
/**
 * Builds the shared WHERE clause for a receipt query.
 *
 * Extracted so the paginated list, the count/summary and the archive all filter
 * an identical set — "download the receipts I filtered" is only true if the ZIP
 * and the list agree on what "filtered" means.
 *
 * Every value is bound, never interpolated. Deleted receipts are always excluded
 * unless the caller explicitly asks for that status.
 */
function buildReceiptFilters(account_id, params = {}) {
    const where = [`r.account_id = ?`]
    const args = [account_id]

    const search = (params.search || '').trim()
    if (search) {
        // Escape LIKE wildcards so a pasted name containing % searches literally.
        const term = `%${search.replace(/[\\%_]/g, (c) => `\\${c}`)}%`
        where.push(`(r.receipt_name LIKE ? ESCAPE '\\\\' OR r.receipt_description LIKE ? ESCAPE '\\\\')`)
        args.push(term, term)
    }

    if (params.rc_id) {
        where.push(`r.rc_id = ?`)
        args.push(params.rc_id)
    }

    if (params.status && params.status !== 'All') {
        where.push(`r.status = ?`)
        args.push(params.status)
    } else {
        where.push(`r.status != 'Deleted'`)
    }

    // Date bounds compare against the column directly (sargable), not DATE(col).
    if (/^\d{4}-\d{2}-\d{2}$/.test(params.date_from || '')) {
        where.push(`r.created_date >= ?`)
        args.push(`${params.date_from} 00:00:00`)
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(params.date_to || '')) {
        where.push(`r.created_date <= ?`)
        args.push(`${params.date_to} 23:59:59`)
    }

    if (params.amount_min !== undefined && params.amount_min !== null && !isNaN(parseFloat(params.amount_min))) {
        where.push(`r.receipt_amount >= ?`)
        args.push(parseFloat(params.amount_min))
    }
    if (params.amount_max !== undefined && params.amount_max !== null && !isNaN(parseFloat(params.amount_max))) {
        where.push(`r.receipt_amount <= ?`)
        args.push(parseFloat(params.amount_max))
    }

    return { clause: `WHERE ${where.join(' AND ')}`, args }
}

const RECEIPT_SORT_COLUMNS = ['receipt_id', 'receipt_name', 'receipt_amount', 'created_date']

async function GetReceiptsList(account_id, params = {}) {
    let result = null
    try {
        const page = Math.max(parseInt(params.page) || 1, 1)
        const limit = Math.min(Math.max(parseInt(params.limit) || 20, 1), 100)
        const offset = (page - 1) * limit

        const { clause, args } = buildReceiptFilters(account_id, params)

        const sortBy = RECEIPT_SORT_COLUMNS.includes(params.sortBy) ? params.sortBy : 'created_date'
        const sortOrder = String(params.sortOrder).toUpperCase() === 'ASC' ? 'ASC' : 'DESC'

        // Count and money over the whole filtered set in one pass — the header shows
        // these, and computing them from the visible page would be wrong.
        const summaryRows = await db.raw(
            `SELECT COUNT(*) AS total, COALESCE(SUM(r.receipt_amount), 0) AS total_amount
               FROM receipt r ${clause}`,
            args
        )
        const total = Number(summaryRows[0].total) || 0

        const sql = `
            SELECT
                r.receipt_id,
                r.receipt_name,
                r.receipt_description,
                r.receipt_amount,
                r.receipt_items,
                r.receipt_image_url,
                r.receipt_metadata,
                r.rc_id,
                rc.rc_name as category_name,
                r.status,
                r.created_date,
                r.last_modified
            FROM receipt r
            LEFT JOIN receipt_category rc ON r.rc_id = rc.rc_id
            ${clause}
            ORDER BY r.${sortBy} ${sortOrder}, r.receipt_id DESC
            LIMIT ${limit} OFFSET ${offset}
        `
        const receipts = await db.raw(sql, args)

        result = {
            status: true,
            data: {
                receipts,
                summary: {
                    total,
                    total_amount: parseFloat(summaryRows[0].total_amount) || 0
                },
                total,
                page,
                limit,
                totalPages: Math.max(Math.ceil(total / limit), 1)
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
 * The receipt files matching a filter, for the archive endpoint.
 *
 * Returns { receipt_id, receipt_name, receipt_image_url, created_date } for every
 * non-deleted receipt the filter selects — the same filter the list uses — so the
 * ZIP contains exactly what the user was looking at. Capped, so a filter that
 * matches everything cannot build an unbounded archive.
 */
async function GetReceiptFilesForArchive(account_id, params = {}, cap = 500) {
    const { clause, args } = buildReceiptFilters(account_id, params)
    const safeCap = Math.min(Math.max(parseInt(cap) || 500, 1), 1000)
    return db.raw(
        `SELECT r.receipt_id, r.receipt_name, r.receipt_image_url, r.created_date
           FROM receipt r ${clause}
           AND r.receipt_image_url IS NOT NULL AND r.receipt_image_url <> ''
          ORDER BY r.created_date
          LIMIT ${safeCap}`,
        args
    )
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
                AVG(receipt_amount) as average_amount,
                MIN(created_date) as earliest_receipt,
                MAX(created_date) as latest_receipt
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
    GetReceiptFilesForArchive,
    GetReceiptDetails,
    CreateReceipt,
    UpdateReceipt,
    DeleteReceipt,
    GetReceiptStats
}
