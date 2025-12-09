const db = require("../../../utils/sqlbuilder")

/**
 * Get paginated list of all expenses (across all users) for admin
 * @param {object} params - { page, limit, search, account_id, tax_category, tax_eligible, status, sortBy, sortOrder, dateFrom, dateTo }
 * @returns {object} { status: boolean, data: { expenses: [], total: number, page: number, totalPages: number } }
 */
async function AdminGetExpensesList(params = {}) {
    let result = null
    try {
        const page = parseInt(params.page) || 1
        const limit = parseInt(params.limit) || 20
        const offset = (page - 1) * limit
        const search = params.search || ''
        const account_id = params.account_id || ''
        const tax_category = params.tax_category || ''
        const tax_eligible = params.tax_eligible || ''
        const status = params.status || ''
        const sortBy = params.sortBy || 'expenses_date'
        const sortOrder = params.sortOrder || 'DESC'
        const dateFrom = params.dateFrom || ''
        const dateTo = params.dateTo || ''

        let whereConditions = []
        let queryParams = []

        // User filter
        if (account_id) {
            whereConditions.push(`e.account_id = ?`)
            queryParams.push(account_id)
        }

        // Search filter (tags, merchant, receipt)
        if (search) {
            whereConditions.push(`(e.expenses_tags LIKE ? OR e.expenses_merchant_name LIKE ? OR e.expenses_receipt_no LIKE ?)`)
            const searchTerm = `%${search}%`
            queryParams.push(searchTerm, searchTerm, searchTerm)
        }

        // Tax category filter
        if (tax_category) {
            whereConditions.push(`e.expenses_tax_category = ?`)
            queryParams.push(tax_category)
        }

        // Tax eligible filter
        if (tax_eligible && tax_eligible !== 'All') {
            whereConditions.push(`e.expenses_tax_eligible = ?`)
            queryParams.push(tax_eligible)
        }

        // Date range filter
        if (dateFrom) {
            whereConditions.push(`e.expenses_date >= ?`)
            queryParams.push(dateFrom)
        }
        if (dateTo) {
            whereConditions.push(`e.expenses_date <= ?`)
            queryParams.push(dateTo)
        }

        // Status filter
        if (status && status !== 'All') {
            whereConditions.push(`e.status = ?`)
            queryParams.push(status)
        } else {
            whereConditions.push(`e.status != 'Deleted'`)
        }

        const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : ''

        // Get total count
        const countSql = `
            SELECT COUNT(*) as total 
            FROM account_expenses e 
            ${whereClause}
        `
        const countResult = await db.raw(countSql, queryParams)
        const total = countResult[0].total

        // Get expenses with pagination
        const validSortColumns = ['expenses_id', 'expenses_merchant_name', 'expenses_total_amount', 'expenses_date', 'created_date', 'account_id']
        const validSortBy = validSortColumns.includes(sortBy) ? sortBy : 'expenses_date'
        const validSortOrder = ['ASC', 'DESC'].includes(sortOrder.toUpperCase()) ? sortOrder.toUpperCase() : 'DESC'

        const sql = `
            SELECT 
                e.expenses_id, 
                e.expenses_tags, 
                e.expenses_receipt_no,
                e.expenses_merchant_id,
                e.expenses_merchant_name, 
                e.expenses_total_amount, 
                e.expenses_date,
                e.expenses_year,
                e.expenses_tax_eligible,
                e.expenses_tax_category,
                tc.tax_name as category_name,
                e.expenses_tax_subcategory,
                tsc.taxsub_name as subcategory_name,
                e.account_id,
                a.account_name as user_name,
                a.account_email as user_email,
                e.status, 
                e.created_date, 
                e.last_modified 
            FROM account_expenses e
            LEFT JOIN account a ON e.account_id = a.account_id
            LEFT JOIN tax_category tc ON e.expenses_tax_category = tc.tax_id
            LEFT JOIN tax_subcategory tsc ON e.expenses_tax_subcategory = tsc.taxsub_id
            ${whereClause} 
            ORDER BY e.${validSortBy} ${validSortOrder} 
            LIMIT ${limit} OFFSET ${offset}
        `
        const expenses = await db.raw(sql, queryParams)

        const totalPages = Math.ceil(total / limit)

        result = {
            status: true,
            data: {
                expenses: expenses,
                total: total,
                page: page,
                limit: limit,
                totalPages: totalPages
            }
        }
    } catch (e) {
        console.log("Error AdminGetExpensesList: ", e)
        result = { status: false, data: null }
    } finally {
        return result
    }
}

/**
 * Get single expense details with items
 * @param {number} expenses_id - Expense ID
 * @returns {object} { status: boolean, data: object|null }
 */
