/**
 * Expenses Model - Enhanced with Tax Mapping Integration
 * Combines NLP categorization with stored procedure logic
 * 
 * @author TaxLah Development Team
 * @date 2026-03-02
 */

const db = require("../../../utils/sqlbuilder");
const { categorizeReceiptFull } = require("../TaxCategorizationServices");
const { CreateReceipt } = require("../Receipt");

const ERROR_DB = 'Database error occurred. Please contact system administrator.';

/**
 * Check if official LHDN mapping exists for a tax year
 * Calls stored procedure: sp_check_official_mapping_exists
 */
const checkOfficialMappingExists = async (taxYear) => {
    try {
        const sql = `CALL sp_check_official_mapping_exists(?, @exists, @published_date)`;
        await db.raw(sql, [taxYear]);
        
        const result = await db.raw(`SELECT @exists as \`exists\`, @published_date as published_date`);
        
        return {
            status: true,
            exists: result[0].exists === 1,
            publishedDate: result[0].published_date,
            message: result[0].exists === 1 ? 'Official mapping available' : 'Using preliminary mapping'
        };
    } catch (error) {
        console.error('[ExpensesModel] checkOfficialMappingExists error:', error);
        return { status: false, exists: false, publishedDate: null, message: error.message };
    }
};

/**
 * Upload expense with smart mapping
 * Calls stored procedure: sp_upload_receipt_with_mapping
 * This handles the preliminary vs official mapping logic automatically
 */
const uploadExpenseWithMapping = async (expenseData) => {
    try {
        const {
            account_id,
            expenses_date,
            expenses_merchant_name,
            expenses_total_amount,
            expenses_merchant_id = null,
            expenses_receipt_no = null
        } = expenseData;

        const sql = `
            CALL sp_upload_receipt_with_mapping(
                ?, ?, ?, ?, ?, ?,
                @expenses_id, @mapping_status, @tax_category_name, @confidence, @message
            )
        `;

        await db.raw(sql, [
            account_id,
            expenses_date,
            expenses_merchant_name,
            expenses_total_amount,
            expenses_merchant_id,
            expenses_receipt_no
        ]);

        const result = await db.raw(`
            SELECT 
                @expenses_id as expenses_id,
                @mapping_status as mapping_status,
                @tax_category_name as tax_category_name,
                @confidence as confidence,
                @message as message
        `);

        return {
            status: true,
            data: result[0],
            message: 'Expense created with smart mapping'
        };
    } catch (error) {
        console.error('[ExpensesModel] uploadExpenseWithMapping error:', error);
        return { status: false, data: null, message: error.message };
    }
};

/**
 * Create expense items
 * Inserts multiple items for an expense
 */
const createExpenseItems = async (expenses_id, items) => {
    try {
        if (!items || !Array.isArray(items) || items.length === 0) {
            return { status: true, count: 0, message: 'No items to insert' };
        }

        const insertedItems = [];

        for (const item of items) {
            const itemData = {
                expenses_id: parseInt(expenses_id),
                item_sku_unit: item.item_sku_unit || null,
                item_name: item.item_name || null,
                item_unit_price: parseFloat(item.item_unit_price || 0),
                item_quantity: parseInt(item.item_quantity || 0),
                item_total_price: parseFloat(item.item_total_price || 0),
                status: 'Active',
                created_date: new Date(),
                last_modified: new Date()
            };

            const insertResult = await db.insert('account_expenses_item', itemData);
            
            if (insertResult.insertId) {
                insertedItems.push({
                    item_id: insertResult.insertId,
                    ...itemData
                });
            }
        }

        return {
            status: true,
            count: insertedItems.length,
            data: insertedItems,
            message: `${insertedItems.length} item(s) created successfully`
        };
    } catch (error) {
        console.error('[ExpensesModel] createExpenseItems error:', error);
        return { status: false, count: 0, data: null, message: error.message };
    }
};

/**
 * Create expense with NLP-enhanced categorization
 * Uses NLP to determine category, then calls stored procedure for proper status
 * Now supports receipt file attachment
 * @param {object} expenseData
 * @param {boolean} useAI - If true, skip NLP and dispatch AI queue job instead
 */
