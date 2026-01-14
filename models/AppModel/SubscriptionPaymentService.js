/**
 * Subscription Payment Service
 * Manages subscription payments and payment gateway integration
 */

const db = require('../../utils/sqlbuilder');
const { v4: uuidv4 } = require('uuid');

/**
 * Create subscription payment record
 * @param {number} subscriptionId - Subscription ID (can be null for initial payment before subscription creation)
 * @param {number} accountId - Account ID
 * @param {number} amount - Payment amount
 * @param {Date} periodStart - Period start date
 * @param {Date} periodEnd - Period end date
 * @param {string} gateway - Payment gateway
 * @returns {Object} - Payment record
 */
async function createPaymentRecord(subscriptionId, accountId, amount, periodStart, periodEnd, gateway = 'Chip') {
    try {
        const paymentRef = `SUBPAY-${Date.now()}-${uuidv4().substring(0, 8).toUpperCase()}`;

        const sql = `
            INSERT INTO subscription_payment (
                subscription_id,
                account_id,
                payment_ref,
                amount,
                currency,
                period_start,
                period_end,
                payment_gateway,
                payment_status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        await db.raw(sql, [
            subscriptionId || null,
            accountId,
            paymentRef,
            amount,
            'MYR',
            periodStart,
            periodEnd,
            gateway,
            'Pending'
        ]);

        // Get created payment
        const getPaymentSql = `
            SELECT payment_id, payment_ref
            FROM subscription_payment
            WHERE payment_ref = ?
        `;
        const [payment] = await db.raw(getPaymentSql, [paymentRef]);

        return {
            success: true,
            data: payment
        };
    } catch (error) {
        console.error('[SubscriptionPaymentService] createPaymentRecord error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Get payment by reference
 * @param {string} paymentRef - Payment reference
 * @returns {Object} - Payment details
 */
async function getPaymentByRef(paymentRef) {
    try {
        const sql = `
            SELECT 
                sp.*,
                s.subscription_ref,
                s.billing_period,
                pkg.package_name,
                pkg.package_code
            FROM subscription_payment sp
            JOIN account_subscription s ON sp.subscription_id = s.subscription_id
            JOIN subscription_package pkg ON s.sub_package_id = pkg.sub_package_id
            WHERE sp.payment_ref = ?
        `;
        
        const result = await db.raw(sql, [paymentRef]);
        
        if (result.length === 0) {
            return { success: false, error: 'Payment not found' };
        }

        return {
            success: true,
            data: result[0]
        };
    } catch (error) {
        console.error('[SubscriptionPaymentService] getPaymentByRef error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Get user's payment history
 * @param {number} accountId - Account ID
 * @param {number} limit - Number of records
 * @returns {Object} - Payment history
 */
async function getPaymentHistory(accountId, limit = 10) {
    try {
        const sql = `
            SELECT 
                sp.payment_id,
                sp.payment_ref,
                sp.amount,
                sp.currency,
                sp.period_start,
                sp.period_end,
                sp.payment_gateway,
                sp.payment_status,
                sp.created_date,
                sp.paid_date,
                s.subscription_ref,
                s.billing_period,
                pkg.package_name
            FROM subscription_payment sp
            JOIN account_subscription s ON sp.subscription_id = s.subscription_id
            JOIN subscription_package pkg ON s.sub_package_id = pkg.sub_package_id
            WHERE sp.account_id = ?
            ORDER BY sp.created_date DESC
            LIMIT ?
        `;
        
        const payments = await db.raw(sql, [accountId, limit]);

        return {
            success: true,
            data: payments
        };
    } catch (error) {
        console.error('[SubscriptionPaymentService] getPaymentHistory error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Update payment status
 * @param {string} paymentRef - Payment reference
 * @param {string} status - New status
 * @param {string} gatewayTransactionId - Gateway transaction ID
 * @param {Object} gatewayResponse - Gateway response
 * @returns {Object} - Update result
 */
async function updatePaymentStatus(paymentRef, status, gatewayTransactionId = null, gatewayResponse = null) {
    try {
        const now = new Date();
        let updateFields = [];
        let updateValues = [];

        updateFields.push('payment_status = ?');
        updateValues.push(status);

        if (gatewayTransactionId) {
            updateFields.push('gateway_transaction_id = ?');
            updateValues.push(gatewayTransactionId);
        }

        if (gatewayResponse) {
            updateFields.push('gateway_response = ?');
            updateValues.push(JSON.stringify(gatewayResponse));
        }

        if (status === 'Paid') {
            updateFields.push('paid_date = ?');
            updateValues.push(now);
        } else if (status === 'Failed') {
            updateFields.push('failed_date = ?');
            updateValues.push(now);
        } else if (status === 'Refunded') {
            updateFields.push('refunded_date = ?');
            updateValues.push(now);
        }

        updateValues.push(paymentRef);

        const sql = `
            UPDATE subscription_payment
            SET ${updateFields.join(', ')}
            WHERE payment_ref = ?
        `;

        await db.raw(sql, updateValues);

        return {
            success: true,
            message: `Payment status updated to ${status}`
        };
    } catch (error) {
        console.error('[SubscriptionPaymentService] updatePaymentStatus error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Process successful subscription payment
 * Creates subscription if it doesn't exist, or activates existing one
 * @param {string} paymentRef - Payment reference
 * @param {string} gatewayTransactionId - Gateway transaction ID
 * @param {Object} gatewayResponse - Gateway response
 * @returns {Object} - Processing result
 */
async function processSuccessfulPayment(paymentRef, gatewayTransactionId, gatewayResponse = null) {
    try {
        // Get payment details
        const paymentResult = await getPaymentByRef(paymentRef);
        if (!paymentResult.success) {
            return paymentResult;
        }

        const payment = paymentResult.data;

        // Update payment status
        await updatePaymentStatus(paymentRef, 'Paid', gatewayTransactionId, gatewayResponse);

        const SubscriptionService = require('./SubscriptionService');

        // Check if subscription already exists
        const existingSub = await SubscriptionService.getActiveSubscription(payment.account_id);
        
        if (existingSub.has_subscription) {
            // Subscription exists - just update status if needed
            const updateSubSql = `
                UPDATE account_subscription
                SET status = 'Active',
                    payment_method = ?,
                    last_modified = NOW()
                WHERE subscription_id = ?
                AND status IN ('Trial', 'Past_Due')
            `;
            await db.raw(updateSubSql, [payment.payment_gateway, payment.subscription_id]);

            await SubscriptionService.logSubscriptionHistory(
                payment.subscription_id,
                payment.account_id,
                'Payment_Succeeded',
                `Payment of ${payment.currency} ${payment.amount} completed successfully`,
                null,
                'Active'
            );

            return {
                success: true,
                message: 'Payment processed and subscription activated',
                data: {
                    payment_ref: paymentRef,
                    subscription_id: payment.subscription_id,
                    amount: payment.amount
                }
            };
        } else {
            // No subscription exists - create it now (for non-trial packages)
            // Get package ID from payment gateway_response metadata
            let packageId = null;
            
            if (payment.gateway_response) {
                try {
                    const metadata = JSON.parse(payment.gateway_response);
                    packageId = metadata.package_id;
                } catch (e) {
                    console.error('Failed to parse gateway_response:', e);
                }
            }
            
            if (!packageId) {
                return {
                    success: false,
                    error: 'Cannot determine package ID from payment metadata'
                };
            }

            // Create subscription with skipPayment=true since payment is already confirmed
            const createResult = await SubscriptionService.createSubscription(
                payment.account_id,
                packageId,
                payment.payment_gateway,
                true // skipPayment = true
            );

            if (!createResult.success) {
                return createResult;
            }

            // Update payment record with the new subscription_id
            const updatePaymentSubSql = `
                UPDATE subscription_payment
                SET subscription_id = ?
                WHERE payment_ref = ?
            `;
            await db.raw(updatePaymentSubSql, [createResult.data.subscription_id, paymentRef]);

            return {
                success: true,
                message: 'Payment processed and subscription created',
                data: {
                    payment_ref: paymentRef,
                    subscription_id: createResult.data.subscription_id,
                    amount: payment.amount
                }
            };
        }
    } catch (error) {
        console.error('[SubscriptionPaymentService] processSuccessfulPayment error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Process failed subscription payment
 * @param {string} paymentRef - Payment reference
 * @param {string} reason - Failure reason
 * @returns {Object} - Processing result
 */
async function processFailedPayment(paymentRef, reason = null) {
    try {
        // Get payment details
        const paymentResult = await getPaymentByRef(paymentRef);
        if (!paymentResult.success) {
            return paymentResult;
        }

        const payment = paymentResult.data;

        // Update payment status
        await updatePaymentStatus(paymentRef, 'Failed', null, { reason });

        // Update subscription to Past_Due
        const updateSubSql = `
            UPDATE account_subscription
            SET status = 'Past_Due',
                last_modified = NOW()
            WHERE subscription_id = ?
            AND status IN ('Trial', 'Active')
        `;
        await db.raw(updateSubSql, [payment.subscription_id]);

        // Log subscription history
        const SubscriptionService = require('./SubscriptionService');
        await SubscriptionService.logSubscriptionHistory(
            payment.subscription_id,
            payment.account_id,
            'Payment_Failed',
            `Payment failed: ${reason || 'Unknown reason'}`,
            'Active',
            'Past_Due'
        );

        return {
            success: true,
            message: 'Payment failure processed',
            data: {
                payment_ref: paymentRef,
                subscription_id: payment.subscription_id,
                status: 'Past_Due'
            }
        };
    } catch (error) {
        console.error('[SubscriptionPaymentService] processFailedPayment error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Get upcoming payments for renewals (for cron job)
 * @param {number} daysAhead - Days to look ahead
 * @returns {Object} - Upcoming renewals
 */
async function getUpcomingRenewals(daysAhead = 7) {
    try {
        const sql = `
            SELECT 
                s.subscription_id,
                s.subscription_ref,
                s.account_id,
                s.sub_package_id,
                s.billing_period,
                s.price_amount,
                s.next_billing_date,
                s.payment_method,
                a.account_email,
                a.account_name,
                pkg.package_name
            FROM account_subscription s
            JOIN account a ON s.account_id = a.account_id
            JOIN subscription_package pkg ON s.sub_package_id = pkg.sub_package_id
            WHERE s.status = 'Active'
            AND s.auto_renew = 'Yes'
            AND s.next_billing_date BETWEEN NOW() AND DATE_ADD(NOW(), INTERVAL ? DAY)
            ORDER BY s.next_billing_date ASC
        `;
        
        const renewals = await db.raw(sql, [daysAhead]);

        return {
            success: true,
            data: renewals
        };
    } catch (error) {
        console.error('[SubscriptionPaymentService] getUpcomingRenewals error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Create renewal payment for subscription
 * @param {number} subscriptionId - Subscription ID
 * @returns {Object} - Renewal payment details
 */
async function createRenewalPayment(subscriptionId) {
    try {
        // Get subscription details
        const subSql = `
            SELECT 
                s.*,
                pkg.price_amount,
                pkg.billing_period
            FROM account_subscription s
            JOIN subscription_package pkg ON s.sub_package_id = pkg.sub_package_id
            WHERE s.subscription_id = ?
        `;
        const [subscription] = await db.raw(subSql, [subscriptionId]);

        if (!subscription) {
            return { success: false, error: 'Subscription not found' };
        }

        // Calculate next period
        const periodStart = new Date(subscription.current_period_end);
        const periodEnd = new Date(periodStart);

        if (subscription.billing_period === 'Monthly') {
            periodEnd.setMonth(periodEnd.getMonth() + 1);
        } else {
            periodEnd.setFullYear(periodEnd.getFullYear() + 1);
        }

        // Create payment record
        const paymentResult = await createPaymentRecord(
            subscriptionId,
            subscription.account_id,
            subscription.price_amount,
            periodStart,
            periodEnd,
            subscription.payment_method || 'ToyyibPay'
        );

        if (!paymentResult.success) {
            return paymentResult;
        }

        return {
            success: true,
            data: {
                payment_id: paymentResult.data.payment_id,
                payment_ref: paymentResult.data.payment_ref,
                amount: subscription.price_amount,
                period_start: periodStart,
                period_end: periodEnd
            }
        };
    } catch (error) {
        console.error('[SubscriptionPaymentService] createRenewalPayment error:', error);
        return { success: false, error: error.message };
    }
}

module.exports = {
    createPaymentRecord,
    getPaymentByRef,
    getPaymentHistory,
    updatePaymentStatus,
    processSuccessfulPayment,
    processFailedPayment,
    getUpcomingRenewals,
    createRenewalPayment
};
