/**
 * Receipt Usage Service
 * Tracks and limits receipt uploads/extractions based on subscription and free tier limits
 */

const db = require('../../utils/sqlbuilder');

/**
 * Get user's receipt usage and limits
 * @param {number} accountId - User account ID
 * @returns {Object} - Usage statistics and limits
 */
async function getReceiptUsage(accountId) {
    try {
        // Get subscription info
        const { checkSubscriptionAccess } = require('./SubscriptionService');
        const subscriptionResult = await checkSubscriptionAccess(accountId);

        // Get credit info including free receipts
        const creditSql = `
            SELECT 
                credit_balance,
                free_receipts_used,
                free_receipts_limit,
                (free_receipts_limit - free_receipts_used) as free_receipts_remaining
            FROM account_credit
            WHERE account_id = ?
        `;
        const creditData = await db.raw(creditSql, [accountId]);
        const credit = creditData.length > 0 ? creditData[0] : null;

        // Get current month's upload count
        const currentMonthSql = `
            SELECT COUNT(*) as uploads_this_month
            FROM receipt
            WHERE account_id = ? 
            AND YEAR(created_date) = YEAR(CURDATE())
            AND MONTH(created_date) = MONTH(CURDATE())
            AND status != 'Deleted'
        `;
        const monthData = await db.raw(currentMonthSql, [accountId]);
        const uploadsThisMonth = monthData[0]?.uploads_this_month || 0;

        // Get today's upload count
        const todaySql = `
            SELECT COUNT(*) as uploads_today
            FROM receipt
            WHERE account_id = ? 
            AND DATE(created_date) = CURDATE()
            AND status != 'Deleted'
        `;
        const todayData = await db.raw(todaySql, [accountId]);
        const uploadsToday = todayData[0]?.uploads_today || 0;

        // Determine limits based on subscription
        let limits = {
            daily_limit: 50,  // Default for free users
            monthly_limit: 200,  // Default for free users
            has_unlimited: false,
            subscription_type: 'free'
        };

        if (subscriptionResult.has_access) {
            // User has active subscription - unlimited uploads
            limits = {
                daily_limit: null,  // null = unlimited
                monthly_limit: null,  // null = unlimited
                has_unlimited: true,
                subscription_type: 'premium'
            };
        }

        return {
            success: true,
            data: {
                // Current usage
                uploads_today: uploadsToday,
                uploads_this_month: uploadsThisMonth,
                
                // Free tier credits
                free_receipts_used: credit?.free_receipts_used || 0,
                free_receipts_limit: credit?.free_receipts_limit || 50,
                free_receipts_remaining: credit?.free_receipts_remaining || 0,
                
                // Paid credits
                credit_balance: credit?.credit_balance || 0,
                
                // Limits
                daily_limit: limits.daily_limit,
                monthly_limit: limits.monthly_limit,
                has_unlimited: limits.has_unlimited,
                subscription_type: limits.subscription_type,
                
                // Subscription status
                has_active_subscription: subscriptionResult.has_access,
                subscription_status: subscriptionResult.subscription_status
            }
        };
    } catch (error) {
        console.error('[ReceiptUsageService] getReceiptUsage error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Check if user can upload/extract receipt
 * @param {number} accountId - User account ID
 * @returns {Object} - Can upload status and reason
 */
async function canUploadReceipt(accountId) {
    try {
        const usageResult = await getReceiptUsage(accountId);
        console.log("Log Usage Result : ", usageResult)
        
        if (!usageResult.success) {
            return usageResult;
        }

        const usage = usageResult.data;

        // If user has unlimited (active subscription), always allow
        if (usage.has_unlimited) {
            return {
                success: true,
                can_upload: true,
                reason: 'unlimited',
                message: 'Unlimited uploads with active subscription'
            };
        }

        // Check daily limit for free users
        if (usage.daily_limit && usage.uploads_today >= usage.daily_limit) {
            return {
                success: true,
                can_upload: false,
                reason: 'daily_limit_reached',
                message: `Daily upload limit reached (${usage.daily_limit} per day). Upgrade to premium for unlimited uploads.`,
                usage: usage
            };
        }

        // Check monthly limit for free users
        if (usage.monthly_limit && usage.uploads_this_month >= usage.monthly_limit) {
            return {
                success: true,
                can_upload: false,
                reason: 'monthly_limit_reached',
                message: `Monthly upload limit reached (${usage.monthly_limit} per month). Upgrade to premium for unlimited uploads.`,
                usage: usage
            };
        }

        // Check if user has free receipts or credits
        const hasFreeReceipts = usage.free_receipts_remaining > 0;
        const hasCredits = usage.credit_balance > 0;

        if (!hasFreeReceipts && !hasCredits) {
            return {
                success: true,
                can_upload: false,
                reason: 'no_credits',
                message: 'No free receipts or credits remaining. Please purchase credits or upgrade to premium.',
                usage: usage
            };
        }

        // User can upload
        return {
            success: true,
            can_upload: true,
            reason: hasFreeReceipts ? 'free_receipt' : 'credit',
            message: 'Upload allowed',
            usage: usage
        };
    } catch (error) {
        console.error('[ReceiptUsageService] canUploadReceipt error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Record receipt upload/extraction
 * @param {number} accountId - User account ID
 * @param {boolean} usedFreeReceipt - Whether a free receipt was used
 * @returns {Object} - Recording result
 */
async function recordReceiptUpload(accountId, usedFreeReceipt = false) {
    try {
        if (usedFreeReceipt) {
            // Increment free_receipts_used counter
            const updateSql = `
                UPDATE account_credit
                SET free_receipts_used = free_receipts_used + 1,
                    last_modified = NOW()
                WHERE account_id = ?
            `;
            await db.raw(updateSql, [accountId]);
        }

        return {
            success: true,
            message: 'Receipt upload recorded'
        };
    } catch (error) {
        console.error('[ReceiptUsageService] recordReceiptUpload error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Get usage statistics for display
 * @param {number} accountId - User account ID
 * @returns {Object} - Formatted usage stats
 */
async function getUsageStatistics(accountId) {
    try {
        const usageResult = await getReceiptUsage(accountId);
        
        if (!usageResult.success) {
            return usageResult;
        }

        const usage = usageResult.data;

        // Calculate percentages
        const dailyPercentage = usage.daily_limit 
            ? Math.round((usage.uploads_today / usage.daily_limit) * 100) 
            : 0;
        
        const monthlyPercentage = usage.monthly_limit 
            ? Math.round((usage.uploads_this_month / usage.monthly_limit) * 100) 
            : 0;

        const freeReceiptsPercentage = usage.free_receipts_limit > 0
            ? Math.round((usage.free_receipts_used / usage.free_receipts_limit) * 100)
            : 0;

        return {
            success: true,
            data: {
                summary: {
                    subscription_type: usage.subscription_type,
                    has_unlimited: usage.has_unlimited,
                    has_active_subscription: usage.has_active_subscription
                },
                daily: {
                    used: usage.uploads_today,
                    limit: usage.daily_limit,
                    remaining: usage.daily_limit ? usage.daily_limit - usage.uploads_today : null,
                    percentage: dailyPercentage,
                    unlimited: usage.has_unlimited
                },
                monthly: {
                    used: usage.uploads_this_month,
                    limit: usage.monthly_limit,
                    remaining: usage.monthly_limit ? usage.monthly_limit - usage.uploads_this_month : null,
                    percentage: monthlyPercentage,
                    unlimited: usage.has_unlimited
                },
                free_receipts: {
                    used: usage.free_receipts_used,
                    limit: usage.free_receipts_limit,
                    remaining: usage.free_receipts_remaining,
                    percentage: freeReceiptsPercentage
                },
                credits: {
                    balance: usage.credit_balance
                }
            }
        };
    } catch (error) {
        console.error('[ReceiptUsageService] getUsageStatistics error:', error);
        return { success: false, error: error.message };
    }
}

module.exports = {
    getReceiptUsage,
    canUploadReceipt,
    recordReceiptUpload,
    getUsageStatistics
};
