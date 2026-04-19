/**
 * Create Expense Controller
 * Creates expense with smart NLP-based tax categorization
 * Now supports receipt file uploads (images and PDFs)
 * 
 * POST /api/expenses/create
 * 
 * @author TaxLah Development Team
 * @date 2026-03-02
 * @updated 2026-03-31 - Added receipt file upload support
 */

const express = require('express');
const router = express.Router();
const { 
    DEFAULT_API_RESPONSE, 
    INTERNAL_SERVER_ERROR_API_RESPONSE,
    BAD_REQUEST_API_RESPONSE,
    UNAUTHORIZED_API_RESPONSE,
    FORBIDDEN_API_RESPONSE,
    ERROR_UNAUTHENTICATED,
    CHECK_EMPTY,
    sanitize
} = require('../../../configs/helper');
const ExpensesModel = require('../../../models/AppModel/Expenses');
const { upload, getFileUrl } = require('../../../configs/fileUpload');
const NotificationService = require('../../../services/NotificationService');
const { checkSubscriptionAccess } = require('../../../models/AppModel/SubscriptionService');

/**
 * POST /api/expenses/create
 * Create new expense with smart categorization
 * 
 * Body (multipart/form-data):
 * {
 *   expenses_date: "2026-01-15"             // Required
 *   expenses_merchant_name: "Popular"       // Required
 *   expenses_total_amount: 250.00           // Required
 *   expenses_merchant_id: "MERCHANT-123"    // Optional
 *   expenses_receipt_no: "RCP-2026-001"     // Optional
 *   expenses_tags: "books"                  // Optional
 *   expenses_for: "Self"                    // Optional: Self, Spouse, Child, Parent
 *   dependant_id: 1                         // Optional (if for dependant)
 *   receipt_file: [File]                    // Optional - Image or PDF file
 *   items: [                                // Optional - Array of purchased items (JSON string)
 *     {
 *       item_sku_unit: "SKU-001",           // Optional
 *       item_name: "Book - Rich Dad Poor Dad", // Optional
 *       item_unit_price: 45.00,             // Required
 *       item_quantity: 2,                   // Required
 *       item_total_price: 90.00             // Required
 *     }
 *   ]
 * }
 */
