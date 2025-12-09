const express = require('express')
const router = express.Router()
const { CHECK_EMPTY, sanitize } = require('../../../configs/helper')
const { AdminUpdateExpenseStatus } = require('../../../models/AdminModel/Expense')

/**
 * PATCH /admin/expense/status/:expenses_id
 * Update expense status
 * @param expenses_id - Expense ID
 * @body status - Status: Active, Inactive, Deleted, Others
 */
router.patch('/status/:expenses_id', async (req, res) => {
    try {
        const expenses_id = sanitize(req.params.expenses_id)
        const status = sanitize(req.body.status)

        if (CHECK_EMPTY(expenses_id)) {
            return res.status(400).json({
                status_code: 400,
                status: 'error',
                message: 'Expense ID is required',
                data: null
            })
        }

        if (CHECK_EMPTY(status)) {
            return res.status(400).json({
                status_code: 400,
                status: 'error',
                message: 'Status is required',
                data: null
            })
        }

        const result = await AdminUpdateExpenseStatus(expenses_id, status)

        if (result.status) {
            return res.status(200).json({
                status_code: 200,
                status: 'success',
                message: result.message,
                data: null
            })
        } else {
            return res.status(400).json({
                status_code: 400,
                status: 'error',
                message: result.message,
                data: null
            })
        }
    } catch (e) {
        console.log("Error PATCH /admin/expense/status: ", e)
        return res.status(500).json({
            status_code: 500,
            status: 'error',
            message: 'Internal server error',
            data: null
        })
    }
})

module.exports = router
