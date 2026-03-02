/**
 * Delete Expense Controller
 * Soft delete an expense
 * 
 * DELETE /api/expenses/delete/:id
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
 * DELETE /api/expenses/delete/:id
 * Soft delete an expense (sets status to 'Deleted')
 */
router.delete('/:id', async (req, res) => {
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

        console.log('[DeleteExpense] Request:', { account_id, expenses_id });

        // Delete expense
        const result = await ExpensesModel.deleteExpense(account_id, expenses_id);

        if (!result.status) {
            response = NOT_FOUND_API_RESPONSE;
            response.message = result.message || 'Failed to delete expense';
            return res.status(response.status_code).json(response);
        }

        // Success response
        response.status_code = 200;
        response.status = 'success';
        response.message = result.message;
        response.data = null;

        console.log('[DeleteExpense] Success:', { expenses_id });

        return res.status(response.status_code).json(response);

    } catch (error) {
        console.error('[DeleteExpense] Error:', error);
        response = INTERNAL_SERVER_ERROR_API_RESPONSE;
        response.message = 'An error occurred while deleting expense';
        response.data = { error: error.message };
        return res.status(response.status_code).json(response);
    }
});

module.exports = router;