const createExpenseEnhanced = async (expenseData, useAI = false) => {
    try {
        const {
            account_id,
            expenses_date,
            expenses_merchant_name,
            expenses_merchant_id = null,
            expenses_total_amount,
            expenses_receipt_no = null,
            expenses_tags = null,
            expenses_for = 'Self',
            dependant_id = null,
            items = [],
            // Receipt file data
            receipt_file_url = null,
            receipt_metadata = null
        } = expenseData;

        // Step 0: Create receipt record if file is uploaded
        let receipt_id = null;
        if (receipt_file_url) {
            const receiptData = {
                account_id: parseInt(account_id),
                receipt_name: expenses_merchant_name || 'Expense Receipt',
                receipt_description: `Receipt for ${expenses_merchant_name || 'expense'} on ${expenses_date}`,
                receipt_amount: parseFloat(expenses_total_amount),
                receipt_items: items && items.length > 0 ? JSON.stringify(items) : null,
                receipt_image_url: receipt_file_url,
                receipt_metadata: receipt_metadata ? JSON.stringify(receipt_metadata) : null,
                status: 'Active'
            };

            const receiptResult = await CreateReceipt(receiptData);
            if (receiptResult.status) {
                receipt_id = receiptResult.data;
                console.log('[ExpensesModel] Receipt created:', receipt_id);
            } else {
                console.warn('[ExpensesModel] Failed to create receipt, continuing without receipt_id');
            }
        }

        // Step 1: Use NLP to categorize (only when not using AI queue)
        let categorization = { tax_id: null, taxsub_id: null, confidence: 50, tax_code: null, tax_title: null, taxsub_title: null, matched_keywords: [] };

        const taxYear = new Date(expenses_date).getFullYear();

        if (!useAI) {
            const receiptData = {
                receipt_id: receipt_id,
                MerchantName: expenses_merchant_name,
                Items: []
            };
            categorization = await categorizeReceiptFull(receiptData, taxYear);
            console.log('[ExpensesModel] NLP Categorization:', categorization);
        }

        // Step 2: Check if official mapping exists
        const mappingCheck = await checkOfficialMappingExists(taxYear);

        // Step 3: Determine mapping status
        const mappingStatus = mappingCheck.exists ? 'Confirmed' : 'Estimated';
        const mappingVersion = mappingCheck.exists 
            ? `${taxYear}-official` 
            : `${taxYear}-preliminary`;

        // Step 4: Insert expense with categorization
        const insertData = {
            account_id: parseInt(account_id),
            expenses_date,
            expenses_year: taxYear,
            expenses_merchant_name,
            expenses_merchant_id,
            expenses_total_amount: parseFloat(expenses_total_amount),
            expenses_receipt_no,
            expenses_tags,
            expenses_tax_category: categorization.tax_id || null,
            expenses_tax_subcategory: categorization.taxsub_id || null,
            expenses_mapping_status: mappingStatus,
            expenses_mapping_confidence: categorization.confidence || 50,
            expenses_mapping_version: mappingVersion,
            expenses_original_tax_category: categorization.tax_id || null,
            expenses_mapping_date: new Date(),
            expenses_tax_eligible: useAI ? 'No' : 'Yes',
            ai_processing_status: useAI ? 'Queued' : 'None',
            expenses_for,
            dependant_id,
            status: 'Active',
            created_date: new Date(),
            last_modified: new Date()
        };

        const insertResult = await db.insert('account_expenses', insertData);

        if (!insertResult.insertId) {
            throw new Error('Failed to insert expense');
        }

        // Step 4.5: Create expense items if provided
        let itemsResult = { count: 0, data: [] };
        if (items && Array.isArray(items) && items.length > 0) {
            itemsResult = await createExpenseItems(insertResult.insertId, items);
            console.log('[ExpensesModel] Items created:', itemsResult.count);
        }

        // Step 5: Log to history table
        await db.insert('account_expenses_mapping_history', {
            expenses_id: insertResult.insertId,
            new_tax_category: categorization.tax_id || null,
            new_tax_subcategory: categorization.taxsub_id || null,
            change_reason: 'Initial',
            confidence_after: categorization.confidence || 50,
            mapping_version_after: mappingVersion,
            changed_by: 'System',
            changed_date: new Date()
        });

        // Step 6: Get complete expense details
        const expense = await getExpenseById(account_id, insertResult.insertId);

        return {
            status: true,
            data: {
                ...expense.data,
                receipt_id: receipt_id,
                receipt_url: receipt_file_url,
                items: itemsResult.data || [],
                items_count: itemsResult.count || 0,
                categorization: {
                    tax_code: categorization.tax_code,
                    tax_title: categorization.tax_title,
                    subcategory: categorization.taxsub_title || null,
                    confidence: categorization.confidence,
                    matched_keywords: categorization.matched_keywords || []
                },
                mapping_info: {
                    status: mappingStatus,
                    version: mappingVersion,
                    is_official: mappingCheck.exists,
                    message: mappingCheck.exists 
                        ? 'Categorized using official LHDN mapping'
                        : `Estimated category. Official ${taxYear} LHDN mapping will be available in October.`
                }
            },
            message: 'Expense created successfully with smart categorization'
        };
    } catch (error) {
        console.error('[ExpensesModel] createExpenseEnhanced error:', error);
        return { status: false, data: null, message: error.message };
    }
};

