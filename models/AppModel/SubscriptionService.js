/**
 * Subscription Service
 * Manages user subscriptions: packages, active subscriptions, renewals
 */

const db = require('../../utils/sqlbuilder');
const crypto = require('crypto');
const NotificationService = require('../../services/NotificationService');

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
            WHERE sub_package_id = ? LIMIT 1
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
                p.package_color,
                d.device_fcm_token
            FROM account_subscription s
            LEFT JOIN subscription_package p ON s.sub_package_id = p.sub_package_id
            LEFT JOIN account_device d ON s.account_id = d.account_id
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

        const pkg       = packageResult.data;
        const hasTrial  = pkg.trial_days > 0;
        
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
                SET free_receipts_limit = ?
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

/**
 * Process expired subscriptions (called by cron job)
 * Updates subscriptions that have passed their current_period_end or trial_end_date
 * @returns {Object} - Processing result with count of expired subscriptions
 */
async function processExpiredSubscriptions() {
    try {
        console.log('[SubscriptionService] Starting expired subscriptions check...');
        
        // Get all subscriptions that should be expired
        const expiredSql = `
            SELECT 
                s.subscription_id,
                s.subscription_ref,
                s.account_id,
                s.status,
                s.current_period_end,
                s.trial_end_date,
                s.cancel_at_period_end,
                a.account_name,
                a.account_email,
                pkg.package_name,
                pkg.package_code
            FROM account_subscription s
            JOIN account a ON s.account_id = a.account_id
            JOIN subscription_package pkg ON s.sub_package_id = pkg.sub_package_id
            WHERE (
                (s.status = 'Active' AND s.current_period_end < NOW())
                OR
                (s.status = 'Trial' AND s.trial_end_date < NOW())
            )
            AND s.status NOT IN ('Expired', 'Cancelled', 'Suspended')
        `;
        
        const expiredSubscriptions = await db.raw(expiredSql);
        
        if (expiredSubscriptions.length === 0) {
            console.log('[SubscriptionService] No expired subscriptions found');
            return {
                success: true,
                message: 'No expired subscriptions found',
                count: 0
            };
        }

        console.log(`[SubscriptionService] Found ${expiredSubscriptions.length} expired subscription(s)`);

        const { UserNotificationCreate } = require('./Notification');

        let processedCount = 0;
        let failedCount = 0;

        // Process each expired subscription
        for (const subscription of expiredSubscriptions) {
            try {
                const now = new Date();
                
                // Update subscription status to Expired
                const updateSql = `
                    UPDATE account_subscription
                    SET 
                        status = 'Expired',
                        ended_at = ?,
                        last_modified = NOW()
                    WHERE subscription_id = ?
                `;
                await db.raw(updateSql, [now, subscription.subscription_id]);

                // Log subscription history
                await logSubscriptionHistory(
                    subscription.subscription_id,
                    subscription.account_id,
                    'Expired',
                    `Subscription expired - ${subscription.status === 'Trial' ? 'trial period ended' : 'billing period ended without renewal'}`,
                    subscription.status,
                    'Expired'
                );

                const notificationTitle = subscription.status === 'Trial' 
                    ? '⏰ Trial Period Ended'
                    : '⏰ Subscription Expired';
                    
                const notificationBody = subscription.status === 'Trial'
                    ? `Your ${subscription.package_name} trial period has ended. Subscribe now to continue enjoying premium features!`
                    : `Your ${subscription.package_name} subscription has expired. Renew now to continue accessing premium features.`;

                // Push + in-app notification via centralized service
                await NotificationService.sendUserNotification(
                    subscription.account_id,
                    notificationTitle,
                    notificationBody,
                    {
                        type:            'SubscriptionExpired',
                        subscription_id: String(subscription.subscription_id)
                    }
                );

                // Queue email notification
                try {
                    const queues = require('../../queue');
                    await queues.email.add('send', {
                        to: subscription.account_email,
                        subject: notificationTitle,
                        html: `
                            <h2>${notificationTitle}</h2>
                            <p>Hi ${subscription.account_name},</p>
                            <p>${notificationBody}</p>
                            <p>To reactivate your subscription, please log in to your account and choose a plan that fits your needs.</p>
                            <p>Thank you for using TaxLah!</p>
                        `
                    }, { priority: 5 });
                } catch (emailError) {
                    console.error(`[SubscriptionService] Failed to queue email for ${subscription.account_email}:`, emailError);
                }

                processedCount++;
                console.log(`[SubscriptionService] Processed expired subscription ${subscription.subscription_ref} for account ${subscription.account_id}`);
                
            } catch (error) {
                failedCount++;
                console.error(`[SubscriptionService] Failed to process subscription ${subscription.subscription_ref}:`, error);
            }
        }

        const result = {
            success: true,
            message: `Processed ${processedCount} expired subscription(s)`,
            count: processedCount,
            failed: failedCount,
            total: expiredSubscriptions.length
        };

        console.log('[SubscriptionService] Expired subscriptions processing completed:', result);
        return result;

    } catch (error) {
        console.error('[SubscriptionService] processExpiredSubscriptions error:', error);
        return { 
            success: false, 
            error: error.message,
            count: 0
        };
    }
}

