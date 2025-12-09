const express = require('express')
const router = express.Router()
const { CHECK_EMPTY, sanitize } = require('../../../configs/helper')
const { AdminUpdateExpenseItem, AdminGetExpenseItemDetails } = require('../../../models/AdminModel/ExpenseItem')

/**
 * PUT /admin/expense-item/update/:item_id
 * Update expense item
 * @param item_id - Item ID
 * @body item_sku_unit - SKU/Unit (optional)
 * @body item_name - Item name (optional)
 * @body item_unit_price - Unit price (optional)
 * @body item_quantity - Quantity (optional)
 * @body item_total_price - Total price (optional)
 * @body status - Status (optional)
 */
router.put('/update/:item_id', async (req, res) => {
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

        // Check if item exists
        const checkResult = await AdminGetExpenseItemDetails(item_id)
        if (!checkResult.status) {
            return res.status(404).json({
                status_code: 404,
                status: 'error',
                message: 'Expense item not found',
                data: null
            })
        }

        const updateData = {
            item_sku_unit: sanitize(req.body.item_sku_unit),
            item_name: sanitize(req.body.item_name),
            item_unit_price: sanitize(req.body.item_unit_price),
            item_quantity: sanitize(req.body.item_quantity),
            item_total_price: sanitize(req.body.item_total_price),
            status: sanitize(req.body.status)
        }

        // Remove undefined values
        Object.keys(updateData).forEach(key => updateData[key] === undefined && delete updateData[key])

        if (Object.keys(updateData).length === 0) {
            return res.status(400).json({
                status_code: 400,
                status: 'error',
                message: 'No data to update',
                data: null
            })
        }

        const result = await AdminUpdateExpenseItem(item_id, updateData)

        if (result.status) {
            return res.status(200).json({
                status_code: 200,
                status: 'success',
                message: 'Expense item updated successfully',
                data: result.data
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
        console.log("Error PUT /admin/expense-item/update: ", e)
        return res.status(500).json({
            status_code: 500,
            status: 'error',
            message: 'Internal server error',
            data: null
        })
    }
})

module.exports = router
