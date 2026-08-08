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
const { validateSubmittedItems } = require('../../../utils/expenseItems');
const { upload, verifyUploadedFiles, getFileUrl } = require('../../../configs/fileUpload');
const { CreateReceipt } = require('../../../models/AppModel/Receipt');
const { computeFileHash, computePerceptualHash } = require('../../../utils/receiptHash');
const db = require('../../../utils/sqlbuilder');

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
router.put('/:id', upload.single('receipt_file'), verifyUploadedFiles, async (req, res) => {
    let response = { ...DEFAULT_API_RESPONSE };
    let user = req.user || null;

    if (CHECK_EMPTY(user)) {
        response = { ...UNAUTHORIZED_API_RESPONSE };
        response.message = ERROR_UNAUTHENTICATED;
        return res.status(response.status_code).json(response);
    }

    try {
        const account_id = user.account_id;
        const expenses_id = parseInt(req.params.id);
        const params = req.body;

        if (!expenses_id || isNaN(expenses_id)) {
            response = { ...BAD_REQUEST_API_RESPONSE };
            response.message = 'Invalid expense ID';
            return res.status(response.status_code).json(response);
        }

        // Ownership is established here, before anything is written. It used to be
        // checked only inside updateExpense — so a request that sent items and nothing
        // else skipped the check entirely, and any authenticated user could replace
        // any other user's expense items by guessing an id.
        const owned = await ExpensesModel.getExpenseById(account_id, expenses_id);
        if (!owned.status) {
            response = { ...NOT_FOUND_API_RESPONSE, message: 'Expense not found' };
            return res.status(response.status_code).json(response);
        }

        console.log('[UpdateExpense] Request:', { account_id, expenses_id });

        // Build update object (only include provided fields)
        const updateData = {};

        if (params.expenses_date !== undefined) {
            // Validate date format
            const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
            if (!dateRegex.test(params.expenses_date)) {
                response = { ...BAD_REQUEST_API_RESPONSE };
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
                response = { ...BAD_REQUEST_API_RESPONSE };
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

        // Items go through the same strict validator as create: positive prices,
        // quantity of at least one, a name per line — a bad line is a 400 naming it.
        let items = null;
        let shouldUpdateItems = false;

        if (params.items !== undefined) {
            shouldUpdateItems = true;

            let rawItems = params.items;
            if (typeof rawItems === 'string') {
                try {
                    rawItems = JSON.parse(rawItems);
                } catch (jsonError) {
                    response = { ...BAD_REQUEST_API_RESPONSE, message: 'items is not valid JSON.' };
                    return res.status(response.status_code).json(response);
                }
            }

            const validated = validateSubmittedItems(rawItems);
            if (validated.errors) {
                response = { ...BAD_REQUEST_API_RESPONSE, message: validated.errors.join(' ') };
                return res.status(response.status_code).json(response);
            }
            items = validated.items.map(item => ({
                ...item,
                item_sku_unit: item.item_sku_unit ? sanitize(item.item_sku_unit) : null,
                item_name: item.item_name ? sanitize(item.item_name) : null
            }));
        }

        // Optional replacement receipt. The new file becomes a new receipt row and the
        // expense repoints to it; the old row is archived, never deleted, so the
        // original upload stays on record.
        if (req.file) {
            const receipt_file_url = getFileUrl(req.file.path);
            let receipt_hash = null, receipt_phash = null;
            try {
                receipt_hash  = computeFileHash(req.file.path);
                receipt_phash = await computePerceptualHash(req.file.path, req.file.mimetype);
            } catch (hashErr) {
                console.warn('[UpdateExpense] Hashing replacement receipt failed (non-fatal):', hashErr.message);
            }

            const receiptResult = await CreateReceipt({
                account_id: parseInt(account_id),
                receipt_name: params.expenses_merchant_name || owned.data.expenses_merchant_name || 'Expense Receipt',
                receipt_description: `Replacement receipt for expense ${expenses_id}`,
                receipt_amount: parseFloat(params.expenses_total_amount || owned.data.expenses_total_amount) || 0,
                receipt_image_url: receipt_file_url,
                receipt_metadata: JSON.stringify({
                    original_name: req.file.originalname,
                    mimetype: req.file.mimetype,
                    size: req.file.size,
                    replaces_receipt_id: owned.data.receipt_id || null,
                    uploaded_date: new Date().toISOString()
                }),
                receipt_hash,
                receipt_phash: receipt_phash !== null ? receipt_phash.toString() : null,
                status: 'Active'
            });

            if (receiptResult.status) {
                updateData.receipt_id = receiptResult.data;
                if (owned.data.receipt_id) {
                    await db.raw(
                        `UPDATE receipt SET status = 'Inactive', last_modified = NOW()
                          WHERE receipt_id = ? AND account_id = ?`,
                        [owned.data.receipt_id, account_id]
                    ).catch((e) => console.warn('[UpdateExpense] old receipt archive failed:', e.message));
                }
            } else {
                console.warn('[UpdateExpense] Replacement receipt row failed — file kept, expense unchanged');
            }
        }

        if (Object.keys(updateData).length === 0 && !shouldUpdateItems) {
            response = { ...BAD_REQUEST_API_RESPONSE };
            response.message = 'No fields to update';
            return res.status(response.status_code).json(response);
        }

        // Update expense (only if there are fields to update)
        let result = null;
        if (Object.keys(updateData).length > 0) {
            result = await ExpensesModel.updateExpense(account_id, expenses_id, updateData);

            if (!result.status) {
                response = { ...NOT_FOUND_API_RESPONSE };
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
        response = { ...INTERNAL_SERVER_ERROR_API_RESPONSE };
        response.message = 'An error occurred while updating expense';
        response.data = { error: error.message };
        return res.status(response.status_code).json(response);
    }
});

module.exports = router;
