/**
 * Override Tax Category Controller
 * Allows user to manually override AI categorization
 * 
 * PUT /api/expenses/override-category/:id
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
    CHECK_EMPTY
} = require('../../../configs/helper');
const ExpensesModel = require('../../../models/AppModel/Expenses');

/**
 * PUT /api/expenses/override-category/:id
 * Manually override the tax category for an expense
 * Sets mapping status to 'Manual' and confidence to 100%
 * 
 * Body:
 * {
 *   tax_id: 3,           // Required
 *   taxsub_id: 12        // Optional
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
        const { tax_id, taxsub_id } = req.body;

        // Validation
        if (!expenses_id || isNaN(expenses_id)) {
            response = BAD_REQUEST_API_RESPONSE;
            response.message = 'Invalid expense ID';
            return res.status(response.status_code).json(response);
        }

        if (!tax_id || isNaN(tax_id)) {
            response = BAD_REQUEST_API_RESPONSE;
            response.message = 'Tax category ID is required';
            return res.status(response.status_code).json(response);
        }

        console.log('[OverrideTaxCategory] Request:', { 
            account_id, 
            expenses_id, 
            tax_id, 
            taxsub_id 
        });

        // Override category
        const result = await ExpensesModel.overrideTaxCategory(
            account_id, 
            expenses_id, 
            parseInt(tax_id),
            taxsub_id ? parseInt(taxsub_id) : null
        );

        if (!result.status) {
            response = NOT_FOUND_API_RESPONSE;
            response.message = result.message || 'Failed to override category';
            return res.status(response.status_code).json(response);
        }

        // Success response
        response.status_code = 200;
        response.status = 'success';
        response.message = result.message;
        response.data = {
            expense: result.data,
            ui_message: {
                title: '✅ Category Updated',
                description: 'You have manually set the tax category for this expense. It will be marked as Manual with 100% confidence.',
                badge: {
                    status: 'Manual',
                    color: '#6366f1',
                    text: 'Manual Override'
                }
            }
        };

        console.log('[OverrideTaxCategory] Success:', { 
            expenses_id,
            new_tax_id: tax_id,
            mapping_status: 'Manual'
        });

        return res.status(response.status_code).json(response);

    } catch (error) {
        console.error('[OverrideTaxCategory] Error:', error);
        response = INTERNAL_SERVER_ERROR_API_RESPONSE;
        response.message = 'An error occurred while overriding category';
        response.data = { error: error.message };
        return res.status(response.status_code).json(response);
    }
});

module.exports = router;