/**
 * Get all expenses for a user with filters
 */
const getAllExpenses = async (account_id, filters = {}) => {
    try {
        const {
            offset = 0,
            limit = 20,
            search = '',
            year = null,
            mapping_status = null,
            tax_category = null,
            min_confidence = null,
            sort_by = 'expenses_date',
            sort_order = 'DESC'
        } = filters;

        let whereConditions = ['ae.status = ? AND ae.account_id = ?'];
        let params = ['Active', account_id];

        // Search filter
        if (search) {
            whereConditions.push(`(
                ae.expenses_tags LIKE ? OR 
                ae.expenses_merchant_name LIKE ? OR 
                ae.expenses_receipt_no LIKE ? OR
                tc.tax_title LIKE ?
            )`);
            const searchPattern = `%${search}%`;
            params.push(searchPattern, searchPattern, searchPattern, searchPattern);
        }

        // Year filter
        if (year) {
            whereConditions.push('ae.expenses_year = ?');
            params.push(year);
        }

        // Mapping status filter
        if (mapping_status) {
            whereConditions.push('ae.expenses_mapping_status = ?');
            params.push(mapping_status);
        }

        // Tax category filter
        if (tax_category) {
            whereConditions.push('ae.expenses_tax_category = ?');
            params.push(tax_category);
        }

        // Confidence filter
        if (min_confidence !== null) {
            whereConditions.push('ae.expenses_mapping_confidence >= ?');
            params.push(min_confidence);
        }

        const whereClause = whereConditions.join(' AND ');

        // Get total count
        const countSql = `
            SELECT COUNT(*) as total
            FROM account_expenses ae
            LEFT JOIN tax_category tc ON ae.expenses_tax_category = tc.tax_id
            WHERE ${whereClause}
        `;
        const countResult = await db.raw(countSql, params);
        const total = countResult[0].total;

        // Get expenses
        const sql = `
            SELECT 
                ae.expenses_id,
                ae.expenses_tags,
                ae.expenses_receipt_no,
                ae.expenses_merchant_name,
                ae.expenses_merchant_id,
                ae.expenses_total_amount,
                ae.expenses_date,
                ae.expenses_year,
                ae.expenses_tax_eligible,
                ae.expenses_mapping_status,
                ae.expenses_mapping_confidence,
                ae.expenses_mapping_version,
                ae.expenses_mapping_date,
                ae.expenses_for,
                tc.tax_id,
                tc.tax_code,
                tc.tax_title,
                tc.tax_max_claim,
                ts.taxsub_id,
                ts.taxsub_title,
                ts.taxsub_max_claim,
                ad.dependant_name,
                ae.created_date
            FROM account_expenses ae
            LEFT JOIN tax_category tc ON ae.expenses_tax_category = tc.tax_id
            LEFT JOIN tax_subcategory ts ON ae.expenses_tax_subcategory = ts.taxsub_id
            LEFT JOIN account_dependant ad ON ae.dependant_id = ad.dependant_id
            WHERE ${whereClause}
            ORDER BY ae.${sort_by} ${sort_order}
            LIMIT ${limit} OFFSET ${offset}
        `;

        // params.push(parseInt(limit), parseInt(offset));
        const expenses = await db.raw(sql, params);

        return {
            status: true,
            data: {
                expenses,
                pagination: {
                    total,
                    limit: parseInt(limit),
                    offset: parseInt(offset),
                    totalPages: Math.ceil(total / limit),
                    currentPage: Math.floor(offset / limit) + 1
                }
            },
            message: `Found ${total} expense(s)`
        };
    } catch (error) {
        console.error('[ExpensesModel] getAllExpenses error:', error);
        return { status: false, data: null, message: error.message };
    }
};