async function AdminGetExpenseDetails(expenses_id) {
    let result = null
    try {
        const sql = `
            SELECT 
                e.expenses_id, 
                e.expenses_tags, 
                e.expenses_receipt_no,
                e.expenses_merchant_id,
                e.expenses_merchant_name, 
                e.expenses_total_amount, 
                e.expenses_date,
                e.expenses_year,
                e.expenses_tax_eligible,
                e.expenses_tax_category,
                tc.tax_name as category_name,
                tc.tax_description as category_description,
                e.expenses_tax_subcategory,
                tsc.taxsub_name as subcategory_name,
                tsc.taxsub_description as subcategory_description,
                e.account_id,
                a.account_name as user_name,
                a.account_email as user_email,
                a.account_contact as user_contact,
                e.status, 
                e.created_date, 
                e.last_modified 
            FROM account_expenses e
            LEFT JOIN account a ON e.account_id = a.account_id
            LEFT JOIN tax_category tc ON e.expenses_tax_category = tc.tax_id
            LEFT JOIN tax_subcategory tsc ON e.expenses_tax_subcategory = tsc.taxsub_id
            WHERE e.expenses_id = ? 
            LIMIT 1
        `
        const data = await db.raw(sql, [expenses_id])
        
        if(data.length) {
            result = { status: true, data: data[0] }
        } else {
            result = { status: false, data: null }
        }
    } catch (e) {
        console.log("Error AdminGetExpenseDetails: ", e)
        result = { status: false, data: null }
    } finally {
        return result
    }
}

/**
 * Update expense details
 * @param {number} expenses_id - Expense ID
 * @param {object} updateData - { expenses_tags, expenses_merchant_id, expenses_merchant_name, expenses_total_amount, expenses_date, expenses_year, expenses_tax_category, expenses_tax_subcategory, expenses_tax_eligible, status }
 * @returns {object} { status: boolean, data: object|null }
 */
async function AdminUpdateExpense(expenses_id, updateData = {}) {
    let result = null
    try {
        const updates = []
        const values = []

        if (updateData.expenses_tags !== undefined) {
            updates.push(`expenses_tags = ?`)
            values.push(updateData.expenses_tags)
        }

        if (updateData.expenses_merchant_id !== undefined) {
            updates.push(`expenses_merchant_id = ?`)
            values.push(updateData.expenses_merchant_id)
        }

        if (updateData.expenses_merchant_name !== undefined) {
            updates.push(`expenses_merchant_name = ?`)
            values.push(updateData.expenses_merchant_name)
        }

        if (updateData.expenses_total_amount !== undefined) {
            updates.push(`expenses_total_amount = ?`)
            values.push(updateData.expenses_total_amount)
        }

        if (updateData.expenses_date !== undefined) {
            updates.push(`expenses_date = ?`)
            values.push(updateData.expenses_date)
        }

        if (updateData.expenses_year !== undefined) {
            updates.push(`expenses_year = ?`)
            values.push(updateData.expenses_year)
        }

        if (updateData.expenses_tax_category !== undefined) {
            updates.push(`expenses_tax_category = ?`)
            values.push(updateData.expenses_tax_category)
        }

        if (updateData.expenses_tax_subcategory !== undefined) {
            updates.push(`expenses_tax_subcategory = ?`)
            values.push(updateData.expenses_tax_subcategory)
        }

        if (updateData.expenses_tax_eligible !== undefined) {
            updates.push(`expenses_tax_eligible = ?`)
            values.push(updateData.expenses_tax_eligible)
        }

        if (updateData.status !== undefined) {
            updates.push(`status = ?`)
            values.push(updateData.status)
        }

        if (updates.length === 0) {
            return { status: false, data: null }
        }

        updates.push(`last_modified = NOW()`)

        const sql = `UPDATE account_expenses SET ${updates.join(', ')} WHERE expenses_id = ?`
        values.push(expenses_id)

        await db.raw(sql, values)

        // Fetch and return updated expense
        const getResult = await AdminGetExpenseDetails(expenses_id)
        result = getResult

    } catch (e) {
        console.log("Error AdminUpdateExpense: ", e)
        result = { status: false, data: null }
    } finally {
        return result
    }
}

/**
 * Update expense status
 * @param {number} expenses_id - Expense ID
 * @param {string} status - Status: Active, Inactive, Deleted, Others
 * @returns {object} { status: boolean, message: string }
 */