/**
 * Send expiry reminders for subscriptions expiring in 3 days (called by cron job)
 * Notifies users whose subscriptions will expire soon
 * @returns {Object} - Processing result with count of reminders sent
 */
async function sendExpiryReminders() {
    try {
        console.log('[SubscriptionService] Starting expiry reminders check...');
        
        // Get subscriptions expiring in 3 days
        const reminderSql = `
            SELECT 
                s.subscription_id,
                s.subscription_ref,
                s.account_id,
                s.status,
                s.current_period_end,
                s.trial_end_date,
                s.billing_period,
                s.price_amount,
                a.account_name,
                a.account_email,
                pkg.package_name,
                pkg.package_code,
                pkg.features
            FROM account_subscription s
            JOIN account a ON s.account_id = a.account_id
            JOIN subscription_package pkg ON s.sub_package_id = pkg.sub_package_id
            -- WHERE s.auto_renew = 'No'
            WHERE s.status IN ('Active', 'Trial')
            AND (
                (s.status = 'Active' AND DATE(s.current_period_end) = DATE(DATE_ADD(NOW(), INTERVAL 3 DAY)))
                OR
                (s.status = 'Trial' AND DATE(s.trial_end_date) = DATE(DATE_ADD(NOW(), INTERVAL 3 DAY)))
            )
        `;
        
        const expiringSubscriptions = await db.raw(reminderSql);
        
        if (expiringSubscriptions.length === 0) {
            console.log('[SubscriptionService] No subscriptions expiring in 3 days');
            return {
                success: true,
                message: 'No subscriptions expiring in 3 days',
                count: 0
            };
        }

        console.log(`[SubscriptionService] Found ${expiringSubscriptions.length} subscription(s) expiring in 3 days`);

        const { UserNotificationCreate } = require('./Notification');

        let processedCount = 0;
        let failedCount = 0;

        // Process each expiring subscription
        for (const subscription of expiringSubscriptions) {
            try {
                const expiryDate = subscription.status === 'Trial' 
                    ? new Date(subscription.trial_end_date)
                    : new Date(subscription.current_period_end);
                
                const formattedDate = expiryDate.toLocaleDateString('en-MY', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                });

                const notificationTitle = subscription.status === 'Trial' 
                    ? '⚠️ Trial Ending Soon'
                    : '⚠️ Subscription Expiring Soon';
                    
                const notificationBody = subscription.status === 'Trial'
                    ? `Your ${subscription.package_name} trial will end on ${formattedDate}. Subscribe now to keep your premium features!`
                    : `Your ${subscription.package_name} subscription will expire on ${formattedDate}. Renew now to avoid service interruption.`;

                // Push + in-app notification via centralized service
                await NotificationService.sendUserNotification(
                    subscription.account_id,
                    notificationTitle,
                    notificationBody,
                    {
                        type:            'SubscriptionExpiryReminder',
                        subscription_id: String(subscription.subscription_id),
                        expiry_date:     expiryDate.toISOString()
                    }
                );

                // Queue email reminder
                try {
                    const queues = require('../../queue');
                    const emailSubject = subscription.status === 'Trial'
                        ? `Reminder - Your TaxLah Trial Ends in 3 Days`
                        : `Reminder - Your TaxLah Subscription Expires in 3 Days`;
                    
                    const emailBody = `
                        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                            <h2 style="color: #1a5f7a;">${notificationTitle}</h2>
                            <p>Hi ${subscription.account_name},</p>
                            <p>${notificationBody}</p>
                            
                            <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
                                <strong>Subscription Details:</strong><br>
                                Plan: ${subscription.package_name}<br>
                                ${subscription.status === 'Trial' ? 'Trial Ends' : 'Expires'}: ${formattedDate}<br>
                                ${subscription.status !== 'Trial' ? `Price: RM ${subscription.price_amount}/${subscription.billing_period}` : ''}
                            </div>
                            
                            <p>Don't miss out on these premium features:</p>
                            <ul>
                                ${subscription.features.map(feature => `<li>${feature}</li>`).join('')}
                            </ul>
                            
                            <div style="text-align: center; margin: 30px 0;">
                                <a href="${process.env.APP_URL || 'https://taxlah.com'}/subscription" 
                                    style="background-color: #1a5f7a; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">
                                    Renew Now
                                </a>
                            </div>
                            
                            <p style="color: #666; font-size: 14px;">
                                If you have any questions, feel free to contact our support team.
                            </p>
                            
                            <p>Best regards,<br>The TaxLah Team</p>
                        </div>
                    `;

                    await queues.email.add('send', {
                        to: subscription.account_email,
                        subject: emailSubject,
                        html: emailBody
                    }, { priority: 2 });
                } catch (emailError) {
                    console.error(`[SubscriptionService] Failed to queue email for ${subscription.account_email}:`, emailError);
                }

                // Log subscription history
                await logSubscriptionHistory(
                    subscription.subscription_id,
                    subscription.account_id,
                    'Reminder',
                    `Expiry reminder sent - subscription ${subscription.status === 'Trial' ? 'trial' : 'period'} ends on ${formattedDate}`,
                    null,
                    null
                );

                processedCount++;
                console.log(`[SubscriptionService] Sent expiry reminder for subscription ${subscription.subscription_ref} (account ${subscription.account_id})`);
                
            } catch (error) {
                failedCount++;
                console.error(`[SubscriptionService] Failed to send reminder for subscription ${subscription.subscription_ref}:`, error);
            }
        }

        const result = {
            success: true,
            message: `Sent ${processedCount} expiry reminder(s)`,
            count: processedCount,
            failed: failedCount,
            total: expiringSubscriptions.length
        };

        console.log('[SubscriptionService] Expiry reminders processing completed:', result);
        return result;

    } catch (error) {
        console.error('[SubscriptionService] sendExpiryReminders error:', error);
        return { 
            success: false, 
            error: error.message,
            count: 0
        };
    }
}