/**
 * Get single expense by ID with full details
 */
const getExpenseById = async (account_id, expenses_id) => {
    try {
        const sql = `
            SELECT 
                ae.*,
                tc.tax_code,
                tc.tax_title,
                tc.tax_max_claim,
                tc.tax_mapping_status as category_mapping_status,
                ts.taxsub_code,
                ts.taxsub_title,
                ts.taxsub_max_claim,
                ad.dependant_name,
                ad.dependant_type,
                (SELECT COUNT(*) FROM account_expenses_mapping_history 
                WHERE expenses_id = ae.expenses_id) as change_count,
                (SELECT changed_date FROM account_expenses_mapping_history 
                WHERE expenses_id = ae.expenses_id 
                ORDER BY changed_date DESC LIMIT 1) as last_change_date
            FROM account_expenses ae
            LEFT JOIN tax_category tc ON ae.expenses_tax_category = tc.tax_id
            LEFT JOIN tax_subcategory ts ON ae.expenses_tax_subcategory = ts.taxsub_id
            LEFT JOIN account_dependant ad ON ae.dependant_id = ad.dependant_id
            WHERE ae.account_id = ? AND ae.expenses_id = ? AND ae.status = 'Active'
            LIMIT 1
        `;

        const result = await db.raw(sql, [account_id, expenses_id]);

        if (result.length === 0) {
            return { status: false, data: null, message: 'Expense not found' };
        }

        return {
            status: true,
            data: result[0],
            message: 'Expense details retrieved'
        };
    } catch (error) {
        console.error('[ExpensesModel] getExpenseById error:', error);
        return { status: false, data: null, message: error.message };
    }
};

/**
 * Update expense
 */
const updateExpense = async (account_id, expenses_id, updateData) => {
    try {
        // Verify ownership
        const expenseCheck = await getExpenseById(account_id, expenses_id);
        if (!expenseCheck.status) {
            return { status: false, message: 'Expense not found or access denied' };
        }

        // Update with timestamp
        const dataToUpdate = {
            ...updateData,
            last_modified: new Date()
        };

        const result = await db.update('account_expenses', dataToUpdate, {
            expenses_id,
            account_id
        });

        if (result) {
            // Get updated expense
            const updated = await getExpenseById(account_id, expenses_id);
            return {
                status: true,
                data: updated.data,
                message: 'Expense updated successfully'
            };
        }

        return { status: false, message: 'Failed to update expense' };
    } catch (error) {
        console.error('[ExpensesModel] updateExpense error:', error);
        return { status: false, message: error.message };
    }
};

/**
 * Manually override tax category
 */
const overrideTaxCategory = async (account_id, expenses_id, tax_id, taxsub_id = null) => {
    try {
        // Verify ownership
        const expenseCheck = await getExpenseById(account_id, expenses_id);
        if (!expenseCheck.status) {
            return { status: false, message: 'Expense not found or access denied' };
        }

        const oldExpense = expenseCheck.data;

        // Update expense with manual override
        const updateData = {
            expenses_tax_category: tax_id,
            expenses_tax_subcategory: taxsub_id,
            expenses_mapping_status: 'Manual',
            expenses_mapping_confidence: 100.00,
            expenses_mapping_date: new Date(),
            last_modified: new Date()
        };

        const result = await db.update('account_expenses', updateData, {
            expenses_id,
            account_id
        });

        if (!result) {
            throw new Error('Failed to update expense category');
        }

        // Trigger will log to history, but we can also log explicitly for better control
        // The trigger handles this automatically

        // Get updated expense
        const updated = await getExpenseById(account_id, expenses_id);

        return {
            status: true,
            data: updated.data,
            message: 'Category overridden successfully. Marked as Manual with 100% confidence.'
        };
    } catch (error) {
        console.error('[ExpensesModel] overrideTaxCategory error:', error);
        return { status: false, message: error.message };
    }
};

