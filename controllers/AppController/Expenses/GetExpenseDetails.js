/**
 * Get Expense Details Controller
 * Retrieve single expense with complete information
 * 
 * GET /api/expenses/details/:id
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
    ERROR_UNAUTHENTICATED,
    CHECK_EMPTY
} = require('../../../configs/helper');
const ExpensesModel = require('../../../models/AppModel/Expenses');

/**
 * GET /api/expenses/details/:id
 * Get detailed information about a specific expense
 */
router.get('/:id', async (req, res) => {
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

        console.log('[GetExpenseDetails] Request:', { account_id, expenses_id });

        // Get expense details
        const result = await ExpensesModel.getExpenseById(account_id, expenses_id);

        if (!result.status) {
            response = NOT_FOUND_API_RESPONSE;
            response.message = result.message || 'Expense not found';
            return res.status(response.status_code).json(response);
        }

        // Get expense items
        const itemsResult = await ExpensesModel.getExpenseItems(expenses_id);

        // Get mapping history
        const historyResult = await ExpensesModel.getMappingHistory(expenses_id);

        // Success response
        response.status_code = 200;
        response.status = 'success';
        response.message = 'Expense details retrieved successfully';
        response.data = {
            expense: result.data,
            items: itemsResult.data || [],
            items_count: itemsResult.count || 0,
            mapping_history: historyResult.data || []
        };

        console.log('[GetExpenseDetails] Success:', { expenses_id });

        return res.status(response.status_code).json(response);

    } catch (error) {
        console.error('[GetExpenseDetails] Error:', error);
        response = INTERNAL_SERVER_ERROR_API_RESPONSE;
        response.message = 'An error occurred while retrieving expense details';
        response.data = { error: error.message };
        return res.status(response.status_code).json(response);
    }
});

module.exports = router;
