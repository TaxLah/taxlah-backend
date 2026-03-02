/**
 * Get Expenses List Controller
 * Retrieve expenses with filtering and pagination
 * 
 * GET /api/expenses/list
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
 * GET /api/expenses/list
 * Get paginated list of expenses with filters
 * 
 * Query Parameters:
 * - offset: Starting position (default: 0)
 * - limit: Number of records (default: 20, max: 100)
 * - search: Search term for merchant name, tags, receipt no
 * - year: Filter by year (YYYY)
 * - mapping_status: Filter by status (Pending, Estimated, Confirmed, Manual)
 * - tax_category: Filter by tax category ID
 * - min_confidence: Minimum confidence score (0-100)
 * - sort_by: Field to sort by (default: expenses_date)
 * - sort_order: ASC or DESC (default: DESC)
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
        
        // Parse query parameters
        const filters = {
            offset: parseInt(req.query.offset) || 0,
            limit: Math.min(parseInt(req.query.limit) || 20, 100), // Max 100
            search: req.query.search || '',
            year: req.query.year ? parseInt(req.query.year) : null,
            mapping_status: req.query.mapping_status || null,
            tax_category: req.query.tax_category ? parseInt(req.query.tax_category) : null,
            min_confidence: req.query.min_confidence ? parseFloat(req.query.min_confidence) : null,
            sort_by: req.query.sort_by || 'expenses_date',
            sort_order: (req.query.sort_order || 'DESC').toUpperCase()
        };

        // Validate sort_order
        if (!['ASC', 'DESC'].includes(filters.sort_order)) {
            filters.sort_order = 'DESC';
        }

        console.log('[GetExpensesList] Filters:', { account_id, filters });

        // Get expenses
        const result = await ExpensesModel.getAllExpenses(account_id, filters);

        if (!result.status) {
            response = INTERNAL_SERVER_ERROR_API_RESPONSE;
            response.message = result.message || 'Failed to retrieve expenses';
            return res.status(response.status_code).json(response);
        }

        // Success response
        response.status_code = 200;
        response.status = 'success';
        response.message = result.message;
        response.data = result.data;

        console.log('[GetExpensesList] Success:', {
            total: result.data.pagination.total,
            returned: result.data.expenses.length
        });

        return res.status(response.status_code).json(response);

    } catch (error) {
        console.error('[GetExpensesList] Error:', error);
        response = INTERNAL_SERVER_ERROR_API_RESPONSE;
        response.message = 'An error occurred while retrieving expenses';
        response.data = { error: error.message };
        return res.status(response.status_code).json(response);
    }
});

module.exports = router;
