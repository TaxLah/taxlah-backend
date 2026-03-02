/**
 * Get Expense Statistics Controller
 * Provides statistical overview of expenses
 * 
 * GET /api/expenses/stats
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
 * GET /api/expenses/stats
 * Get comprehensive expense statistics
 * 
 * Query Parameters:
 * - year: Filter by specific year (optional)
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
        const year = req.query.year ? parseInt(req.query.year) : null;

        console.log('[GetExpenseStats] Request:', { account_id, year });

        // Get statistics
        const result = await ExpensesModel.getExpenseStats(account_id, year);

        if (!result.status) {
            response = INTERNAL_SERVER_ERROR_API_RESPONSE;
            response.message = result.message || 'Failed to retrieve statistics';
            return res.status(response.status_code).json(response);
        }

        // Format amounts
        const overview = result.data.overview;
        if (overview) {
            overview.total_amount = parseFloat(overview.total_amount || 0);
            overview.avg_amount = parseFloat(overview.avg_amount || 0);
            overview.avg_confidence = parseFloat(overview.avg_confidence || 0);
        }

        // Format category breakdown
        const byCategory = result.data.by_category.map(cat => ({
            ...cat,
            total_amount: parseFloat(cat.total_amount || 0),
            avg_confidence: parseFloat(cat.avg_confidence || 0)
        }));

        // Calculate percentages
        const totalAmount = overview?.total_amount || 0;
        const categoriesWithPercentage = byCategory.map(cat => ({
            ...cat,
            percentage: totalAmount > 0 ? ((cat.total_amount / totalAmount) * 100).toFixed(2) : 0
        }));

        // Success response
        response.status_code = 200;
        response.status = 'success';
        response.message = 'Expense statistics retrieved successfully';
        response.data = {
            overview,
            by_category: categoriesWithPercentage,
            year: year || 'All Years'
        };

        console.log('[GetExpenseStats] Success:', {
            total_count: overview?.total_count,
            total_amount: overview?.total_amount
        });

        return res.status(response.status_code).json(response);

    } catch (error) {
        console.error('[GetExpenseStats] Error:', error);
        response = INTERNAL_SERVER_ERROR_API_RESPONSE;
        response.message = 'An error occurred while retrieving expense statistics';
        response.data = { error: error.message };
        return res.status(response.status_code).json(response);
    }
});

module.exports = router;
