/**
 * Credit Service
 * Manages user credits: balance, usage, purchase, expiry
 */

const db = require('../../utils/sqlbuilder');

/**
 * Get or create user's credit account
 * @param {number} accountId - User account ID
 * @returns {Object} - Credit account details
 */
async function getOrCreateCreditAccount(accountId) {
    try {
        // Check if account exists
        let sql = `SELECT * FROM account_credit WHERE account_id = ?`;
        let result = await db.raw(sql, [accountId]);

        if (result.length === 0) {
            // Create new credit account
            const insertSql = `
                INSERT INTO account_credit (account_id, credit_balance, free_tier_reset_date)
                VALUES (?, 0, DATE_ADD(CURDATE(), INTERVAL 1 YEAR))
            `;
            await db.raw(insertSql, [accountId]);

            // Fetch the newly created account
            result = await db.raw(sql, [accountId]);
        }

        return {
            success: true,
            data: result[0]
        };
    } catch (error) {
        console.error('[CreditService] getOrCreateCreditAccount error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Get user's credit balance and summary
 * @param {number} accountId - User account ID
 * @returns {Object} - Credit summary
 */
async function getCreditBalance(accountId) {
    try {
        const account = await getOrCreateCreditAccount(accountId);
        if (!account.success) return account;

        // Get expiring soon credits (within 30 days)
        const expiringSql = `
            SELECT COALESCE(SUM(credits_remaining), 0) as expiring_credits
            FROM credit_batch
            WHERE account_id = ?
            AND status = 'Active'
            AND credits_remaining > 0
            AND expiry_date BETWEEN NOW() AND DATE_ADD(NOW(), INTERVAL 30 DAY)
        `;
        const expiringResult = await db.raw(expiringSql, [accountId]);

        // Get nearest expiry date
        const nearestExpirySql = `
            SELECT MIN(expiry_date) as nearest_expiry
            FROM credit_batch
            WHERE account_id = ?
            AND status = 'Active'
            AND credits_remaining > 0
            AND expiry_date > NOW()
        `;
        const nearestExpiryResult = await db.raw(nearestExpirySql, [accountId]);

        const data = account.data;
        return {
            success: true,
            data: {
                credit_balance: data.credit_balance,
                lifetime_credits: data.lifetime_credits,
                lifetime_spent: data.lifetime_spent,
                free_receipts_used: data.free_receipts_used,
                free_receipts_limit: data.free_receipts_limit,
                free_receipts_remaining: data.free_receipts_limit - data.free_receipts_used,
                expiring_soon: parseInt(expiringResult[0]?.expiring_credits) || 0,
                nearest_expiry: nearestExpiryResult[0]?.nearest_expiry || null,
                status: data.status
            }
        };
    } catch (error) {
        console.error('[CreditService] getCreditBalance error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Check if user has enough credits for an action
 * @param {number} accountId - User account ID
 * @param {number} requiredCredits - Credits needed
 * @returns {Object} - Check result
 */
async function hasEnoughCredits(accountId, requiredCredits) {
    try {
        const balance = await getCreditBalance(accountId);
        if (!balance.success) return balance;

        const hasEnough = balance.data.credit_balance >= requiredCredits;
        return {
            success: true,
            hasEnough,
            currentBalance: balance.data.credit_balance,
            requiredCredits,
            shortfall: hasEnough ? 0 : requiredCredits - balance.data.credit_balance
        };
    } catch (error) {
        console.error('[CreditService] hasEnoughCredits error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Use credits for a feature (FIFO - oldest expiring first)
 * @param {number} accountId - User account ID
 * @param {number} amount - Credits to use
 * @param {string} description - Usage description
 * @param {string} referenceType - Type of reference (e.g., 'Report', 'Receipt')
 * @param {number} referenceId - ID of the reference
 * @returns {Object} - Usage result
 */
async function useCredits(accountId, amount, description, referenceType = null, referenceId = null) {
    try {
        // Call stored procedure
        const callSql = `CALL sp_use_credits(?, ?, ?, ?, ?, @success, @message)`;
        await db.raw(callSql, [accountId, amount, description, referenceType, referenceId]);

        // Get output parameters
        const outputSql = `SELECT @success as success, @message as message`;
        const outputResult = await db.raw(outputSql);

        const success = outputResult[0]?.success === 1;
        const message = outputResult[0]?.message;

        if (success) {
            // Get updated balance
            const balance = await getCreditBalance(accountId);
            return {
                success: true,
                message,
                data: {
                    credits_used: amount,
                    new_balance: balance.data?.credit_balance
                }
            };
        } else {
            return {
                success: false,
                error: message
            };
        }
    } catch (error) {
        console.error('[CreditService] useCredits error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Add credits to user account (from purchase)
 * @param {Object} params - Credit addition parameters
 * @returns {Object} - Addition result
 */
async function addCredits(params) {
    const {
        accountId,
        packageId,
        credits,
        bonusCredits = 0,
        validityDays = 548,
        sourceType = 'Purchase',
        sourceReference = null,
        paymentAmount = null,
        paymentMethod = null,
        paymentReference = null
    } = params;

    try {
        // Call stored procedure
        const callSql = `CALL sp_add_credits(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, @batch_id, @transaction_id)`;
        await db.raw(callSql, [
            accountId, packageId, credits, bonusCredits, validityDays,
            sourceType, sourceReference, paymentAmount, paymentMethod, paymentReference
        ]);

        // Get output parameters
        const outputSql = `SELECT @batch_id as batch_id, @transaction_id as transaction_id`;
        const outputResult = await db.raw(outputSql);

        const batchId = outputResult[0]?.batch_id;
        const transactionId = outputResult[0]?.transaction_id;

        // Get updated balance
        const balance = await getCreditBalance(accountId);

        return {
            success: true,
            data: {
                batch_id: batchId,
                transaction_id: transactionId,
                credits_added: credits + bonusCredits,
                new_balance: balance.data?.credit_balance
            }
        };
    } catch (error) {
        console.error('[CreditService] addCredits error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Get credit transaction history
 * @param {number} accountId - User account ID
 * @param {Object} options - Query options
 * @returns {Object} - Transaction history
 */
async function getTransactionHistory(accountId, options = {}) {
    const { limit = 20, offset = 0, type = null } = options;

    try {
        let sql = `
            SELECT 
                ct.transaction_id,
                ct.transaction_type,
                ct.credit_amount,
                ct.balance_before,
                ct.balance_after,
                ct.description,
                ct.reference_type,
                ct.reference_id,
                ct.payment_amount,
                ct.payment_method,
                ct.status,
                ct.created_date,
                cp.package_name
            FROM credit_transaction ct
            LEFT JOIN credit_batch cb ON ct.batch_id = cb.batch_id
            LEFT JOIN credit_package cp ON cb.package_id = cp.package_id
            WHERE ct.account_id = ?
        `;
        const params = [accountId];

        if (type) {
            sql += ` AND ct.transaction_type = ?`;
            params.push(type);
        }

        sql += ` ORDER BY ct.created_date DESC LIMIT ${limit} OFFSET ${offset}`;
        // params.push(limit, offset);

        const transactions = await db.raw(sql, params);

        // Get total count
        let countSql = `SELECT COUNT(*) as total FROM credit_transaction WHERE account_id = ?`;
        const countParams = [accountId];
        if (type) {
            countSql += ` AND transaction_type = ?`;
            countParams.push(type);
        }
        const countResult = await db.raw(countSql, countParams);

        return {
            success: true,
            data: {
                transactions,
                pagination: {
                    total: countResult[0]?.total || 0,
                    limit,
                    offset
                }
            }
        };
    } catch (error) {
        console.error('[CreditService] getTransactionHistory error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Get credit batches (for showing expiry info)
 * @param {number} accountId - User account ID
 * @returns {Object} - Credit batches
 */
async function getCreditBatches(accountId) {
    try {
        const sql = `
            SELECT 
                cb.batch_id,
                cb.credits_purchased,
                cb.credits_remaining,
                cb.bonus_credits,
                cb.source_type,
                cb.purchase_date,
                cb.expiry_date,
                cb.status,
                cp.package_name,
                cp.package_code,
                DATEDIFF(cb.expiry_date, NOW()) as days_until_expiry
            FROM credit_batch cb
            LEFT JOIN credit_package cp ON cb.package_id = cp.package_id
            WHERE cb.account_id = ?
            AND cb.status = 'Active'
            AND cb.credits_remaining > 0
            ORDER BY cb.expiry_date ASC
        `;
        const batches = await db.raw(sql, [accountId]);

        return {
            success: true,
            data: batches
        };
    } catch (error) {
        console.error('[CreditService] getCreditBatches error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Get all credit packages
 * @param {boolean} activeOnly - Only return active packages
 * @returns {Object} - Available packages
 */
async function getCreditPackages(activeOnly = true) {
    try {
        let sql = `
            SELECT 
                package_id,
                package_code,
                package_name,
                package_description,
                credit_amount,
                price_amount,
                price_per_credit,
                validity_days,
                bonus_credits,
                bonus_description,
                package_badge,
                package_color,
                is_featured,
                sort_order
            FROM credit_package
        `;

        if (activeOnly) {
            sql += ` WHERE status = 'Active'`;
        }

        sql += ` ORDER BY sort_order ASC`;

        const packages = await db.raw(sql);

        return {
            success: true,
            data: packages
        };
    } catch (error) {
        console.error('[CreditService] getCreditPackages error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Get package by ID
 * @param {number} packageId - Package ID
 * @returns {Object} - Package details
 */
async function getPackageById(packageId) {
    try {
        const sql = `SELECT * FROM credit_package WHERE package_id = ? AND status = 'Active'`;
        const result = await db.raw(sql, [packageId]);

        if (result.length === 0) {
            return { success: false, error: 'Package not found' };
        }

        return { success: true, data: result[0] };
    } catch (error) {
        console.error('[CreditService] getPackageById error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Get credit usage rate by code
 * @param {string} rateCode - Rate code (e.g., 'REPORT_BASIC')
 * @returns {Object} - Usage rate
 */
async function getUsageRate(rateCode) {
    try {
        const sql = `
            SELECT rate_id, rate_code, rate_name, credit_cost, feature_category
            FROM credit_usage_rate
            WHERE rate_code = ? AND is_active = 'Yes'
        `;
        const result = await db.raw(sql, [rateCode]);

        if (result.length === 0) {
            return { success: false, error: 'Rate not found' };
        }

        return { success: true, data: result[0] };
    } catch (error) {
        console.error('[CreditService] getUsageRate error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Get all usage rates
 * @returns {Object} - All usage rates
 */
async function getAllUsageRates() {
    try {
        const sql = `
            SELECT rate_id, rate_code, rate_name, rate_description, credit_cost, feature_category
            FROM credit_usage_rate
            WHERE is_active = 'Yes'
            ORDER BY feature_category, credit_cost
        `;
        const rates = await db.raw(sql);

        return { success: true, data: rates };
    } catch (error) {
        console.error('[CreditService] getAllUsageRates error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Use free receipt allocation
 * @param {number} accountId - User account ID
 * @returns {Object} - Result
 */
async function useFreeReceipt(accountId) {
    try {
        const account = await getOrCreateCreditAccount(accountId);
        if (!account.success) return account;

        const data = account.data;

        // Check if free receipts available
        if (data.free_receipts_used >= data.free_receipts_limit) {
            return {
                success: false,
                error: 'Free receipt limit reached',
                data: {
                    used: data.free_receipts_used,
                    limit: data.free_receipts_limit
                }
            };
        }

        // Increment usage
        const updateSql = `
            UPDATE account_credit 
            SET free_receipts_used = free_receipts_used + 1
            WHERE account_id = ?
        `;
        await db.raw(updateSql, [accountId]);

        return {
            success: true,
            data: {
                free_receipts_used: data.free_receipts_used + 1,
                free_receipts_remaining: data.free_receipts_limit - data.free_receipts_used - 1
            }
        };
    } catch (error) {
        console.error('[CreditService] useFreeReceipt error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Check and use credits or free tier for a feature
 * @param {number} accountId - User account ID
 * @param {string} rateCode - Feature rate code
 * @param {string} referenceType - Reference type
 * @param {number} referenceId - Reference ID
 * @returns {Object} - Result
 */
async function checkAndUseCredits(accountId, rateCode, referenceType = null, referenceId = null) {
    try {
        // Get rate
        const rate = await getUsageRate(rateCode);
        if (!rate.success) return rate;

        const creditCost = rate.data.credit_cost;

        // Check balance
        const balanceCheck = await hasEnoughCredits(accountId, creditCost);
        if (!balanceCheck.success) return balanceCheck;

        if (!balanceCheck.hasEnough) {
            return {
                success: false,
                error: 'Insufficient credits',
                data: {
                    required: creditCost,
                    available: balanceCheck.currentBalance,
                    shortfall: balanceCheck.shortfall
                }
            };
        }

        // Use credits
        const useResult = await useCredits(
            accountId,
            creditCost,
            `${rate.data.rate_name}`,
            referenceType,
            referenceId
        );

        return useResult;
    } catch (error) {
        console.error('[CreditService] checkAndUseCredits error:', error);
        return { success: false, error: error.message };
    }
}

module.exports = {
    getOrCreateCreditAccount,
    getCreditBalance,
    hasEnoughCredits,
    useCredits,
    addCredits,
    getTransactionHistory,
    getCreditBatches,
    getCreditPackages,
    getPackageById,
    getUsageRate,
    getAllUsageRates,
    useFreeReceipt,
    checkAndUseCredits
};