router.post('/', upload.single('receipt_file'), async (req, res) => {
    let response = DEFAULT_API_RESPONSE;
    let user = req.user || null;

    if (CHECK_EMPTY(user)) {
        response = UNAUTHORIZED_API_RESPONSE;
        response.message = ERROR_UNAUTHENTICATED;
        return res.status(response.status_code).json(response);
    }

    try {
        const params        = req.body;
        const account_id    = user.account_id;
        const uploadedFile  = req.file; // Get uploaded file if any

        console.log('[CreateExpense] Request:', { 
            account_id, 
            params,
            hasFile: !!uploadedFile,
            fileName: uploadedFile?.originalname
        });

        // Required fields
        const expenses_date             = params.expenses_date;
        const expenses_merchant_name    = params.expenses_merchant_name;
        const expenses_total_amount     = params.expenses_total_amount;

        // Validation
        if (CHECK_EMPTY(expenses_date)) {
            response = BAD_REQUEST_API_RESPONSE;
            response.message = 'Expense date is required';
            return res.status(response.status_code).json(response);
        }

        if (CHECK_EMPTY(expenses_merchant_name)) {
            response = BAD_REQUEST_API_RESPONSE;
            response.message = 'Merchant name is required';
            return res.status(response.status_code).json(response);
        }

        if (CHECK_EMPTY(expenses_total_amount) || isNaN(expenses_total_amount) || expenses_total_amount <= 0) {
            response = BAD_REQUEST_API_RESPONSE;
            response.message = 'Valid expense amount is required';
            return res.status(response.status_code).json(response);
        }

        // Validate date format
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!dateRegex.test(expenses_date)) {
            response = BAD_REQUEST_API_RESPONSE;
            response.message = 'Invalid date format. Use YYYY-MM-DD';
            return res.status(response.status_code).json(response);
        }

        // Validate and sanitize items if provided
        let items = [];
        if (params.items && Array.isArray(params.items)) {
            items = params.items.map(item => {
                // Validate required fields for items
                if (!item.item_unit_price || isNaN(item.item_unit_price)) {
                    throw new Error('Item unit price is required and must be a number');
                }
                if (!item.item_quantity || isNaN(item.item_quantity) || item.item_quantity < 1) {
                    throw new Error('Item quantity is required and must be at least 1');
                }
                if (!item.item_total_price || isNaN(item.item_total_price)) {
                    throw new Error('Item total price is required and must be a number');
                }

                return {
                    item_sku_unit: item.item_sku_unit ? sanitize(item.item_sku_unit) : null,
                    item_name: item.item_name ? sanitize(item.item_name) : null,
                    item_unit_price: parseFloat(item.item_unit_price),
                    item_quantity: parseInt(item.item_quantity),
                    item_total_price: parseFloat(item.item_total_price)
                };
            });
        } else if (params.items && typeof params.items === 'string') {
            // Parse items if sent as JSON string (common in multipart form data)
            try {
                const parsedItems = JSON.parse(params.items);
                if (Array.isArray(parsedItems)) {
                    items = parsedItems.map(item => ({
                        item_sku_unit: item.item_sku_unit ? sanitize(item.item_sku_unit) : null,
                        item_name: item.item_name ? sanitize(item.item_name) : null,
                        item_unit_price: parseFloat(item.item_unit_price),
                        item_quantity: parseInt(item.item_quantity),
                        item_total_price: parseFloat(item.item_total_price)
                    }));
                }
            } catch (jsonError) {
                console.warn('[CreateExpense] Failed to parse items JSON:', jsonError);
            }
        }

        // Process uploaded receipt file
        let receipt_file_url = null;
        let receipt_metadata = null;
        let useAI = false;
        
        console.log("Processing uploading file...")
        if (uploadedFile) {
            // File uploaded directly — store it
            receipt_file_url = getFileUrl(uploadedFile.path);
            receipt_metadata = {
                original_name: uploadedFile.originalname,
                mimetype: uploadedFile.mimetype,
                size: uploadedFile.size,
                uploaded_date: new Date().toISOString()
            };

            console.log('[CreateExpense] File uploaded:', {
                url: receipt_file_url,
                size: uploadedFile.size,
                type: uploadedFile.mimetype
            });
        } else if (params.receipt_file_url) {
            // File already uploaded at extract-receipt step — use the stored URL
            receipt_file_url = params.receipt_file_url;
        }

        console.log("Checking active subscription...")
        // AI gate: triggered when extracted_receipt_data is provided (from extract-receipt preview step)
        // Quota was already consumed at the extract step, so we only check subscription here.
        // if (params.extracted_receipt_data) {
        //     const subscriptionResult = await checkSubscriptionAccess(account_id);
        //     const hasAIFeature = subscriptionResult.success
        //         && subscriptionResult.has_access
        //         && subscriptionResult.features?.ai_categorization;

        //     if (hasAIFeature) {
        //         useAI = true;
        //         console.log('[CreateExpense] AI tax classification will be queued for this expense');
        //     } else {
        //         console.log('[CreateExpense] AI skipped: no active subscription or ai_categorization not enabled');
        //     }
        // }
        const subscriptionResult = await checkSubscriptionAccess(account_id);
        console.log("Log Check Subscription Result : ", subscriptionResult)
        
        const hasAIFeature = subscriptionResult.success && subscriptionResult.has_access && subscriptionResult.features?.ai_categorization;
        if (hasAIFeature) {
            useAI = true;
            console.log('[CreateExpense] AI tax classification will be queued for this expense');
        } else {
            console.log('[CreateExpense] AI skipped: no active subscription or ai_categorization not enabled');
        }

        console.log("Preparing data to create new expense record...")
        // Prepare expense data
        const expenseData = {
            account_id: parseInt(account_id),
            expenses_date,
            expenses_merchant_name: sanitize(expenses_merchant_name),
            expenses_total_amount: parseFloat(expenses_total_amount),
            expenses_merchant_id: params.expenses_merchant_id || null,
            expenses_receipt_no: params.expenses_receipt_no ? sanitize(params.expenses_receipt_no) : null,
            expenses_tags: params.expenses_tags ? sanitize(params.expenses_tags) : null,
            expenses_for: params.expenses_for || 'Self',
            dependant_id: params.dependant_id ? parseInt(params.dependant_id) : null,
            items: items,
            receipt_file_url: receipt_file_url,
            receipt_metadata: receipt_metadata
        };
        console.log("Expense Data : ", expenseData)

        console.log("Processing to create new expense record...")
        // Create expense (NLP path if no AI, or insert with ai_processing_status='Queued' if AI)
        const result = await ExpensesModel.createExpenseEnhanced(expenseData, useAI);
        console.log("Log create new expense record result : ", result)

        if (!result.status) {
            response = { ...INTERNAL_SERVER_ERROR_API_RESPONSE, message: result.message || 'Failed to create expense', data: null };
            return res.status(response.status_code).json(response);
        }

        console.log("Preparing for processing AI to identify tax category...")
        // If AI was enabled, dispatch the tax eligibility queue job (fire-and-forget)
        if (useAI) {
            console.log("Processing receipt for tax category identification...")
            ExpensesModel.dispatchAIReceiptAnalysis(
                result.data.expenses_id,
                account_id,
                {
                    merchant:     expenses_merchant_name,
                    date:         expenses_date,
                    total_amount: parseFloat(expenses_total_amount),
                    items:        items
                }
            ).catch(err => console.error('[CreateExpense] Failed to dispatch AI job:', err));
        }

        // Build response
        const aiQueued = useAI;
        response = {
            status_code: 201,
            status: 'success',
            message: aiQueued
                ? 'Expense saved. AI receipt analysis has been queued — you will be notified once complete.'
                : 'Expense created successfully',
            data: {
                expense: result.data,
                ai_analysis: {
                    queued: aiQueued,
                    status: aiQueued ? 'Queued' : 'None'
                },
                ui_message: aiQueued
                    ? {
                        title: '⏳ Analysing Receipt…',
                        description: 'Our AI is reviewing your receipt. Tax category and eligibility will be updated shortly.',
                        badge: { status: 'Queued', color: '#6366f1', text: 'AI Processing' }
                    }
                    : {
                        title: result.data?.mapping_info?.is_official ? '✅ Expense Categorized' : '⏳ Expense Saved (Estimated Category)',
                        description: result.data?.mapping_info?.message || '',
                        badge: {
                            status: result.data?.mapping_info?.status,
                            color: result.data?.mapping_info?.is_official ? '#10b981' : '#f59e0b',
                            text: result.data?.mapping_info?.is_official ? 'Confirmed' : 'Estimated'
                        }
                    }
            }
        };

        console.log('[CreateExpense] Success:', {
            expenses_id: result.data.expenses_id,
            ai_queued: aiQueued,
            mapping_status: result.data.expenses_mapping_status,
            confidence: result.data.expenses_mapping_confidence,
            items_count: result.data.items_count || 0,
            receipt_id: result.data.receipt_id || null
        });

        return res.status(response.status_code).json(response);

    } catch (error) {
        console.error('[CreateExpense] Error:', error);
        response = { ...INTERNAL_SERVER_ERROR_API_RESPONSE, message: 'An error occurred while creating expense', data: { error: error.message } };
        return res.status(response.status_code).json(response);
    }
});

module.exports = router;
