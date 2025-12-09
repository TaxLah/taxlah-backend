const express = require('express')
const router = express.Router()
const { CHECK_EMPTY, sanitize } = require('../../../configs/helper')
const { AdminGetExpenseDetails } = require('../../../models/AdminModel/Expense')
const { AdminGetExpenseItems } = require('../../../models/AdminModel/ExpenseItem')

/**
 * GET /admin/expense/details/:expenses_id
 * Get expense details with items
 * @param expenses_id - Expense ID
 */
router.get('/details/:expenses_id', async (req, res) => {
    try {
        const expenses_id = sanitize(req.params.expenses_id)
        
        if (CHECK_EMPTY(expenses_id)) {
            return res.status(400).json({
                status_code: 400,
                status: 'error',
                message: 'Expense ID is required',
                data: null
            })
        }

        const expenseResult = await AdminGetExpenseDetails(expenses_id)

        if (!expenseResult.status) {
            return res.status(404).json({
                status_code: 404,
                status: 'error',
                message: 'Expense not found',
                data: null
            })
        }

        // Get items for this expense
        const itemsResult = await AdminGetExpenseItems(expenses_id)
        const expenseData = {
            ...expenseResult.data,
            items: itemsResult.data || []
        }

        return res.status(200).json({
            status_code: 200,
            status: 'success',
            message: 'Expense details retrieved successfully',
            data: expenseData
        })
    } catch (e) {
        console.log("Error GET /admin/expense/details: ", e)
        return res.status(500).json({
            status_code: 500,
            status: 'error',
            message: 'Internal server error',
            data: null
        })
    }
})

module.exports = router
