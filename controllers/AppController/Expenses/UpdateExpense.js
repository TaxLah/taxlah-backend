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
 *   items: [                              // Optional - Array of expense items
 *     {
 *       item_name: "Textbook",
 *       item_sku_unit: "SKU001",
 *       item_unit_price: 100.00,
 *       item_quantity: 2,
 *       item_total_price: 200.00
 *     }
 *   ]
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

        // Validate and sanitize items if provided
        let items = null;
        let shouldUpdateItems = false;
        
        if (params.items !== undefined) {
            shouldUpdateItems = true;
            
            if (Array.isArray(params.items)) {
                items = params.items.map(item => {
                    // Validate required fields for items
                    if (!item.item_name || item.item_name.trim() === '') {
                        throw new Error('Item name is required for each item');
                    }

                    return {
                        item_sku_unit: sanitize(item.item_sku_unit || ''),
                        item_name: sanitize(item.item_name),
                        item_unit_price: parseFloat(item.item_unit_price || 0),
                        item_quantity: parseInt(item.item_quantity || 0),
                        item_total_price: parseFloat(item.item_total_price || 0)
                    };
                });
            } else if (typeof params.items === 'string') {
                // Parse items if sent as JSON string (common in multipart form data)
                try {
                    const parsedItems = JSON.parse(params.items);
                    if (Array.isArray(parsedItems)) {
                        items = parsedItems.map(item => ({
                            item_sku_unit: sanitize(item.item_sku_unit || ''),
                            item_name: sanitize(item.item_name),
                            item_unit_price: parseFloat(item.item_unit_price || 0),
                            item_quantity: parseInt(item.item_quantity || 0),
                            item_total_price: parseFloat(item.item_total_price || 0)
                        }));
                    }
                } catch (jsonError) {
                    console.warn('[UpdateExpense] Failed to parse items JSON:', jsonError);
                    response = BAD_REQUEST_API_RESPONSE;
                    response.message = 'Invalid items format. Must be an array or valid JSON string';
                    return res.status(response.status_code).json(response);
                }
            }
        }

        if (Object.keys(updateData).length === 0 && !shouldUpdateItems) {
            response = BAD_REQUEST_API_RESPONSE;
            response.message = 'No fields to update';
            return res.status(response.status_code).json(response);
        }

        // Update expense (only if there are fields to update)
        let result = null;
        if (Object.keys(updateData).length > 0) {
            result = await ExpensesModel.updateExpense(account_id, expenses_id, updateData);

            if (!result.status) {
                response = NOT_FOUND_API_RESPONSE;
                response.message = result.message || 'Failed to update expense';
                return res.status(response.status_code).json(response);
            }
        }

        // Update items if provided
        let itemsResult = null;
        if (shouldUpdateItems) {
            itemsResult = await ExpensesModel.updateExpenseItems(expenses_id, items || []);
            
            if (!itemsResult.status) {
                console.warn('[UpdateExpense] Items update failed:', itemsResult.message);
                // Don't fail the entire request if items update fails
                // but log it for investigation
            } else {
                console.log('[UpdateExpense] Items updated:', itemsResult.count);
            }
        }

        // If neither expense nor items were updated, fetch current expense data
        if (!result) {
            result = await ExpensesModel.getExpenseById(account_id, expenses_id);
        }

        // Success response
        response.status_code = 200;
        response.status = 'success';
        response.message = result.message || 'Expense updated successfully';
        response.data = {
            ...result.data,
            ...(itemsResult ? { 
                items_updated: true,
                items_count: itemsResult.count 
            } : {})
        };

        console.log('[UpdateExpense] Success:', { expenses_id, items_updated: shouldUpdateItems });

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
