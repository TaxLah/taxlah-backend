/**
 * Get Expense Items Controller
 * Retrieve all items for a specific expense
 * 
 * GET /api/expenses/:id/items
 * 
 * @author TaxLah Development Team
 * @date 2026-03-03
 */

const express = require('express');
const router = express.Router();
const { 
    DEFAULT_API_RESPONSE, 
    INTERNAL_SERVER_ERROR_API_RESPONSE,
    UNAUTHORIZED_API_RESPONSE,
    NOT_FOUND_API_RESPONSE,
    ERROR_UNAUTHENTICATED,
    CHECK_EMPTY
} = require('../../../configs/helper');
const ExpensesModel = require('../../../models/AppModel/Expenses');

/**
 * GET /api/expenses/:id/items
 * Get all items for a specific expense
 */
router.get('/:id/items', async (req, res) => {
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

        if (!expenses_id || isNaN(expenses_id)) {
            response = NOT_FOUND_API_RESPONSE;
            response.message = 'Invalid expense ID';
            return res.status(response.status_code).json(response);
        }

        console.log('[GetExpenseItems] Request:', { account_id, expenses_id });

        // First verify the expense belongs to the user
        const expenseCheck = await ExpensesModel.getExpenseById(account_id, expenses_id);
        
        if (!expenseCheck.status) {
            response = NOT_FOUND_API_RESPONSE;
            response.message = 'Expense not found or does not belong to you';
            return res.status(response.status_code).json(response);
        }

        // Get expense items
        const result = await ExpensesModel.getExpenseItems(expenses_id);

        if (!result.status) {
            response = INTERNAL_SERVER_ERROR_API_RESPONSE;
            response.message = result.message || 'Failed to retrieve expense items';
            return res.status(response.status_code).json(response);
        }

        // Success response
        response.status_code = 200;
        response.status = 'success';
        response.message = result.message;
        response.data = {
            expenses_id: expenses_id,
            items: result.data,
            count: result.count
        };

        console.log('[GetExpenseItems] Success:', { 
            expenses_id, 
            items_count: result.count 
        });

        return res.status(response.status_code).json(response);

    } catch (error) {
        console.error('[GetExpenseItems] Error:', error);
        response = INTERNAL_SERVER_ERROR_API_RESPONSE;
        response.message = 'An error occurred while retrieving expense items';
        response.data = { error: error.message };
        return res.status(response.status_code).json(response);
    }
});

module.exports = router;
