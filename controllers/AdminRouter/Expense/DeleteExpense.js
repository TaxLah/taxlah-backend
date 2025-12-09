const express = require('express')
const router = express.Router()
const { CHECK_EMPTY, sanitize } = require('../../../configs/helper')
const { AdminDeleteExpense } = require('../../../models/AdminModel/Expense')

/**
 * DELETE /admin/expense/delete/:expenses_id
 * Soft delete expense
 * @param expenses_id - Expense ID
 */
router.delete('/delete/:expenses_id', async (req, res) => {
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

        const result = await AdminDeleteExpense(expenses_id)

        if (result.status) {
            return res.status(200).json({
                status_code: 200,
                status: 'success',
                message: result.message,
                data: null
            })
        } else {
            return res.status(500).json({
                status_code: 500,
                status: 'error',
                message: result.message,
                data: null
            })
        }
    } catch (e) {
        console.log("Error DELETE /admin/expense/delete: ", e)
        return res.status(500).json({
            status_code: 500,
            status: 'error',
            message: 'Internal server error',
            data: null
        })
    }
})

module.exports = router
