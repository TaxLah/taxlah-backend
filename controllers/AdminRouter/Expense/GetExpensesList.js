const express = require('express')
const router = express.Router()
const { CHECK_EMPTY, sanitize } = require('../../../configs/helper')
const { AdminGetExpensesList } = require('../../../models/AdminModel/Expense')

/**
 * GET /admin/expense/list
 * Get paginated list of expenses (admin view)
 * @query page - Page number (default: 1)
 * @query limit - Items per page (default: 20)
 * @query search - Search by tags, merchant name, or receipt number
 * @query account_id - Filter by user ID
 * @query tax_category - Filter by tax category ID
 * @query tax_eligible - Filter by tax eligibility (Yes, No, All)
 * @query status - Filter by status (Active, Inactive, Deleted, All)
 * @query dateFrom - Filter by date range (from)
 * @query dateTo - Filter by date range (to)
 * @query sortBy - Sort column (expenses_id, expenses_merchant_name, expenses_total_amount, expenses_date, created_date, account_id)
 * @query sortOrder - Sort order (ASC, DESC)
 */
router.get('/list', async (req, res) => {
    try {
        const params = {
            page: sanitize(req.query.page),
            limit: sanitize(req.query.limit),
            search: sanitize(req.query.search),
            account_id: sanitize(req.query.account_id),
            tax_category: sanitize(req.query.tax_category),
            tax_eligible: sanitize(req.query.tax_eligible),
            status: sanitize(req.query.status),
            dateFrom: sanitize(req.query.dateFrom),
            dateTo: sanitize(req.query.dateTo),
            sortBy: sanitize(req.query.sortBy),
            sortOrder: sanitize(req.query.sortOrder)
        }

        const result = await AdminGetExpensesList(params)

        if (result.status) {
            return res.status(200).json({
                status_code: 200,
                status: 'success',
                message: 'Expenses retrieved successfully',
                data: result.data
            })
        } else {
            return res.status(500).json({
                status_code: 500,
                status: 'error',
                message: 'Failed to retrieve expenses',
                data: null
            })
        }
    } catch (e) {
        console.log("Error GET /admin/expense/list: ", e)
        return res.status(500).json({
            status_code: 500,
            status: 'error',
            message: 'Internal server error',
            data: null
        })
    }
})

module.exports = router
