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
 * Check for duplicate expense before inserting.
 *
 * Three layers, evaluated in order (cheapest first):
 *   Layer 1 – receipt_no exact match (when provided)
 *   Layer 2 – SHA-256 exact file hash match (same file uploaded twice)
 *   Layer 3 – perceptual hash similarity (same receipt photographed twice, Hamming ≤ PHASH_THRESHOLD)
 *   Layer 4 – semantic signal: account_id + date + merchant + amount
 *
 * @param {number} account_id
 * @param {string} expenses_date          YYYY-MM-DD
 * @param {string} expenses_merchant_name
 * @param {number} expenses_total_amount
 * @param {object} [receiptHashes]        Optional { receipt_no, receipt_hash, receipt_phash }
 */
const { PHASH_THRESHOLD } = require('../../../utils/receiptHash');

const checkDuplicateExpense = async (
    account_id,
    expenses_date,
    expenses_merchant_name,
    expenses_total_amount,
    receiptHashes = {}
) => {
    try {
        const { receipt_no, receipt_hash, receipt_phash } = receiptHashes;

        // Layer 1: receipt number (exact, cheapest)
        if (receipt_no) {
            const byReceiptNo = await db.raw(
                `SELECT ae.expenses_id, ae.expenses_receipt_no
                 FROM account_expenses ae
                 WHERE ae.account_id = ?
                   AND ae.expenses_receipt_no = ?
                   AND ae.status = 'Active'
                 LIMIT 1`,
                [account_id, receipt_no]
            );
            if (byReceiptNo.length > 0) {
                return {
                    isDuplicate: true,
                    matchedBy: 'receipt_no',
                    existingExpense: byReceiptNo[0]
                };
            }
        }

        // Layer 2: exact file hash (SHA-256)
        if (receipt_hash) {
            const byExactHash = await db.raw(
                `SELECT ae.expenses_id, r.receipt_hash
                 FROM account_expenses ae
                 JOIN receipt r ON r.receipt_id = ae.receipt_id
                 WHERE ae.account_id = ?
                   AND r.receipt_hash = ?
                   AND ae.status = 'Active'
                 LIMIT 1`,
                [account_id, receipt_hash]
            );
            if (byExactHash.length > 0) {
                return {
                    isDuplicate: true,
                    matchedBy: 'exact_file_hash',
                    existingExpense: byExactHash[0]
                };
            }
        }

        // Layer 3: perceptual hash (similar-looking image)
        if (receipt_phash != null) {
            // Fetch candidate receipts for this account that have a phash stored,
            // then do the Hamming distance check in JS (MySQL BIT_COUNT on BIGINT UNSIGNED
            // requires the value to fit — we keep it safe by doing it here).
            const candidates = await db.raw(
                `SELECT ae.expenses_id, r.receipt_id, r.receipt_phash
                 FROM account_expenses ae
                 JOIN receipt r ON r.receipt_id = ae.receipt_id
                 WHERE ae.account_id = ?
                   AND r.receipt_phash IS NOT NULL
                   AND ae.status = 'Active'`,
                [account_id]
            );
            for (const row of candidates) {
                const storedPhash = BigInt(row.receipt_phash);
                let xor = storedPhash ^ receipt_phash;
                let dist = 0;
                while (xor > 0n) { if (xor & 1n) dist++; xor >>= 1n; }
                if (dist <= PHASH_THRESHOLD) {
                    return {
                        isDuplicate: true,
                        matchedBy: 'perceptual_hash',
                        hammingDistance: dist,
                        existingExpense: row
                    };
                }
            }
        }

        // Layer 4: semantic signal (date + merchant + amount)
        const rows = await db.raw(
            `SELECT expenses_id, expenses_date, expenses_merchant_name, expenses_total_amount, created_date
             FROM account_expenses
             WHERE account_id = ?
               AND expenses_date = ?
               AND LOWER(expenses_merchant_name) = LOWER(?)
               AND expenses_total_amount = ?
               AND status = 'Active'
             LIMIT 1`,
            [account_id, expenses_date, expenses_merchant_name, parseFloat(expenses_total_amount)]
        );
        if (rows.length > 0) {
            return { isDuplicate: true, matchedBy: 'semantic_signal', existingExpense: rows[0] };
        }

        return { isDuplicate: false, existingExpense: null };
    } catch (error) {
        console.error('[ExpensesModel] checkDuplicateExpense error:', error);
        // On error, allow the insert to proceed rather than blocking the user
        return { isDuplicate: false, existingExpense: null };
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
 * Update expense items
 * Replaces all existing items with new items array
 */
const updateExpenseItems = async (expenses_id, items) => {
    try {
        // First, soft delete all existing items for this expense
        const deleteSql = `
            UPDATE account_expenses_item 
            SET status = 'Deleted', last_modified = NOW()
            WHERE expenses_id = ? AND status = 'Active'
        `;
        await db.raw(deleteSql, [expenses_id]);

        // If no new items provided, just return success
        if (!items || !Array.isArray(items) || items.length === 0) {
            return { 
                status: true, 
                count: 0, 
                data: [], 
                message: 'All items removed successfully' 
            };
        }

        // Create new items
        const itemsResult = await createExpenseItems(expenses_id, items);
        
        return itemsResult;
    } catch (error) {
        console.error('[ExpensesModel] updateExpenseItems error:', error);
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
            receipt_file_url  = null,
            receipt_metadata  = null,
            // Pre-computed receipt hashes (set by CreateExpense controller)
            receipt_hash      = null,
            receipt_phash     = null
        } = expenseData;

        // Step 0: Duplicate detection — reject before any DB writes
        // Passes all available signals so each layer can short-circuit early.
        const duplicateCheck = await checkDuplicateExpense(
            account_id,
            expenses_date,
            expenses_merchant_name,
            expenses_total_amount,
            { receipt_no: expenses_receipt_no, receipt_hash, receipt_phash }
        );
        if (duplicateCheck.isDuplicate) {
            console.log('[ExpensesModel] Duplicate detected via:', duplicateCheck.matchedBy);
            // return {
            //     status: false,
            //     duplicate: true,
            //     existingExpenseId: duplicateCheck.existingExpense.expenses_id,
            //     message: 'Duplicate expense detected. A similar receipt or record already exists.',
            //     matchedBy: duplicateCheck.matchedBy
            // };
        }

        // Step 0.1: Create receipt record if file is uploaded
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
                // Store hashes for future duplicate lookups
                receipt_hash: receipt_hash || null,
                receipt_phash: receipt_phash !== null ? receipt_phash.toString() : null,
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
        const mappingStatus     = mappingCheck.exists ? 'Confirmed' : 'Estimated';
        const mappingVersion    = mappingCheck.exists ? `${taxYear}-official` : `${taxYear}-preliminary`;

        // Step 4: Insert expense with categorization
        const insertData = {
            account_id: parseInt(account_id),
            expenses_date,
            expenses_year: taxYear,
            expenses_merchant_name,
            expenses_merchant_id,
            expenses_total_amount: parseFloat(expenses_total_amount),
            expenses_receipt_no,
            receipt_id,
            expenses_tags,
            expenses_tax_category: categorization.tax_id || null,
            expenses_tax_subcategory: categorization.taxsub_id || null,
            expenses_mapping_status: mappingStatus,
            expenses_mapping_confidence: categorization.confidence || 50,
            expenses_mapping_version: mappingVersion,
            expenses_original_tax_category: categorization.tax_id || null,
            expenses_mapping_date: new Date(),
            // Eligible only when a category was actually matched. The old expression
            // hardcoded 'Yes' on the non-AI path even with tax_id NULL — the row then
            // wore a green "Tax Relief" badge while belonging to no category at all,
            // and could never be counted by any claim.
            expenses_tax_eligible: useAI ? 'No' : (categorization.tax_id ? 'Yes' : 'No'),
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

        // Step 5.5: An NLP-categorised expense is eligible immediately, so its claim
        // must be maintained here — the AI worker only runs for the useAI path, and
        // relying on it alone is why NLP expenses never appeared in the green total.
        if (insertData.expenses_tax_eligible === 'Yes' && insertData.expenses_tax_category) {
            try {
                const { recomputeClaim } = require('../../../services/TaxClaimService');
                await recomputeClaim(account_id, insertData.expenses_tax_category, taxYear);
            } catch (claimErr) {
                console.error('[ExpensesModel] Claim recompute failed (expense kept):', claimErr.message);
            }
        }

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
 * account_expenses columns that may appear in ORDER BY.
 *
 * sort_by / sort_order / limit / offset are interpolated into the SQL string below
 * (MySQL will not accept them as bound parameters), so they are constrained here rather
 * than trusting the caller. Callers should validate too, but this is the last line.
 */
const SORTABLE_COLUMNS = [
    'created_date',
    'last_modified',
    'expenses_date',
    'expenses_total_amount',
    'expenses_merchant_name',
    'expenses_year',
    'expenses_mapping_confidence',
    'expenses_mapping_date',
    'expenses_mapping_status'
];

/**
 * Get all expenses for a user with filters
 */
const getAllExpenses = async (account_id, filters = {}) => {
    try {
        const {
            search = '',
            year = null,
            mapping_status = null,
            tax_category = null,
            min_confidence = null,
            tax_eligible = null,     // 'Yes' | 'No'
            ai_status = null,        // 'None' | 'Queued' | 'Processing' | 'Completed' | 'Failed'
            expenses_for = null,     // 'Self' | 'Spouse' | 'Child' | 'Parent'
            date_from = null,        // YYYY-MM-DD, inclusive
            date_to = null,
            amount_min = null,
            amount_max = null
        } = filters;

        // Interpolated values — coerce before they reach the query string.
        const sort_by    = SORTABLE_COLUMNS.includes(filters.sort_by) ? filters.sort_by : 'expenses_date';
        const sort_order = String(filters.sort_order).toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
        const limit      = Math.min(Math.max(parseInt(filters.limit, 10) || 20, 1), 100);
        const offset     = Math.max(parseInt(filters.offset, 10) || 0, 0);

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

        // Every value below is compared with a bound parameter after whitelist or
        // format checks in the controller — nothing here is interpolated.
        if (tax_eligible === 'Yes' || tax_eligible === 'No') {
            whereConditions.push('ae.expenses_tax_eligible = ?');
            params.push(tax_eligible);
        }

        if (ai_status) {
            whereConditions.push('ae.ai_processing_status = ?');
            params.push(ai_status);
        }

        if (expenses_for) {
            whereConditions.push('ae.expenses_for = ?');
            params.push(expenses_for);
        }

        if (date_from) {
            whereConditions.push('ae.expenses_date >= ?');
            params.push(date_from);
        }
        if (date_to) {
            whereConditions.push('ae.expenses_date <= ?');
            params.push(date_to);
        }

        if (amount_min !== null && Number.isFinite(amount_min)) {
            whereConditions.push('ae.expenses_total_amount >= ?');
            params.push(amount_min);
        }
        if (amount_max !== null && Number.isFinite(amount_max)) {
            whereConditions.push('ae.expenses_total_amount <= ?');
            params.push(amount_max);
        }

        const whereClause = whereConditions.join(' AND ');

        // Count and money over the whole filtered set, in one pass. The screen's
        // header shows these; computing them from the visible page would answer a
        // question nobody asked.
        const countSql = `
            SELECT COUNT(*) as total,
                   COALESCE(SUM(ae.expenses_total_amount), 0) as total_amount,
                   COALESCE(SUM(CASE WHEN ae.expenses_tax_eligible = 'Yes'
                                     THEN ae.expenses_total_amount ELSE 0 END), 0) as eligible_amount,
                   SUM(ae.expenses_tax_eligible = 'Yes') as eligible_count,
                   SUM(ae.ai_processing_status IN ('Queued','Processing')) as processing_count
            FROM account_expenses ae
            LEFT JOIN tax_category tc ON ae.expenses_tax_category = tc.tax_id
            WHERE ${whereClause}
        `;
        const countResult = await db.raw(countSql, params);
        const total = Number(countResult[0].total) || 0;
        const summary = {
            total,
            total_amount: parseFloat(countResult[0].total_amount) || 0,
            eligible_amount: parseFloat(countResult[0].eligible_amount) || 0,
            eligible_count: Number(countResult[0].eligible_count) || 0,
            processing_count: Number(countResult[0].processing_count) || 0
        };

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
                ae.ai_processing_status,
                ae.ai_rerun_count,
                r.receipt_image_url,
                tc.tax_id,
                tc.tax_code,
                tc.tax_title,
                tc.tax_max_claim,
                ts.taxsub_id,
                ts.taxsub_title,
                ts.taxsub_max_claim,
                ad.dependant_name,
                ae.created_date,
                -- The app ages Queued/Processing off this to tell a live analysis
                -- from one whose job was lost, so the list can offer a retry
                -- instead of showing a spinner that never resolves.
                ae.last_modified
            FROM account_expenses ae
            LEFT JOIN tax_category tc ON ae.expenses_tax_category = tc.tax_id
            LEFT JOIN tax_subcategory ts ON ae.expenses_tax_subcategory = ts.taxsub_id
            LEFT JOIN account_dependant ad ON ae.dependant_id = ad.dependant_id
            LEFT JOIN receipt r ON ae.receipt_id = r.receipt_id
            WHERE ${whereClause}
            ORDER BY ae.${sort_by} ${sort_order}, ae.expenses_id DESC
            LIMIT ${limit} OFFSET ${offset}
        `;

        // params.push(parseInt(limit), parseInt(offset));
        const expenses = await db.raw(sql, params);

        return {
            status: true,
            data: {
                expenses,
                summary,
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
                r.receipt_image_url,
                r.receipt_metadata,
                (SELECT COUNT(*) FROM account_expenses_mapping_history
                WHERE expenses_id = ae.expenses_id) as change_count,
                (SELECT changed_date FROM account_expenses_mapping_history
                WHERE expenses_id = ae.expenses_id
                ORDER BY changed_date DESC LIMIT 1) as last_change_date
            FROM account_expenses ae
            LEFT JOIN tax_category tc ON ae.expenses_tax_category = tc.tax_id
            LEFT JOIN tax_subcategory ts ON ae.expenses_tax_subcategory = ts.taxsub_id
            LEFT JOIN account_dependant ad ON ae.dependant_id = ad.dependant_id
            LEFT JOIN receipt r ON ae.receipt_id = r.receipt_id
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
            // An edit can move money between claims: a new amount changes the total, a
            // new date can change the year, and either leaves the old claim overstated
            // if only the new one is recomputed. Recompute every (category, year) pair
            // the edit touched — before and after.
            try {
                const before = expenseCheck.data;
                const updated = await getExpenseById(account_id, expenses_id);
                const after = updated.data;

                const pairs = new Set();
                if (before.expenses_tax_category) {
                    pairs.add(`${before.expenses_tax_category}:${before.expenses_year}`);
                }
                if (after?.expenses_tax_category) {
                    pairs.add(`${after.expenses_tax_category}:${after.expenses_year}`);
                }
                if (pairs.size) {
                    const { recomputeClaim } = require('../../../services/TaxClaimService');
                    for (const pair of pairs) {
                        const [tax_id, year] = pair.split(':').map(Number);
                        await recomputeClaim(account_id, tax_id, year);
                    }
                }

                return {
                    status: true,
                    data: after,
                    message: 'Expense updated successfully'
                };
            } catch (claimErr) {
                console.error('[ExpensesModel] Claim recompute after update failed:', claimErr.message);
                const updated = await getExpenseById(account_id, expenses_id);
                return { status: true, data: updated.data, message: 'Expense updated successfully' };
            }
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

        // A manual override moves the expense between claims — keep both sides true.
        try {
            const { recomputeClaim } = require('../../../services/TaxClaimService');
            const year = oldExpense.expenses_year;
            if (oldExpense.expenses_tax_category && oldExpense.expenses_tax_category !== tax_id) {
                await recomputeClaim(account_id, oldExpense.expenses_tax_category, year);
            }
            if (tax_id) {
                await recomputeClaim(account_id, tax_id, year);
            }
        } catch (claimErr) {
            console.error('[ExpensesModel] Claim recompute after override failed:', claimErr.message);
        }

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
        // Read first: the claim recompute below needs to know which (category, year)
        // the expense counted towards, and the receipt row travels with it.
        const existing = await getExpenseById(account_id, expenses_id);
        if (!existing.status) {
            return { status: false, message: 'Expense not found or access denied' };
        }
        const expense = existing.data;

        const result = await db.update('account_expenses', {
            status: 'Deleted',
            last_modified: new Date()
        }, {
            expenses_id,
            account_id
        });

        if (!result) {
            return { status: false, message: 'Failed to delete expense' };
        }

        // Everything below is a flag, never a DELETE — the rows and the file on disk
        // remain, so a deletion is fully accountable and reversible by support.
        await db.raw(
            `UPDATE account_expenses_item SET status = 'Deleted', last_modified = NOW()
              WHERE expenses_id = ? AND status = 'Active'`,
            [expenses_id]
        ).catch((e) => console.warn('[ExpensesModel] item archive failed:', e.message));

        if (expense.receipt_id) {
            await db.raw(
                `UPDATE receipt SET status = 'Inactive', last_modified = NOW()
                  WHERE receipt_id = ? AND account_id = ?`,
                [expense.receipt_id, account_id]
            ).catch((e) => console.warn('[ExpensesModel] receipt archive failed:', e.message));
        }

        // The deleted expense no longer counts towards its claim.
        if (expense.expenses_tax_category) {
            try {
                const { recomputeClaim } = require('../../../services/TaxClaimService');
                await recomputeClaim(account_id, expense.expenses_tax_category, expense.expenses_year);
            } catch (claimErr) {
                console.error('[ExpensesModel] Claim recompute after delete failed:', claimErr.message);
            }
        }

        return { status: true, message: 'Expense deleted successfully' };
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
            attempts: 3,
            backoff: { type: 'exponential', delay: 10000 },
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
    updateExpenseItems,
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
