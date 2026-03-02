/**
 * Update Expense Controller
 * Update expense details
 * 
 * PUT /api/expenses/update/:id
 * 
 * @author TaxLah Development Team
 * @date 2026-03-02
 */

const express = require('express');
const router = express.Router();
const { 
    DEFAULT_API_RESPONSE, 
    INTERNAL_SERVER_ERROR_API_RESPONSE,
    UNAUTHORIZED_API_RESPONSE,
    NOT_FOUND_API_RESPONSE,
    BAD_REQUEST_API_RESPONSE,
    ERROR_UNAUTHENTICATED,
    CHECK_EMPTY,
    sanitize
} = require('../../../configs/helper');
const ExpensesModel = require('../../../models/AppModel/Expenses');

/**
 * PUT /api/expenses/update/:id
 * Update expense details
 * 
 * Body (all optional, only include what you want to update):
 * {
 *   expenses_date: "2026-01-15"
 *   expenses_merchant_name: "Popular Bookstore"
 *   expenses_total_amount: 300.00
 *   expenses_merchant_id: "MERCHANT-123"
 *   expenses_receipt_no: "RCP-2026-001"
 *   expenses_tags: "books, education"
 *   expenses_for: "Child"
 *   dependant_id: 2
 * }
 */
router.put('/:id', async (req, res) => {
    let response = DEFAULT_API_RESPONSE;
    let user = req.user || null;

    if (CHECK_EMPTY(user)) {
        response = UNAUTHORIZED_API_RESPONSE;
        response.message = ERROR_UNAUTHENTICATED;
        return res.status(response.status_code).json(response);
    }

    try {
        const account_id = user.account_id;
        const expenses_id = parseInt(req.params.id);
        const params = req.body;

        if (!expenses_id || isNaN(expenses_id)) {
            response = BAD_REQUEST_API_RESPONSE;
            response.message = 'Invalid expense ID';
            return res.status(response.status_code).json(response);
        }

        console.log('[UpdateExpense] Request:', { account_id, expenses_id, params });

        // Build update object (only include provided fields)
        const updateData = {};

        if (params.expenses_date !== undefined) {
            // Validate date format
            const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
            if (!dateRegex.test(params.expenses_date)) {
                response = BAD_REQUEST_API_RESPONSE;
                response.message = 'Invalid date format. Use YYYY-MM-DD';
                return res.status(response.status_code).json(response);
            }
            updateData.expenses_date = params.expenses_date;
            updateData.expenses_year = new Date(params.expenses_date).getFullYear();
        }

        if (params.expenses_merchant_name !== undefined) {
            updateData.expenses_merchant_name = sanitize(params.expenses_merchant_name);
        }

        if (params.expenses_total_amount !== undefined) {
            if (isNaN(params.expenses_total_amount) || params.expenses_total_amount <= 0) {
                response = BAD_REQUEST_API_RESPONSE;
                response.message = 'Invalid expense amount';
                return res.status(response.status_code).json(response);
            }
            updateData.expenses_total_amount = parseFloat(params.expenses_total_amount);
        }

        if (params.expenses_merchant_id !== undefined) {
            updateData.expenses_merchant_id = params.expenses_merchant_id;
        }

        if (params.expenses_receipt_no !== undefined) {
            updateData.expenses_receipt_no = params.expenses_receipt_no ? sanitize(params.expenses_receipt_no) : null;
        }

        if (params.expenses_tags !== undefined) {
            updateData.expenses_tags = params.expenses_tags ? sanitize(params.expenses_tags) : null;
        }

        if (params.expenses_for !== undefined) {
            updateData.expenses_for = params.expenses_for;
        }

        if (params.dependant_id !== undefined) {
            updateData.dependant_id = params.dependant_id ? parseInt(params.dependant_id) : null;
        }

        if (Object.keys(updateData).length === 0) {
            response = BAD_REQUEST_API_RESPONSE;
            response.message = 'No fields to update';
            return res.status(response.status_code).json(response);
        }

        // Update expense
        const result = await ExpensesModel.updateExpense(account_id, expenses_id, updateData);

        if (!result.status) {
            response = NOT_FOUND_API_RESPONSE;
            response.message = result.message || 'Failed to update expense';
            return res.status(response.status_code).json(response);
        }

        // Success response
        response.status_code = 200;
        response.status = 'success';
        response.message = result.message;
        response.data = result.data;

        console.log('[UpdateExpense] Success:', { expenses_id });

        return res.status(response.status_code).json(response);

    } catch (error) {
        console.error('[UpdateExpense] Error:', error);
        response = INTERNAL_SERVER_ERROR_API_RESPONSE;
        response.message = 'An error occurred while updating expense';
        response.data = { error: error.message };
        return res.status(response.status_code).json(response);
    }
});

module.exports = router;
