const express = require('express')
const router = express.Router()
const { AdminGetExpenseStats } = require('../../../models/AdminModel/Expense')

/**
 * GET /admin/expense/stats
 * Get expense statistics for dashboard
 * @query account_id - Filter by user ID (optional)
 * @query dateFrom - Filter by date range (from) (optional)
 * @query dateTo - Filter by date range (to) (optional)
 */
router.get('/stats', async (req, res) => {
    try {
        const params = {
            account_id: req.query.account_id || '',
            dateFrom: req.query.dateFrom || '',
            dateTo: req.query.dateTo || ''
        }

        const result = await AdminGetExpenseStats(params)

        if (result.status) {
            return res.status(200).json({
                status_code: 200,
                status: 'success',
                message: 'Expense statistics retrieved successfully',
                data: result.data
            })
        } else {
            return res.status(500).json({
                status_code: 500,
                status: 'error',
                message: 'Failed to retrieve expense statistics',
                data: null
            })
        }
    } catch (e) {
        console.log("Error GET /admin/expense/stats: ", e)
        return res.status(500).json({
            status_code: 500,
            status: 'error',
            message: 'Internal server error',
            data: null
        })
    }
})

module.exports = router