/**
 * Renew expired or expiring subscription
 * @param {number} accountId - User account ID
 * @param {number} packageId - Optional: New package ID (if changing package)
 * @param {string} paymentMethod - Payment method
 * @returns {Object} - Renewal result with payment details
 */
async function renewSubscription(accountId, packageId = null, paymentMethod = 'Chip') {
    try {
        // Get user's most recent subscription (active or expired)
        const historySql = `
            SELECT 
                s.*,
                p.package_name,
                p.package_code,
                p.billing_period as pkg_billing_period,
                p.price_amount as pkg_price_amount
            FROM account_subscription s
            LEFT JOIN subscription_package p ON s.sub_package_id = p.sub_package_id
            WHERE s.account_id = ?
            ORDER BY s.created_date DESC
            LIMIT 1
        `;
        
        const [lastSubscription] = await db.raw(historySql, [accountId]);

        // Check if user has an active subscription
        const activeCheck = await getActiveSubscription(accountId);
        if (activeCheck.has_subscription) {
            const activeSub = activeCheck.data;
            
            // If subscription is active and not cancelled, they can't renew yet
            if (activeSub.status === 'Active' && activeSub.cancel_at_period_end !== 'Yes') {
                return {
                    success: false,
                    error: 'You have an active subscription. Cancel it first or wait until it expires to renew.'
                };
            }
        }

        // Determine which package to renew with
        let renewPackageId = packageId;
        if (!renewPackageId) {
            // Use the same package from last subscription
            if (lastSubscription && lastSubscription.sub_package_id) {
                renewPackageId = lastSubscription.sub_package_id;
            } else {
                return {
                    success: false,
                    error: 'No previous subscription found. Please subscribe to a package first.'
                };
            }
        }

        // Get package details
        const packageResult = await getPackageById(renewPackageId);
        if (!packageResult.success) {
            return {
                success: false,
                error: 'Package not found or inactive.'
            };
        }

        const pkg = packageResult.data;

        // Get user details for payment
        const userSql = `
            SELECT account_email, account_name, account_fullname
            FROM account
            WHERE account_id = ?
        `;
        const [userDetails] = await db.raw(userSql, [accountId]);
        
        if (!userDetails) {
            return {
                success: false,
                error: 'User account not found.'
            };
        }

        // Calculate period dates
        const now = new Date();
        const periodStart = now;
        const periodEnd = new Date(periodStart);
        
        if (pkg.billing_period === 'Monthly') {
            periodEnd.setMonth(periodEnd.getMonth() + 1);
        } else {
            periodEnd.setFullYear(periodEnd.getFullYear() + 1);
        }

        // Create payment record for renewal
        const SubscriptionPaymentService = require('./SubscriptionPaymentService');
        const paymentResult = await SubscriptionPaymentService.createPaymentRecord(
            null, // subscription_id will be set after successful payment
            accountId,
            pkg.price_amount,
            periodStart,
            periodEnd,
            paymentMethod,
            { subPackageId: renewPackageId }
        );

        if (!paymentResult.success) {
            return {
                success: false,
                error: 'Failed to create payment record.'
            };
        }

        // Store package_id in payment metadata for subscription creation after payment
        const updateMetadataSql = `
            UPDATE subscription_payment
            SET gateway_response = ?
            WHERE payment_ref = ?
        `;
        await db.raw(updateMetadataSql, [
            JSON.stringify({ 
                package_id: renewPackageId,
                is_renewal: true 
            }),
            paymentResult.data.payment_ref
        ]);

        // Create payment gateway URL — amount must include 6% SST
        const SST_RATE = 0.06;
        const chipAmount = parseFloat((parseFloat(pkg.price_amount) * (1 + SST_RATE)).toFixed(2));
        const ChipPaymentService = require('../../services/ChipPaymentService');
        const paymentGatewayResult = await ChipPaymentService.createSubscriptionPayment({
            payment_ref: paymentResult.data.payment_ref,
            account_id: accountId,
            amount: chipAmount,
            description: `${pkg.package_name} - ${pkg.billing_period} Renewal (incl. 6% SST)`,
            customer_email: userDetails.account_email || '',
            customer_name: userDetails.account_name || userDetails.account_fullname || ''
        });

        if (!paymentGatewayResult.success) {
            return {
                success: false,
                error: 'Failed to create payment gateway URL.'
            };
        }

        // Link CHIP purchase to bill so the webhook can locate it
        if (paymentResult.data.bill_id && paymentGatewayResult.data.purchase_id) {
            try {
                const { BillingSetCheckoutUrl } = require('./BillingService');
                await BillingSetCheckoutUrl(
                    paymentResult.data.bill_id,
                    paymentGatewayResult.data.purchase_id,
                    paymentGatewayResult.data.payment_url
                );
            } catch (e) {
                console.error('[SubscriptionService] renewSubscription BillingSetCheckoutUrl failed:', e);
            }
        }

        return {
            success: true,
            message: 'Please complete payment to renew your subscription.',
            data: {
                package_name: pkg.package_name,
                package_code: pkg.package_code,
                billing_period: pkg.billing_period,
                amount: pkg.price_amount,
                currency: pkg.currency,
                period_start: periodStart,
                period_end: periodEnd,
                payment_url: paymentGatewayResult.data.payment_url,
                payment_ref: paymentResult.data.payment_ref
            }
        };

    } catch (error) {
        console.error('[SubscriptionService] renewSubscription error:', error);
        return { 
            success: false, 
            error: error.message 
        };
    }
}