/**
 * Soft delete expense
 */
const deleteExpense = async (account_id, expenses_id) => {
    try {
        const result = await db.update('account_expenses', {
            status: 'Deleted',
            last_modified: new Date()
        }, {
            expenses_id,
            account_id
        });

        if (result) {
            return { status: true, message: 'Expense deleted successfully' };
        }

        return { status: false, message: 'Failed to delete expense' };
    } catch (error) {
        console.error('[ExpensesModel] deleteExpense error:', error);
        return { status: false, message: error.message };
    }
};

/**
 * Get expenses requiring review (low confidence or pending)
 */
const getExpensesRequiringReview = async (account_id, limit = 20) => {
    try {
        const sql = `
            SELECT * FROM v_expenses_requiring_review
            WHERE account_id = ?
            ORDER BY expenses_mapping_confidence ASC, expenses_date DESC
            LIMIT ?
        `;

        const expenses = await db.raw(sql, [account_id, limit]);

        return {
            status: true,
            data: expenses,
            count: expenses.length,
            message: `Found ${expenses.length} expense(s) requiring review`
        };
    } catch (error) {
        console.error('[ExpensesModel] getExpensesRequiringReview error:', error);
        return { status: false, data: [], message: error.message };
    }
};

/**
 * Get mapping dashboard for user
 */
const getMappingDashboard = async (account_id, tax_year = null) => {
    try {
        // Get overall dashboard
        const dashboardSql = `
            SELECT * FROM v_account_mapping_dashboard
            WHERE account_id = ?
        `;
        const dashboard = await db.raw(dashboardSql, [account_id]);

        // Get year-specific breakdown
        let yearFilter = tax_year ? 'AND expenses_year = ?' : '';
        let yearParams = tax_year ? [account_id, tax_year] : [account_id];

        const breakdownSql = `
            SELECT * FROM v_user_expenses_mapping_status
            WHERE account_id = ?
            ${yearFilter}
            ORDER BY expenses_year DESC, expenses_mapping_status
        `;
        const breakdown = await db.raw(breakdownSql, yearParams);

        return {
            status: true,
            data: {
                summary: dashboard[0] || null,
                breakdown: breakdown
            },
            message: 'Mapping dashboard retrieved'
        };
    } catch (error) {
        console.error('[ExpensesModel] getMappingDashboard error:', error);
        return { status: false, data: null, message: error.message };
    }
};

/**
 * Get expense statistics
 */
const getExpenseStats = async (account_id, year = null) => {
    try {
        const yearFilter = year ? 'AND expenses_year = ?' : '';
        const params = year ? [account_id, year] : [account_id];

        const sql = `
            SELECT 
                COUNT(*) as total_count,
                SUM(expenses_total_amount) as total_amount,
                AVG(expenses_total_amount) as avg_amount,
                SUM(CASE WHEN expenses_mapping_status = 'Confirmed' THEN 1 ELSE 0 END) as confirmed_count,
                SUM(CASE WHEN expenses_mapping_status = 'Estimated' THEN 1 ELSE 0 END) as estimated_count,
                SUM(CASE WHEN expenses_mapping_status = 'Pending' THEN 1 ELSE 0 END) as pending_count,
                SUM(CASE WHEN expenses_mapping_status = 'Manual' THEN 1 ELSE 0 END) as manual_count,
                AVG(expenses_mapping_confidence) as avg_confidence,
                SUM(CASE WHEN expenses_mapping_confidence < 70 THEN 1 ELSE 0 END) as low_confidence_count,
                MIN(expenses_date) as earliest_expense,
                MAX(expenses_date) as latest_expense
            FROM account_expenses
            WHERE account_id = ? AND status = 'Active'
            ${yearFilter}
        `;

        const stats = await db.raw(sql, params);

        // Get breakdown by category
        const categorySql = `
            SELECT 
                tc.tax_code,
                tc.tax_title,
                COUNT(*) as expense_count,
                SUM(ae.expenses_total_amount) as total_amount,
                AVG(ae.expenses_mapping_confidence) as avg_confidence
            FROM account_expenses ae
            LEFT JOIN tax_category tc ON ae.expenses_tax_category = tc.tax_id
            WHERE ae.account_id = ? AND ae.status = 'Active'
            ${yearFilter}
            GROUP BY tc.tax_id
            ORDER BY total_amount DESC
        `;

        const categoryBreakdown = await db.raw(categorySql, params);

        return {
            status: true,
            data: {
                overview: stats[0],
                by_category: categoryBreakdown
            },
            message: 'Expense statistics retrieved'
        };
    } catch (error) {
        console.error('[ExpensesModel] getExpenseStats error:', error);
        return { status: false, data: null, message: error.message };
    }
};

