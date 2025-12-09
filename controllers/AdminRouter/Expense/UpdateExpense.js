const express = require('express')
const router = express.Router()
const { CHECK_EMPTY, sanitize } = require('../../../configs/helper')
const { AdminUpdateExpense, AdminGetExpenseDetails } = require('../../../models/AdminModel/Expense')

/**
 * PUT /admin/expense/update/:expenses_id
 * Update expense details (admin can update any expense)
 * @param expenses_id - Expense ID
 * @body expenses_tags - Tags (optional)
 * @body expenses_merchant_id - Merchant ID (optional)
 * @body expenses_merchant_name - Merchant name (optional)
 * @body expenses_total_amount - Total amount (optional)
 * @body expenses_date - Expense date (optional)
 * @body expenses_year - Expense year (optional)
 * @body expenses_tax_category - Tax category ID (optional)
 * @body expenses_tax_subcategory - Tax subcategory ID (optional)
 * @body expenses_tax_eligible - Tax eligible (Yes/No) (optional)
 * @body status - Status (optional)
 */
router.put('/update/:expenses_id', async (req, res) => {
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

        // Check if expense exists
        const checkResult = await AdminGetExpenseDetails(expenses_id)
        if (!checkResult.status) {
            return res.status(404).json({
                status_code: 404,
                status: 'error',
                message: 'Expense not found',
                data: null
            })
        }

        const updateData = {
            expenses_tags: sanitize(req.body.expenses_tags),
            expenses_merchant_id: sanitize(req.body.expenses_merchant_id),
            expenses_merchant_name: sanitize(req.body.expenses_merchant_name),
            expenses_total_amount: sanitize(req.body.expenses_total_amount),
            expenses_date: sanitize(req.body.expenses_date),
            expenses_year: sanitize(req.body.expenses_year),
            expenses_tax_category: sanitize(req.body.expenses_tax_category),
            expenses_tax_subcategory: sanitize(req.body.expenses_tax_subcategory),
            expenses_tax_eligible: sanitize(req.body.expenses_tax_eligible),
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

        const result = await AdminUpdateExpense(expenses_id, updateData)

        if (result.status) {
            return res.status(200).json({
                status_code: 200,
                status: 'success',
                message: 'Expense updated successfully',
                data: result.data
            })
        } else {
            return res.status(500).json({
                status_code: 500,
                status: 'error',
                message: 'Failed to update expense',
                data: null
            })
        }
    } catch (e) {
        console.log("Error PUT /admin/expense/update: ", e)
        return res.status(500).json({
            status_code: 500,
            status: 'error',
            message: 'Internal server error',
            data: null
        })
    }
})

module.exports = router
