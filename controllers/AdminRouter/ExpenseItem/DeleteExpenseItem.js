const express = require('express')
const router = express.Router()
const { CHECK_EMPTY, sanitize } = require('../../../configs/helper')
const { AdminDeleteExpenseItem } = require('../../../models/AdminModel/ExpenseItem')

/**
 * DELETE /admin/expense-item/delete/:item_id
 * Delete expense item (soft delete)
 * @param item_id - Item ID
 */
router.delete('/delete/:item_id', async (req, res) => {
    try {
        const item_id = sanitize(req.params.item_id)

        if (CHECK_EMPTY(item_id)) {
            return res.status(400).json({
                status_code: 400,
                status: 'error',
                message: 'Item ID is required',
                data: null
            })
        }

        const result = await AdminDeleteExpenseItem(item_id)

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
        console.log("Error DELETE /admin/expense-item/delete: ", e)
        return res.status(500).json({
            status_code: 500,
            status: 'error',
            message: 'Internal server error',
            data: null
        })
    }
})

module.exports = router