async function AdminUpdateExpenseStatus(expenses_id, status) {
    let result = null
    try {
        const validStatuses = ['Active', 'Inactive', 'Deleted', 'Others']
        
        if (!validStatuses.includes(status)) {
            return { status: false, message: `Invalid status. Must be one of: ${validStatuses.join(', ')}` }
        }

        const sql = `UPDATE account_expenses SET status = ?, last_modified = NOW() WHERE expenses_id = ?`
        
        await db.raw(sql, [status, expenses_id])

        result = { status: true, message: `Expense status updated to ${status}` }

    } catch (e) {
        console.log("Error AdminUpdateExpenseStatus: ", e)
        result = { status: false, message: "Failed to update expense status" }
    } finally {
        return result
    }
}

/**
 * Soft delete expense
 * @param {number} expenses_id - Expense ID
 * @returns {object} { status: boolean, message: string }
 */
async function AdminDeleteExpense(expenses_id) {
    let result = null
    try {
        const sql = `UPDATE account_expenses SET status = 'Deleted', last_modified = NOW() WHERE expenses_id = ?`
        
        await db.raw(sql, [expenses_id])

        result = { status: true, message: 'Expense deleted successfully' }

    } catch (e) {
        console.log("Error AdminDeleteExpense: ", e)
        result = { status: false, message: 'Failed to delete expense' }
    } finally {
        return result
    }
}

/**
 * Get comprehensive expense statistics for dashboard
 * @param {object} params - { account_id, dateFrom, dateTo }
 * @returns {object} { status: boolean, data: { total_amount, total_count, tax_eligible_amount, tax_ineligible_amount, by_category, by_status, by_month } }
 */
async function AdminGetExpenseStats(params = {}) {
    let result = null
    try {
        const account_id = params.account_id || ''
        const dateFrom = params.dateFrom || ''
        const dateTo = params.dateTo || ''

        let whereConditions = [`e.status != 'Deleted'`]
        let queryParams = []

        if (account_id) {
            whereConditions.push(`e.account_id = ?`)
            queryParams.push(account_id)
        }

        if (dateFrom) {
            whereConditions.push(`e.expenses_date >= ?`)
            queryParams.push(dateFrom)
        }

        if (dateTo) {
            whereConditions.push(`e.expenses_date <= ?`)
            queryParams.push(dateTo)
        }

        const whereClause = `WHERE ${whereConditions.join(' AND ')}`

        // Total stats
        const totalSql = `
            SELECT 
                COUNT(*) as total_count,
                COALESCE(SUM(expenses_total_amount), 0) as total_amount,
                COALESCE(SUM(CASE WHEN expenses_tax_eligible = 'Yes' THEN expenses_total_amount ELSE 0 END), 0) as tax_eligible_amount,
                COALESCE(SUM(CASE WHEN expenses_tax_eligible = 'No' THEN expenses_total_amount ELSE 0 END), 0) as tax_ineligible_amount
            FROM account_expenses e
            ${whereClause}
        `
        const totalStats = await db.raw(totalSql, queryParams)

        // By status
        const statusSql = `
            SELECT 
                status,
                COUNT(*) as count,
                COALESCE(SUM(expenses_total_amount), 0) as amount
            FROM account_expenses e
            ${whereClause}
            GROUP BY status
        `
        const byStatus = await db.raw(statusSql, queryParams)

        // By tax category
        const categorySql = `
            SELECT 
                tc.tax_id,
                tc.tax_name,
                COUNT(e.expenses_id) as count,
                COALESCE(SUM(e.expenses_total_amount), 0) as amount
            FROM account_expenses e
            LEFT JOIN tax_category tc ON e.expenses_tax_category = tc.tax_id
            ${whereClause}
            GROUP BY tc.tax_id, tc.tax_name
            ORDER BY amount DESC
        `
        const byCategory = await db.raw(categorySql, queryParams)

        // By month
        const monthSql = `
            SELECT 
                DATE_FORMAT(e.expenses_date, '%Y-%m') as month,
                COUNT(e.expenses_id) as count,
                COALESCE(SUM(e.expenses_total_amount), 0) as amount
            FROM account_expenses e
            ${whereClause}
            GROUP BY DATE_FORMAT(e.expenses_date, '%Y-%m')
            ORDER BY month DESC
        `
        const byMonth = await db.raw(monthSql, queryParams)

        result = { 
            status: true, 
            data: {
                overview: totalStats[0] || { total_count: 0, total_amount: 0, tax_eligible_amount: 0, tax_ineligible_amount: 0 },
                by_status: byStatus,
                by_category: byCategory,
                by_month: byMonth
            }
        }
    } catch (e) {
        console.log("Error AdminGetExpenseStats: ", e)
        result = { status: false, data: null }
    } finally {
        return result
    }
}

module.exports = {
    AdminGetExpensesList,
    AdminGetExpenseDetails,
    AdminUpdateExpense,
    AdminUpdateExpenseStatus,
    AdminDeleteExpense,
    AdminGetExpenseStats
}