/**
 * Process auto-renewal billing for subscriptions expiring today (called by cron job daily).
 * Finds Active subscriptions with auto_renew = 'Yes' expiring today, creates a CHIP
 * payment for each, then notifies the user with the payment link.
 * @returns {Object} - Processing result with count of renewals initiated
 */
async function processAutoRenewal() {
    try {
        console.log('[SubscriptionService] Starting auto-renewal processing...');

        // Find Active paid subscriptions with auto_renew = 'Yes' expiring today
        // Exclude any that already have a Pending renewal payment created today
        const sql = `
            SELECT
                s.subscription_id,
                s.subscription_ref,
                s.account_id,
                s.sub_package_id,
                s.billing_period,
                a.account_email,
                a.account_name,
                a.account_fullname,
                p.package_name,
                p.package_code,
                p.price_amount,
                p.currency,
                p.billing_period AS pkg_billing_period
            FROM account_subscription s
            JOIN account a ON s.account_id = a.account_id
            JOIN subscription_package p ON s.sub_package_id = p.sub_package_id
            WHERE s.auto_renew = 'Yes'
              AND s.status = 'Active'
              AND DATE(s.current_period_end) = CURDATE()
              AND CAST(p.price_amount AS DECIMAL(10,2)) > 0
              AND NOT EXISTS (
                  SELECT 1
                  FROM subscription_payment sp
                  WHERE sp.account_id = s.account_id
                    AND sp.payment_status = 'Pending'
                    AND DATE(sp.created_date) = CURDATE()
              )
        `;

        const renewals = await db.raw(sql);

        if (renewals.length === 0) {
            console.log('[SubscriptionService] No auto-renewal subscriptions found for today');
            return { success: true, message: 'No auto-renewals to process', count: 0 };
        }

        console.log(`[SubscriptionService] Found ${renewals.length} subscription(s) for auto-renewal`);

        const SubscriptionPaymentService = require('./SubscriptionPaymentService');
        const ChipPaymentService = require('../../services/ChipPaymentService');
        const { BillingSetCheckoutUrl } = require('./BillingService');
        const SST_RATE = 0.06;

        let processedCount = 0;
        let failedCount = 0;

        for (const sub of renewals) {
            try {
                const now = new Date();
                const periodStart = now;
                const periodEnd = new Date(now);
                if (sub.pkg_billing_period === 'Monthly') {
                    periodEnd.setMonth(periodEnd.getMonth() + 1);
                } else {
                    periodEnd.setFullYear(periodEnd.getFullYear() + 1);
                }

                // 1. Create payment record
                const paymentResult = await SubscriptionPaymentService.createPaymentRecord(
                    null,
                    sub.account_id,
                    sub.price_amount,
                    periodStart,
                    periodEnd,
                    'Chip',
                    { subPackageId: sub.sub_package_id }
                );

                if (!paymentResult.success) {
                    throw new Error('Failed to create payment record');
                }

                // 2. Store gateway metadata for webhook to use when confirming subscription
                await db.raw(
                    `UPDATE subscription_payment SET gateway_response = ? WHERE payment_ref = ?`,
                    [
                        JSON.stringify({ package_id: sub.sub_package_id, is_renewal: true }),
                        paymentResult.data.payment_ref
                    ]
                );

                // 3. Charge SST-inclusive amount via CHIP
                const chipAmount = parseFloat((parseFloat(sub.price_amount) * (1 + SST_RATE)).toFixed(2));
                const gatewayResult = await ChipPaymentService.createSubscriptionPayment({
                    payment_ref: paymentResult.data.payment_ref,
                    account_id: sub.account_id,
                    amount: chipAmount,
                    description: `${sub.package_name} - ${sub.pkg_billing_period} Auto-Renewal (incl. 6% SST)`,
                    customer_email: sub.account_email || '',
                    customer_name: sub.account_name || sub.account_fullname || ''
                });

                if (!gatewayResult.success) {
                    throw new Error('Failed to create CHIP payment');
                }

                // 4. Link CHIP purchase to the bill
                if (paymentResult.data.bill_id && gatewayResult.data.purchase_id) {
                    try {
                        await BillingSetCheckoutUrl(
                            paymentResult.data.bill_id,
                            gatewayResult.data.purchase_id,
                            gatewayResult.data.payment_url
                        );
                    } catch (e) {
                        console.error('[SubscriptionService] processAutoRenewal BillingSetCheckoutUrl failed:', e);
                    }
                }

                // 5. Notify user with payment link
                await NotificationService.sendUserNotification(
                    sub.account_id,
                    '🔄 Subscription Renewal Ready',
                    `Your ${sub.package_name} subscription is expiring today. Tap to complete your renewal payment.`,
                    {
                        type:        'SubscriptionAutoRenewal',
                        payment_url: gatewayResult.data.payment_url,
                        payment_ref: paymentResult.data.payment_ref
                    }
                );

                // 6. Queue email with payment link
                try {
                    const queues = require('../../queue');
                    await queues.email.add('send', {
                        to: sub.account_email,
                        subject: `Action Required - Renew Your TaxLah ${sub.package_name} Subscription`,
                        html: `
                            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                                <h2 style="color: #1a5f7a;">🔄 Subscription Renewal</h2>
                                <p>Hi ${sub.account_name || sub.account_fullname},</p>
                                <p>Your <strong>${sub.package_name}</strong> subscription is expiring today. To continue enjoying premium features, please complete your renewal payment.</p>
                                <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
                                    <strong>Renewal Details:</strong><br>
                                    Plan: ${sub.package_name}<br>
                                    Billing Period: ${sub.pkg_billing_period}<br>
                                    Amount: RM ${chipAmount.toFixed(2)} (incl. 6% SST)
                                </div>
                                <div style="text-align: center; margin: 30px 0;">
                                    <a href="${gatewayResult.data.payment_url}"
                                        style="background-color: #1a5f7a; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">
                                        Pay Now
                                    </a>
                                </div>
                                <p style="color: #666; font-size: 13px;">If you did not request this renewal, you can ignore this email.</p>
                                <p>Best regards,<br>The TaxLah Team</p>
                            </div>
                        `
                    }, { priority: 2 });
                } catch (emailError) {
                    console.error(`[SubscriptionService] processAutoRenewal email failed for ${sub.account_email}:`, emailError);
                }

                await logSubscriptionHistory(
                    sub.subscription_id,
                    sub.account_id,
                    'Renewal',
                    `Auto-renewal bill generated - payment_ref: ${paymentResult.data.payment_ref}`,
                    null, null
                );

                processedCount++;
                console.log(`[SubscriptionService] Auto-renewal initiated for ${sub.subscription_ref} (account ${sub.account_id})`);

            } catch (subError) {
                failedCount++;
                console.error(`[SubscriptionService] processAutoRenewal failed for subscription ${sub.subscription_ref}:`, subError);
            }
        }

        const result = {
            success: true,
            message: `Auto-renewal initiated for ${processedCount} subscription(s)`,
            count: processedCount,
            failed: failedCount,
            total: renewals.length
        };

        console.log('[SubscriptionService] Auto-renewal processing completed:', result);
        return result;

    } catch (error) {
        console.error('[SubscriptionService] processAutoRenewal error:', error);
        return { success: false, error: error.message, count: 0 };
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
    renewSubscription,
    checkSubscriptionAccess,
    logSubscriptionHistory,
    getSubscriptionEvents,
    processExpiredSubscriptions,
    sendExpiryReminders,
    processAutoRenewal
};
