const express = require('express')
const router = express.Router()
const { CHECK_EMPTY, sanitize } = require('../../../configs/helper')
const { AdminCreateExpenseItem, AdminGetExpenseItemDetails } = require('../../../models/AdminModel/ExpenseItem')

/**
 * POST /admin/expense-item/create
 * Create new expense item
 * @body expenses_id - Expense ID (required)
 * @body item_sku_unit - SKU/Unit (optional)
 * @body item_name - Item name (required)
 * @body item_unit_price - Unit price (optional, default: 0)
 * @body item_quantity - Quantity (optional, default: 0)
 * @body item_total_price - Total price (optional, default: 0)
 * @body status - Status (optional, default: Active)
 */
router.post('/create', async (req, res) => {
    try {
        const expenses_id = sanitize(req.body.expenses_id)

        if (CHECK_EMPTY(expenses_id)) {
            return res.status(400).json({
                status_code: 400,
                status: 'error',
                message: 'Expense ID is required',
                data: null
            })
        }

        const itemData = {
            item_sku_unit: sanitize(req.body.item_sku_unit),
            item_name: sanitize(req.body.item_name),
            item_unit_price: sanitize(req.body.item_unit_price),
            item_quantity: sanitize(req.body.item_quantity),
            item_total_price: sanitize(req.body.item_total_price),
            status: sanitize(req.body.status) || 'Active'
        }

        const { AdminGetExpenseDetails } = require('../../../models/AdminModel/Expense')
        const expenseCheck = await AdminGetExpenseDetails(expenses_id)
        
        if (!expenseCheck.status) {
            return res.status(404).json({
                status_code: 404,
                status: 'error',
                message: 'Expense not found',
                data: null
            })
        }

        const result = await AdminCreateExpenseItem(expenses_id, itemData)

        if (result.status) {
            return res.status(201).json({
                status_code: 201,
                status: 'success',
                message: 'Expense item created successfully',
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
        console.log("Error POST /admin/expense-item/create: ", e)
        return res.status(500).json({
            status_code: 500,
            status: 'error',
            message: 'Internal server error',
            data: null
        })
    }
})

module.exports = router
