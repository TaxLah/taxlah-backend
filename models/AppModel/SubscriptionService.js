/**
 * Subscription Service
 * Manages user subscriptions: packages, active subscriptions, renewals
 */

const db = require('../../utils/sqlbuilder');
const crypto = require('crypto');

/**
 * Get all available subscription packages
 * @returns {Object} - List of active packages
 */
async function getSubscriptionPackages() {
    try {
        const sql = `
            SELECT 
                sub_package_id,
                package_code,
                package_name,
                package_description,
                billing_period,
                price_amount,
                currency,
                features,
                max_receipts,
                max_reports,
                storage_limit_mb,
                package_badge,
                package_color,
                is_featured,
                sort_order,
                trial_days
            FROM subscription_package
            WHERE status = 'Active'
            ORDER BY sort_order ASC, price_amount ASC
        `;
        
        const packages = await db.raw(sql);
        
        // Parse JSON features for each package
        const parsedPackages = packages.map(pkg => ({
            ...pkg,
            features: pkg.features || []
        }));

        return {
            success: true,
            data: parsedPackages
        };
    } catch (error) {
        console.error('[SubscriptionService] getSubscriptionPackages error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Get subscription package by ID
 * @param {number} packageId - Package ID
 * @returns {Object} - Package details
 */
async function getPackageById(packageId) {
    try {
        const sql = `
            SELECT 
                sub_package_id,
                package_code,
                package_name,
                package_description,
                billing_period,
                price_amount,
                currency,
                features,
                max_receipts,
                max_reports,
                storage_limit_mb,
                package_badge,
                package_color,
                trial_days
            FROM subscription_package
            WHERE sub_package_id = ? AND status = 'Active'
        `;
        
        const result = await db.raw(sql, [packageId]);
        
        if (result.length === 0) {
            return { success: false, error: 'Package not found' };
        }

        const pkg = result[0];
        pkg.features = pkg.features || [];

        return {
            success: true,
            data: pkg
        };
    } catch (error) {
        console.error('[SubscriptionService] getPackageById error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Get user's active subscription
 * @param {number} accountId - User account ID
 * @returns {Object} - Active subscription details
 */
async function getActiveSubscription(accountId) {
    try {
        const sql = `
            SELECT 
                s.subscription_id,
                s.subscription_ref,
                s.account_id,
                s.sub_package_id,
                s.billing_period,
                s.price_amount,
                s.start_date,
                s.current_period_start,
                s.current_period_end,
                s.next_billing_date,
                s.trial_end_date,
                s.status,
                s.auto_renew,
                s.payment_method,
                s.cancel_at_period_end,
                s.cancelled_at,
                p.package_name,
                p.package_code,
                p.package_description,
                p.features,
                p.package_badge,
                p.package_color
            FROM account_subscription s
            JOIN subscription_package p ON s.sub_package_id = p.sub_package_id
            WHERE s.account_id = ?
            AND s.status IN ('Trial', 'Active', 'Past_Due')
            ORDER BY s.created_date DESC
            LIMIT 1
        `;
        
        const result = await db.raw(sql, [accountId]);
        
        if (result.length === 0) {
            return { 
                success: true, 
                data: null,
                has_subscription: false 
            };
        }

        const subscription = result[0];
        subscription.features = subscription.features || [];

        return {
            success: true,
            data: subscription,
            has_subscription: true
        };
    } catch (error) {
        console.error('[SubscriptionService] getActiveSubscription error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Get user's subscription history
 * @param {number} accountId - User account ID
 * @param {number} limit - Number of records to fetch
 * @returns {Object} - Subscription history
 */
async function getSubscriptionHistory(accountId, limit = 10) {
    try {
        const sql = `
            SELECT 
                s.subscription_id,
                s.subscription_ref,
                s.billing_period,
                s.price_amount,
                s.start_date,
                s.current_period_end,
                s.status,
                s.cancelled_at,
                s.ended_at,
                p.package_name,
                p.package_code
            FROM account_subscription s
            LEFT JOIN subscription_package p ON s.sub_package_id = p.sub_package_id
            WHERE s.account_id = ?
            ORDER BY s.created_date DESC
            LIMIT ${limit}
        `;
        
        const history = await db.raw(sql, [accountId]);

        return {
            success: true,
            data: history
        };
    } catch (error) {
        console.error('[SubscriptionService] getSubscriptionHistory error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Create new subscription
 * @param {number} accountId - User account ID
 * @param {number} packageId - Package ID
 * @param {string} paymentMethod - Payment method used
 * @param {boolean} skipPayment - Skip payment validation (for webhook activation)
 * @returns {Object} - Created subscription details
 */
async function createSubscription(accountId, packageId, paymentMethod = null, skipPayment = false) {
    try {
        // Check if user already has an active subscription
        const existing = await getActiveSubscription(accountId);
        if (existing.has_subscription) {
            return { 
                success: false, 
                error: 'User already has an active subscription' 
            };
        }

        // Get package details
        const packageResult = await getPackageById(packageId);
        if (!packageResult.success) {
            return packageResult;
        }

        const pkg = packageResult.data;
        const hasTrial = pkg.trial_days > 0;
        
        // For non-trial packages, only create subscription if skipPayment=true (called from webhook)
        if (!hasTrial && !skipPayment) {
            return {
                success: true,
                requires_payment: true,
                data: {
                    package: pkg,
                    message: 'Payment required before subscription creation'
                }
            };
        }
        
        // Calculate dates
        const now = new Date();
        const trialEndDate = hasTrial 
            ? new Date(now.getTime() + pkg.trial_days * 24 * 60 * 60 * 1000)
            : null;
        
        const periodStart = trialEndDate || now;
        const periodEnd = new Date(periodStart);
        
        if (pkg.billing_period === 'Monthly') {
            periodEnd.setMonth(periodEnd.getMonth() + 1);
        } else {
            periodEnd.setFullYear(periodEnd.getFullYear() + 1);
        }

        const nextBillingDate = new Date(periodEnd);
        const subscriptionRef = `SUB-${Date.now()}-${crypto.randomUUID().substring(0, 8).toUpperCase()}`;

        // Insert subscription
        const insertSql = `
            INSERT INTO account_subscription (
                account_id,
                sub_package_id,
                subscription_ref,
                billing_period,
                price_amount,
                start_date,
                current_period_start,
                current_period_end,
                next_billing_date,
                trial_end_date,
                status,
                auto_renew,
                payment_method
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        const status = hasTrial ? 'Trial' : 'Active';

        await db.raw(insertSql, [
            accountId,
            packageId,
            subscriptionRef,
            pkg.billing_period,
            pkg.price_amount,
            now,
            periodStart,
            periodEnd,
            nextBillingDate,
            trialEndDate,
            status,
            'Yes',
            paymentMethod
        ]);

        // Get the created subscription
        const getSubSql = `
            SELECT subscription_id, subscription_ref
            FROM account_subscription
            WHERE subscription_ref = ?
        `;
        const [newSub] = await db.raw(getSubSql, [subscriptionRef]);

        // Log history
        await logSubscriptionHistory(
            newSub.subscription_id,
            accountId,
            'Created',
            `Subscription created for ${pkg.package_name}`,
            null,
            status
        );

        // Initialize/update credit account with free_receipts_limit based on package
        try {
            const CreditService = require('./CreditService');
            const packageCode = pkg.package_code;
            let freeReceiptsLimit = 0;
            
            if (packageCode === 'PRO') {
                freeReceiptsLimit = 20;
            } else if (packageCode === 'PREMIUM') {
                freeReceiptsLimit = 50;
            }
            
            // Ensure credit account exists
            await CreditService.getOrCreateCreditAccount(accountId);
            
            // Update free_receipts_limit
            const updateCreditSql = `
                UPDATE account_credit
                SET free_receipts_limit = ?,
                    last_modified = NOW()
                WHERE account_id = ?
            `;
            await db.raw(updateCreditSql, [freeReceiptsLimit, accountId]);
            
            console.log(`[SubscriptionService] Credit account initialized for account ${accountId}: free_receipts_limit set to ${freeReceiptsLimit} (${packageCode})`);
        } catch (creditError) {
            console.error('[SubscriptionService] Failed to initialize credit account:', creditError);
        }

        return {
            success: true,
            requires_payment: false,
            data: {
                subscription_id: newSub.subscription_id,
                subscription_ref: newSub.subscription_ref,
                status: status,
                trial_end_date: trialEndDate,
                current_period_end: periodEnd,
                next_billing_date: nextBillingDate
            }
        };
    } catch (error) {
        console.error('[SubscriptionService] createSubscription error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Cancel subscription
 * @param {number} accountId - User account ID
 * @param {boolean} cancelAtPeriodEnd - Cancel immediately or at period end
 * @param {string} reason - Cancellation reason
 * @returns {Object} - Cancellation result
 */
async function cancelSubscription(accountId, cancelAtPeriodEnd = true, reason = null) {
    try {
        // Get active subscription
        const subResult = await getActiveSubscription(accountId);
        if (!subResult.has_subscription) {
            return { 
                success: false, 
                error: 'No active subscription found' 
            };
        }

        const subscription = subResult.data;
        const now = new Date();

        if (cancelAtPeriodEnd) {
            // Cancel at period end - user can continue using until then
            const updateSql = `
                UPDATE account_subscription
                SET 
                    cancel_at_period_end = 'Yes',
                    cancelled_at = ?,
                    cancel_reason = ?,
                    auto_renew = 'No',
                    last_modified = NOW()
                WHERE subscription_id = ?
            `;
            await db.raw(updateSql, [now, reason, subscription.subscription_id]);

            await logSubscriptionHistory(
                subscription.subscription_id,
                accountId,
                'Cancelled',
                `Subscription will end on ${subscription.current_period_end}`,
                subscription.status,
                subscription.status
            );

            return {
                success: true,
                message: 'Subscription will be cancelled at the end of the current period',
                data: {
                    subscription_id: subscription.subscription_id,
                    ends_at: subscription.current_period_end,
                    cancel_at_period_end: true
                }
            };
        } else {
            // Cancel immediately
            const updateSql = `
                UPDATE account_subscription
                SET 
                    status = 'Cancelled',
                    cancelled_at = ?,
                    ended_at = ?,
                    cancel_reason = ?,
                    auto_renew = 'No',
                    last_modified = NOW()
                WHERE subscription_id = ?
            `;
            await db.raw(updateSql, [now, now, reason, subscription.subscription_id]);

            await logSubscriptionHistory(
                subscription.subscription_id,
                accountId,
                'Cancelled',
                'Subscription cancelled immediately',
                subscription.status,
                'Cancelled'
            );

            return {
                success: true,
                message: 'Subscription cancelled immediately',
                data: {
                    subscription_id: subscription.subscription_id,
                    cancelled_at: now,
                    cancel_at_period_end: false
                }
            };
        }
    } catch (error) {
        console.error('[SubscriptionService] cancelSubscription error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Resume cancelled subscription (before period end)
 * @param {number} accountId - User account ID
 * @returns {Object} - Resume result
 */
async function resumeSubscription(accountId) {
    try {
        // Get subscription
        const subResult = await getActiveSubscription(accountId);
        if (!subResult.has_subscription) {
            return { 
                success: false, 
                error: 'No subscription found' 
            };
        }

        const subscription = subResult.data;

        // Check if it's set to cancel at period end
        if (subscription.cancel_at_period_end !== 'Yes') {
            return { 
                success: false, 
                error: 'Subscription is not set to cancel' 
            };
        }

        // Resume subscription
        const updateSql = `
            UPDATE account_subscription
            SET 
                cancel_at_period_end = 'No',
                cancelled_at = NULL,
                cancel_reason = NULL,
                auto_renew = 'Yes',
                last_modified = NOW()
            WHERE subscription_id = ?
        `;
        await db.raw(updateSql, [subscription.subscription_id]);

        await logSubscriptionHistory(
            subscription.subscription_id,
            accountId,
            'Resumed',
            'Subscription resumed - cancellation reverted',
            subscription.status,
            subscription.status
        );

        return {
            success: true,
            message: 'Subscription resumed successfully',
            data: {
                subscription_id: subscription.subscription_id,
                auto_renew: true
            }
        };
    } catch (error) {
        console.error('[SubscriptionService] resumeSubscription error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Check if user has active subscription with specific features
 * @param {number} accountId - User account ID
 * @returns {Object} - Subscription status and features
 */
async function checkSubscriptionAccess(accountId) {
    try {
        const subResult = await getActiveSubscription(accountId);

        if (!subResult.has_subscription) {
            return {
                success: true,
                has_access: false,
                subscription_status: null,
                features: {
                    unlimited_receipts: false,
                    unlimited_reports: false,
                    ai_categorization: false,
                    cloud_storage: false,
                    priority_support: false
                }
            };
        }

        const subscription = subResult.data;
        const isActive = ['Trial', 'Active'].includes(subscription.status);

        return {
            success: true,
            has_access: isActive,
            subscription_status: subscription.status,
            package_name: subscription.package_name,
            current_period_end: subscription.current_period_end,
            features: {
                unlimited_receipts: isActive,
                unlimited_reports: isActive,
                ai_categorization: isActive,
                cloud_storage: isActive,
                priority_support: subscription.package_code === 'PREMIUM' && isActive
            }
        };
    } catch (error) {
        console.error('[SubscriptionService] checkSubscriptionAccess error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Log subscription history event
 * @param {number} subscriptionId - Subscription ID
 * @param {number} accountId - Account ID
 * @param {string} eventType - Event type
 * @param {string} description - Event description
 * @param {string} oldStatus - Old status
 * @param {string} newStatus - New status
 */
async function logSubscriptionHistory(subscriptionId, accountId, eventType, description, oldStatus = null, newStatus = null) {
    try {
        const sql = `
            INSERT INTO subscription_history (
                subscription_id,
                account_id,
                event_type,
                event_description,
                old_status,
                new_status
            ) VALUES (?, ?, ?, ?, ?, ?)
        `;
        await db.raw(sql, [subscriptionId, accountId, eventType, description, oldStatus, newStatus]);
    } catch (error) {
        console.error('[SubscriptionService] logSubscriptionHistory error:', error);
    }
}

/**
 * Get subscription event history
 * @param {number} accountId - User account ID
 * @param {number} limit - Number of records
 * @returns {Object} - Event history
 */
async function getSubscriptionEvents(accountId, limit = 20) {
    try {
        const sql = `
            SELECT 
                history_id,
                subscription_id,
                event_type,
                event_description,
                old_status,
                new_status,
                event_date
            FROM subscription_history
            WHERE account_id = ?
            ORDER BY event_date DESC
            LIMIT ${limit}
        `;
        
        const events = await db.raw(sql, [accountId]);

        return {
            success: true,
            data: events
        };
    } catch (error) {
        console.error('[SubscriptionService] getSubscriptionEvents error:', error);
        return { success: false, error: error.message };
    }
}

module.exports = {
    getSubscriptionPackages,
    getPackageById,
    getActiveSubscription,
    getSubscriptionHistory,
    createSubscription,
    cancelSubscription,
    resumeSubscription,
    checkSubscriptionAccess,
    logSubscriptionHistory,
    getSubscriptionEvents
};