/**
 * Get mapping history for an expense
 */
const getMappingHistory = async (expenses_id) => {
    try {
        const sql = `
            SELECT 
                h.*,
                old_tc.tax_title as old_category_name,
                new_tc.tax_title as new_category_name,
                old_ts.taxsub_title as old_subcategory_name,
                new_ts.taxsub_title as new_subcategory_name
            FROM account_expenses_mapping_history h
            LEFT JOIN tax_category old_tc ON h.old_tax_category = old_tc.tax_id
            LEFT JOIN tax_category new_tc ON h.new_tax_category = new_tc.tax_id
            LEFT JOIN tax_subcategory old_ts ON h.old_tax_subcategory = old_ts.taxsub_id
            LEFT JOIN tax_subcategory new_ts ON h.new_tax_subcategory = new_ts.taxsub_id
            WHERE h.expenses_id = ?
            ORDER BY h.changed_date DESC
        `;

        const history = await db.raw(sql, [expenses_id]);

        return {
            status: true,
            data: history,
            count: history.length,
            message: `Found ${history.length} change(s)`
        };
    } catch (error) {
        console.error('[ExpensesModel] getMappingHistory error:', error);
        return { status: false, data: [], message: error.message };
    }
};

/**
 * Get expense items
 * Retrieves all items for a specific expense
 */
const getExpenseItems = async (expenses_id) => {
    try {
        const sql = `
            SELECT 
                item_id,
                item_sku_unit,
                item_name,
                item_unit_price,
                item_quantity,
                item_total_price,
                status,
                created_date,
                last_modified,
                expenses_id
            FROM account_expenses_item
            WHERE expenses_id = ? AND status = 'Active'
            ORDER BY item_id ASC
        `;

        const items = await db.raw(sql, [expenses_id]);

        return {
            status: true,
            data: items,
            count: items.length,
            message: `Found ${items.length} item(s)`
        };
    } catch (error) {
        console.error('[ExpensesModel] getExpenseItems error:', error);
        return { status: false, data: [], count: 0, message: error.message };
    }
};

/**
 * Dispatch an AI receipt analysis job to the queue.
 * Should be called after createExpenseEnhanced when useAI = true.
 * @param {number} expenses_id
 * @param {number} account_id
 * @param {string} file_path - Absolute path to the uploaded file on disk
 * @param {string} mime_type - File mime type (e.g. image/jpeg, application/pdf)
 */
const dispatchAIReceiptAnalysis = async (expenses_id, account_id, receiptData) => {
    try {
        const queues = require('../../../queue');
        const job = await queues['ai-receipt'].add('analyseReceipt', {
            expenses_id,
            account_id,
            merchant:     receiptData.merchant     ?? null,
            date:         receiptData.date          ?? null,
            total_amount: receiptData.total_amount  ?? 0,
            items:        receiptData.items         || []
        }, {
            attempts: 1,
            backoff: { type: 'fixed', delay: 5000 },
            removeOnComplete: true,
            removeOnFail: false
        });
        console.log(`[ExpensesModel] AI receipt job queued: job_id=${job.id}, expenses_id=${expenses_id}`);
        return { status: true, job_id: job.id };
    } catch (error) {
        console.error('[ExpensesModel] dispatchAIReceiptAnalysis error:', error);
        return { status: false };
    }
};

module.exports = {
    // Smart creation methods
    createExpenseEnhanced,
    uploadExpenseWithMapping,
    dispatchAIReceiptAnalysis,
    
    // CRUD operations
    getAllExpenses,
    getExpenseById,
    getExpenseItems,
    updateExpense,
    deleteExpense,
    
    // Mapping operations
    checkOfficialMappingExists,
    overrideTaxCategory,
    getExpensesRequiringReview,
    getMappingDashboard,
    getMappingHistory,
    
    // Statistics
    getExpenseStats
};
