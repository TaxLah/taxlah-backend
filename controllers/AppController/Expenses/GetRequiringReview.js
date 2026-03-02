/**
 * Get Expenses Requiring Review Controller
 * Retrieves expenses with low confidence or pending status
 * 
 * GET /api/expenses/requiring-review
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
    ERROR_UNAUTHENTICATED,
    CHECK_EMPTY
} = require('../../../configs/helper');
const ExpensesModel = require('../../../models/AppModel/Expenses');

/**
 * GET /api/expenses/requiring-review
 * Get expenses that need user review
 * - Low confidence (< 70%)
 * - Pending status
 * - Recently changed by LHDN update (last 7 days)
 * 
 * Query Parameters:
 * - limit: Number of records to return (default: 20, max: 100)
 */
router.get('/', async (req, res) => {
    let response = DEFAULT_API_RESPONSE;
    let user = req.user || null;

    if (CHECK_EMPTY(user)) {
        response = UNAUTHORIZED_API_RESPONSE;
        response.message = ERROR_UNAUTHENTICATED;
        return res.status(response.status_code).json(response);
    }

    try {
        const account_id = user.account_id;
        const limit = Math.min(parseInt(req.query.limit) || 20, 100);

        console.log('[GetRequiringReview] Request:', { account_id, limit });

        // Get expenses requiring review
        const result = await ExpensesModel.getExpensesRequiringReview(account_id, limit);

        if (!result.status) {
            response = INTERNAL_SERVER_ERROR_API_RESPONSE;
            response.message = result.message || 'Failed to retrieve expenses';
            return res.status(response.status_code).json(response);
        }

        // Success response
        response.status_code = 200;
        response.status = 'success';
        response.message = result.message;
        response.data = {
            expenses: result.data,
            count: result.count,
            ui_message: result.count > 0 ? {
                title: '⚠️ Review Needed',
                description: `You have ${result.count} expense(s) that need your attention. Please review and confirm the categories.`,
                action: {
                    label: 'Review Now',
                    type: 'primary'
                }
            } : {
                title: '✅ All Good',
                description: 'All your expenses are properly categorized!',
                action: null
            }
        };

        console.log('[GetRequiringReview] Success:', { count: result.count });

        return res.status(response.status_code).json(response);

    } catch (error) {
        console.error('[GetRequiringReview] Error:', error);
        response = INTERNAL_SERVER_ERROR_API_RESPONSE;
        response.message = 'An error occurred while retrieving expenses requiring review';
        response.data = { error: error.message };
        return res.status(response.status_code).json(response);
    }
});

module.exports = router;
