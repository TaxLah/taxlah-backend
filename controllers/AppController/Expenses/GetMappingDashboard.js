/**
 * Get Mapping Dashboard Controller
 * Provides overview of expense mapping status
 * 
 * GET /api/expenses/mapping-dashboard
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
 * GET /api/expenses/mapping-dashboard
 * Get comprehensive mapping status dashboard
 * 
 * Query Parameters:
 * - tax_year: Filter by specific year (optional)
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
        const tax_year = req.query.tax_year ? parseInt(req.query.tax_year) : null;

        console.log('[GetMappingDashboard] Request:', { account_id, tax_year });

        // Get dashboard data
        const result = await ExpensesModel.getMappingDashboard(account_id, tax_year);

        if (!result.status) {
            response = INTERNAL_SERVER_ERROR_API_RESPONSE;
            response.message = result.message || 'Failed to retrieve dashboard';
            return res.status(response.status_code).json(response);
        }

        // Calculate insights
        const summary = result.data.summary;
        const insights = [];

        if (summary) {
            // Check for estimated expenses
            if (summary.estimated_count > 0) {
                insights.push({
                    type: 'info',
                    icon: '⏳',
                    title: 'Estimated Categories',
                    message: `You have ${summary.estimated_count} expense(s) with estimated categories. These will be updated when official LHDN mapping is published.`
                });
            }

            // Check for low confidence
            if (summary.needs_review_count > 0) {
                insights.push({
                    type: 'warning',
                    icon: '⚠️',
                    title: 'Review Needed',
                    message: `${summary.needs_review_count} expense(s) have low confidence and need your review.`,
                    action: {
                        label: 'Review Now',
                        endpoint: '/api/expenses/requiring-review'
                    }
                });
            }

            // Check average confidence
            if (summary.avg_confidence < 70) {
                insights.push({
                    type: 'warning',
                    icon: '📊',
                    title: 'Low Average Confidence',
                    message: `Your average confidence score is ${summary.avg_confidence?.toFixed(1)}%. Consider reviewing your expenses.`
                });
            } else if (summary.avg_confidence > 85) {
                insights.push({
                    type: 'success',
                    icon: '✅',
                    title: 'High Quality Data',
                    message: `Great! Your expenses are categorized with ${summary.avg_confidence?.toFixed(1)}% average confidence.`
                });
            }

            // Check for confirmed expenses
            if (summary.confirmed_count === summary.current_year_receipts && summary.current_year_receipts > 0) {
                insights.push({
                    type: 'success',
                    icon: '🎉',
                    title: 'All Confirmed',
                    message: 'All your expenses are categorized with official LHDN mapping!'
                });
            }
        }

        // Success response
        response.status_code = 200;
        response.status = 'success';
        response.message = 'Mapping dashboard retrieved successfully';
        response.data = {
            ...result.data,
            insights
        };

        console.log('[GetMappingDashboard] Success');

        return res.status(response.status_code).json(response);

    } catch (error) {
        console.error('[GetMappingDashboard] Error:', error);
        response = INTERNAL_SERVER_ERROR_API_RESPONSE;
        response.message = 'An error occurred while retrieving mapping dashboard';
        response.data = { error: error.message };
        return res.status(response.status_code).json(response);
    }
});

module.exports = router;
