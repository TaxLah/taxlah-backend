/**
 * Subscription Controller
 * API endpoints for subscription management
 */

const express = require('express');
const router = express.Router();
const {
    DEFAULT_API_RESPONSE,
    INTERNAL_SERVER_ERROR_API_RESPONSE,
    BAD_REQUEST_API_RESPONSE,
    SUCCESS_API_RESPONSE,
    UNAUTHORIZED_API_RESPONSE,
    NOT_FOUND_API_RESPONSE,
    ERROR_UNAUTHENTICATED,
    CHECK_EMPTY
} = require('../../../configs/helper');

const SubscriptionService = require('../../../models/AppModel/SubscriptionService');
const SubscriptionPaymentService = require('../../../models/AppModel/SubscriptionPaymentService');
const ChipPaymentService = require('../../../services/ChipPaymentService');
const NotificationService = require('../../../services/NotificationService');
const { auth } = require('../../../configs/auth');
const moment = require('moment');
const crypto = require('crypto');

// Receipt token secret - used for generating secure public receipt URLs
const RECEIPT_TOKEN_SECRET = process.env.RECEIPT_TOKEN_SECRET || 'taxlah-receipt-secret-key-2026';

/**
 * Generate a secure token for public receipt access
 * @param {string} paymentRef - Payment reference
 * @returns {string} - Secure token
 */
function generateReceiptToken(paymentRef) {
    return crypto
        .createHmac('sha256', RECEIPT_TOKEN_SECRET)
        .update(paymentRef)
        .digest('hex')
        .substring(0, 32);
}

/**
 * Verify receipt token
 * @param {string} paymentRef - Payment reference
 * @param {string} token - Token to verify
 * @returns {boolean} - True if valid
 */
function verifyReceiptToken(paymentRef, token) {
    const validToken = generateReceiptToken(paymentRef);
    return token === validToken;
}

// ============================================================================
// SUBSCRIPTION PACKAGES
// ============================================================================

/**
 * GET /api/subscription/packages
 * Get all available subscription packages
 */
router.get("/packages", async (req, res) => {
    let response = DEFAULT_API_RESPONSE;

    try {
        const result = await SubscriptionService.getSubscriptionPackages();

        if (!result.success) {
            response = INTERNAL_SERVER_ERROR_API_RESPONSE;
            response.message = result.error;
            return res.status(response.status_code).json(response);
        }

        response = SUCCESS_API_RESPONSE;
        response.message = "Subscription packages retrieved successfully.";
        response.data = result.data;

        return res.status(response.status_code).json(response);
    } catch (error) {
        console.error("Error Get Subscription Packages:", error);
        response = INTERNAL_SERVER_ERROR_API_RESPONSE;
        response.message = "An error occurred while retrieving packages.";
        return res.status(response.status_code).json(response);
    }
});

/**
 * GET /api/subscription/packages/:packageId
 * Get specific subscription package details
 */
router.get("/packages/:packageId", async (req, res) => {
    let response = DEFAULT_API_RESPONSE;

    try {
        const packageId = parseInt(req.params.packageId);

        if (isNaN(packageId)) {
            response = BAD_REQUEST_API_RESPONSE;
            response.message = "Invalid package ID.";
            return res.status(response.status_code).json(response);
        }

        const result = await SubscriptionService.getPackageById(packageId);

        if (!result.success) {
            response = NOT_FOUND_API_RESPONSE;
            response.message = result.error;
            return res.status(response.status_code).json(response);
        }

        response = SUCCESS_API_RESPONSE;
        response.message = "Package details retrieved successfully.";
        response.data = result.data;

        res.status(response.status_code).json(response);
    } catch (error) {
        console.error("Error Get Package Details:", error);
        response = INTERNAL_SERVER_ERROR_API_RESPONSE;
        response.message = "An error occurred while retrieving package details.";
        res.status(response.status_code).json(response);
    }
});

// ============================================================================
// USER SUBSCRIPTION MANAGEMENT
// ============================================================================

function isExpiringSoonOrExpired(expiryDate) {
    const now               = moment();
    const expiry            = moment(expiryDate);
    const daysUntilExpiry   = expiry.diff(now, 'days');

    return daysUntilExpiry <= 3;
}
/**
 * GET /api/subscription/my-subscription
 * Get user's current active subscription
 */
router.get("/my-subscription", auth(), async (req, res) => {
    
    console.log("Log Moment : ", moment().format("YYYY-MM-DD HH:mm A"))

    let response = DEFAULT_API_RESPONSE;
    let user = req.user || null;

    if (CHECK_EMPTY(user)) {
        response = UNAUTHORIZED_API_RESPONSE;
        response.message = ERROR_UNAUTHENTICATED;
        return res.status(response.status_code).json(response);
    }

    try {
        const result = await SubscriptionService.getActiveSubscription(user.account_id);
        console.log("Log Result My Subscription : ", result)

        if (!result.success) {
            response = INTERNAL_SERVER_ERROR_API_RESPONSE;
            response.message = result.error;
            return res.status(response.status_code).json(response);
        }

        // Check if subscription can be renewed (expiry within 3 days)
        let canRenew = isExpiringSoonOrExpired(result.data.current_period_end) || false
        // if (result.has_subscription && result.data && result.data.current_period_end) {
        //     const expiryDate    = new Date(result.data.current_period_end);
        //     const today         = new Date();
            
        //     // Set both dates to start of day for accurate day comparison
        //     expiryDate.setHours(0, 0, 0, 0);
        //     today.setHours(0, 0, 0, 0);
            
        //     // Calculate difference in days
        //     const diffTime = expiryDate.getTime() - today.getTime();
        //     const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            
        //     // Can renew if expiry is within 3 days (0 to 3 days remaining)
        //     canRenew = diffDays >= 0 && diffDays <= 3;
        // }

        // if(moment(result.data.current_period_end).is)
        

        response                    = SUCCESS_API_RESPONSE;
        response.message            = result.has_subscription ? "Active subscription found." : "No active subscription.";
        response.data               = result.data;
        response.has_subscription   = result.has_subscription;
        response.can_renew          = canRenew || false;

        res.status(response.status_code).json(response);
    } catch (error) {
        console.error("Error Get My Subscription:", error);
        response = INTERNAL_SERVER_ERROR_API_RESPONSE;
        response.message = "An error occurred while retrieving your subscription.";
        res.status(response.status_code).json(response);
    }
});

/**
 * GET /api/subscription/check-access
 * Check user's subscription access and features
 */
router.get("/check-access", auth(), async (req, res) => {
    let response = DEFAULT_API_RESPONSE;
    let user = req.user || null;

    if (CHECK_EMPTY(user)) {
        response = UNAUTHORIZED_API_RESPONSE;
        response.message = ERROR_UNAUTHENTICATED;
        return res.status(response.status_code).json(response);
    }

    try {
        const result = await SubscriptionService.checkSubscriptionAccess(user.account_id);

        if (!result.success) {
            response = INTERNAL_SERVER_ERROR_API_RESPONSE;
            response.message = result.error;
            return res.status(response.status_code).json(response);
        }

        response = SUCCESS_API_RESPONSE;
        response.message = "Subscription access checked successfully.";
        response.data = result;

        res.status(response.status_code).json(response);
    } catch (error) {
        console.error("Error Check Subscription Access:", error);
        response = INTERNAL_SERVER_ERROR_API_RESPONSE;
        response.message = "An error occurred while checking subscription access.";
        res.status(response.status_code).json(response);
    }
});

/**
 * POST /api/subscription/subscribe
 * Subscribe to a package
 * Body: { package_id, payment_method }
 */
router.post("/subscribe", auth(), async (req, res) => {
    let response = DEFAULT_API_RESPONSE;
    let user = req.user || null;

    if (CHECK_EMPTY(user)) {
        response = UNAUTHORIZED_API_RESPONSE;
        response.message = ERROR_UNAUTHENTICATED;
        return res.status(response.status_code).json(response);
    }

    try {
        const { package_id, payment_method } = req.body;

        if (!package_id) {
            response = BAD_REQUEST_API_RESPONSE;
            response.message = "Package ID is required.";
            return res.status(response.status_code).json(response);
        }

        // Get package details
        const packageResult = await SubscriptionService.getPackageById(package_id);
        if (!packageResult.success) {
            response = NOT_FOUND_API_RESPONSE;
            response.message = "Package not found.";
            return res.status(response.status_code).json(response);
        }

        const pkg = packageResult.data;

        // ── Free package (price = 0): activate immediately, no payment needed ──────
        if (parseFloat(pkg.price_amount) === 0) {
            const subResult = await SubscriptionService.createSubscription(
                user.account_id, package_id, 'Free', true
            );
            if (!subResult.success) {
                response = BAD_REQUEST_API_RESPONSE;
                response.message = subResult.error;
                return res.status(response.status_code).json(response);
            }
            response = SUCCESS_API_RESPONSE;
            response.message = "Free subscription activated.";
            response.data = subResult.data;
            return res.status(response.status_code).json(response);
        }

        // ── Paid package: create bill + CHIP purchase; subscription created ONLY after payment ──
        // Do NOT create a subscription record here. The webhook (POST /subscription/webhook)
        // will call processSuccessfulPayment() which creates it once CHIP confirms the payment.
        const now = new Date();
        const periodEnd = new Date(now);

        if (pkg.billing_period === 'Monthly') {
            periodEnd.setMonth(periodEnd.getMonth() + 1);
        } else if (pkg.billing_period === 'Yearly') {
            periodEnd.setFullYear(periodEnd.getFullYear() + 1);
        } else {
            periodEnd.setMonth(periodEnd.getMonth() + 1);
        }

        // Create subscription_payment record + bill
        const paymentResult = await SubscriptionPaymentService.createPaymentRecord(
            null, // subscription_id assigned by webhook after payment
            user.account_id,
            pkg.price_amount,
            now,
            periodEnd,
            payment_method || 'Chip',
            { subPackageId: package_id }
        );

        if (!paymentResult.success) {
            response = INTERNAL_SERVER_ERROR_API_RESPONSE;
            response.message = "Failed to create payment record.";
            return res.status(response.status_code).json(response);
        }

        // Store package_id in metadata so the webhook knows which package to activate
        const updateMetadataSql = `
            UPDATE subscription_payment
            SET gateway_response = ?
            WHERE payment_ref = ?
        `;
        await require('../../../utils/sqlbuilder').raw(updateMetadataSql, [
            JSON.stringify({ package_id }),
            paymentResult.data.payment_ref
        ]);

        // Create CHIP payment URL — amount must include 6% SST
        const SST_RATE = 0.06;
        const chipAmount = parseFloat((parseFloat(pkg.price_amount) * (1 + SST_RATE)).toFixed(2));
        const paymentGatewayResult = await ChipPaymentService.createSubscriptionPayment({
            payment_ref:    paymentResult.data.payment_ref,
            account_id:     user.account_id,
            amount:         chipAmount,
            description:    `${pkg.package_name} - ${pkg.billing_period} Subscription (incl. 6% SST)`,
            customer_email: user.account_email || '',
            customer_name:  user.account_name || user.account_fullname || ''
        });

        if (!paymentGatewayResult.success) {
            response = INTERNAL_SERVER_ERROR_API_RESPONSE;
            response.message = "Failed to create payment gateway URL.";
            return res.status(response.status_code).json(response);
        }

        // Link CHIP purchase to bill so the webhook can locate it by chip_purchase_id
        if (paymentResult.data.bill_id && paymentGatewayResult.data.purchase_id) {
            const { BillingSetCheckoutUrl } = require('../../../models/AppModel/BillingService');
            await BillingSetCheckoutUrl(
                paymentResult.data.bill_id,
                paymentGatewayResult.data.purchase_id,
                paymentGatewayResult.data.payment_url
            ).catch(e => console.error('[Subscription/subscribe] BillingSetCheckoutUrl failed:', e));
        }

        // Generate receipt URL with token
        const receiptToken = generateReceiptToken(paymentResult.data.payment_ref);
        const receiptUrl = `${req.protocol}://${req.get('host')}/api/subscription/public-receipt/${paymentResult.data.payment_ref}/${receiptToken}`;

        response = SUCCESS_API_RESPONSE;
        response.message = "Please complete payment to activate subscription.";
        response.data = {
            package_name:   pkg.package_name,
            amount:         pkg.price_amount,
            billing_period: pkg.billing_period,
            payment_url:    paymentGatewayResult.data.payment_url,
            payment_ref:    paymentResult.data.payment_ref,
            receipt_url:    receiptUrl
        };
        return res.status(response.status_code).json(response);
    } catch (error) {
        console.error("Error Subscribe:", error);
        response = INTERNAL_SERVER_ERROR_API_RESPONSE;
        response.message = "An error occurred while processing subscription.";
        res.status(response.status_code).json(response);
    }
});

/**
 * POST /api/subscription/cancel
 * Cancel user's subscription
 * Body: { cancel_at_period_end, reason }
 */
router.post("/cancel", auth(), async (req, res) => {
    let response = DEFAULT_API_RESPONSE;
    let user = req.user || null;

    if (CHECK_EMPTY(user)) {
        response = UNAUTHORIZED_API_RESPONSE;
        response.message = ERROR_UNAUTHENTICATED;
        return res.status(response.status_code).json(response);
    }

    try {
        const { cancel_at_period_end = true, reason } = req.body;

        const result = await SubscriptionService.cancelSubscription(
            user.account_id,
            cancel_at_period_end,
            reason
        );

        if (!result.success) {
            response = BAD_REQUEST_API_RESPONSE;
            response.message = result.error;
            return res.status(response.status_code).json(response);
        }

        response = SUCCESS_API_RESPONSE;
        response.message = result.message;
        response.data = result.data;

        res.status(response.status_code).json(response);
    } catch (error) {
        console.error("Error Cancel Subscription:", error);
        response = INTERNAL_SERVER_ERROR_API_RESPONSE;
        response.message = "An error occurred while cancelling subscription.";
        res.status(response.status_code).json(response);
    }
});

/**
 * POST /api/subscription/resume
 * Resume a cancelled subscription (before period end)
 */
router.post("/resume", auth(), async (req, res) => {
    let response = DEFAULT_API_RESPONSE;
    let user = req.user || null;

    if (CHECK_EMPTY(user)) {
        response = UNAUTHORIZED_API_RESPONSE;
        response.message = ERROR_UNAUTHENTICATED;
        return res.status(response.status_code).json(response);
    }

    try {
        const result = await SubscriptionService.resumeSubscription(user.account_id);

        if (!result.success) {
            response = BAD_REQUEST_API_RESPONSE;
            response.message = result.error;
            return res.status(response.status_code).json(response);
        }

        response = SUCCESS_API_RESPONSE;
        response.message = result.message;
        response.data = result.data;

        res.status(response.status_code).json(response);
    } catch (error) {
        console.error("Error Resume Subscription:", error);
        response = INTERNAL_SERVER_ERROR_API_RESPONSE;
        response.message = "An error occurred while resuming subscription.";
        res.status(response.status_code).json(response);
    }
});

/**
 * POST /api/subscription/renew
 * Renew an expired or expiring subscription
 * Body: { package_id, payment_method }
 */
router.post("/renew", auth(), async (req, res) => {
    let response = DEFAULT_API_RESPONSE;
    let user = req.user || null;

    if (CHECK_EMPTY(user)) {
        response = UNAUTHORIZED_API_RESPONSE;
        response.message = ERROR_UNAUTHENTICATED;
        return res.status(response.status_code).json(response);
    }

    try {
        // Get user's current active subscription
        const activeSubResult = await SubscriptionService.getActiveSubscription(user.account_id);
        if (!activeSubResult.success || !activeSubResult.has_subscription) {
            response = BAD_REQUEST_API_RESPONSE;
            response.message = "No active subscription found to renew.";
            return res.status(response.status_code).json(response);
        }

        const currentSub = activeSubResult.data;
        const package_id = currentSub.sub_package_id;

        // Check if subscription is eligible for renewal (expiry within 3 days)
        if (currentSub.subscription_end_date) {
            const expiryDate = new Date(currentSub.subscription_end_date);
            const today = new Date();
            
            // Set both dates to start of day for accurate day comparison
            expiryDate.setHours(0, 0, 0, 0);
            today.setHours(0, 0, 0, 0);
            
            // Calculate difference in days
            const diffTime = expiryDate.getTime() - today.getTime();
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            
            // Can only renew if expiry is within 3 days (0 to 3 days remaining)
            if (diffDays < 0) {
                response = BAD_REQUEST_API_RESPONSE;
                response.message = "Your subscription has already expired. Please subscribe again.";
                return res.status(response.status_code).json(response);
            }
            
            if (diffDays > 3) {
                response = BAD_REQUEST_API_RESPONSE;
                response.message = `You can only renew your subscription within 3 days before expiry. Your subscription expires in ${diffDays} days.`;
                response.data = {
                    days_until_expiry: diffDays,
                    expiry_date: currentSub.subscription_end_date,
                    can_renew_from: new Date(expiryDate.getTime() - (3 * 24 * 60 * 60 * 1000)).toISOString().split('T')[0]
                };
                return res.status(response.status_code).json(response);
            }
        }

        // Check if there's an existing pending/unpaid renewal transaction
        const checkPendingSql = `
            SELECT 
                sp.payment_id,
                sp.payment_ref,
                sp.amount,
                sp.payment_status,
                b.bill_id,
                b.bill_no,
                b.checkout_url as chip_checkout_url
            FROM subscription_payment sp
            LEFT JOIN bill b ON b.account_id = sp.account_id 
                AND b.subscription_id = sp.subscription_id
                AND b.status = 'Pending'
            WHERE sp.account_id = ?
            AND sp.payment_status IN ('Pending', 'Unpaid')
            AND sp.subscription_id = ?
            ORDER BY sp.created_date DESC
            LIMIT 1
        `;
        
        const pendingPayments = await require('../../../utils/sqlbuilder').raw(checkPendingSql, [user.account_id, currentSub.subscription_id]);

        // If there's a pending payment with checkout URL, return it
        if (pendingPayments.length > 0 && pendingPayments[0].chip_checkout_url) {
            const pending = pendingPayments[0];
            
            // Get package details
            const packageResult = await SubscriptionService.getPackageById(package_id);
            const pkg           = packageResult.success ? packageResult.data : null;

            // Send reminder notification about pending renewal bill
            try {
                await NotificationService.sendUserNotification(
                    user.account_id,
                    '⏳ Pending Renewal Payment',
                    `You have a pending renewal bill (${pending.bill_no || 'Bill'}) for MYR ${pending.amount}. Please complete payment to continue your subscription.`,
                    {
                        type:           'RenewalBillPending',
                        payment_ref:    pending.payment_ref,
                        bill_no:        pending.bill_no || '',
                        amount:         String(pending.amount),
                        package_name:   pkg ? pkg.package_name : 'Subscription'
                    }
                );
            } catch (notifError) {
                console.error('[Subscription/renew] Failed to send pending bill notification:', notifError);
                // Don't fail the request if notification fails
            }

            // Generate receipt URL with token
            const receiptToken = generateReceiptToken(pending.payment_ref);
            const receiptUrl = `${req.protocol}://${req.get('host')}/api/subscription/public-receipt/${pending.payment_ref}/${receiptToken}`;

            response = SUCCESS_API_RESPONSE;
            response.message = "Existing pending renewal found. Please complete payment.";
            response.data = {
                package_name:   pkg ? pkg.package_name : 'Subscription',
                amount:         pending.amount,
                billing_period: pkg ? pkg.billing_period : currentSub.billing_period,
                payment_url:    pending.chip_checkout_url,
                payment_ref:    pending.payment_ref,
                receipt_url:    receiptUrl,
                is_existing:    true
            };
            return res.status(response.status_code).json(response);
        }

        // No pending payment, create a new renewal transaction
        // Get package details
        const packageResult = await SubscriptionService.getPackageById(package_id);
        if (!packageResult.success) {
            response = NOT_FOUND_API_RESPONSE;
            response.message = "Package not found.";
            return res.status(response.status_code).json(response);
        }

        const pkg = packageResult.data;

        // Calculate new period dates
        const now           = new Date();
        const periodStart   = new Date(currentSub.current_period_end);
        const periodEnd     = new Date(periodStart);

        if (pkg.billing_period === 'Monthly') {
            periodEnd.setMonth(periodEnd.getMonth() + 1);
        } else if (pkg.billing_period === 'Yearly') {
            periodEnd.setFullYear(periodEnd.getFullYear() + 1);
        } else {
            periodEnd.setMonth(periodEnd.getMonth() + 1);
        }

        // Create subscription_payment record + bill
        const paymentResult = await SubscriptionPaymentService.createPaymentRecord(
            currentSub.subscription_id,
            user.account_id,
            pkg.price_amount,
            periodStart,
            periodEnd,
            'Chip',
            { 
                billType: 'Subscription Renewal',
                billDescription: `Renewal - ${pkg.package_name}`,
                subPackageId: package_id 
            }
        );

        if (!paymentResult.success) {
            response = INTERNAL_SERVER_ERROR_API_RESPONSE;
            response.message = "Failed to create payment record.";
            return res.status(response.status_code).json(response);
        }

        // Store package_id in metadata so the webhook knows which package to activate
        const updateMetadataSql = `
            UPDATE subscription_payment
            SET gateway_response = ?
            WHERE payment_ref = ?
        `;
        await require('../../../utils/sqlbuilder').raw(updateMetadataSql, [
            JSON.stringify({ package_id, is_renewal: true }),
            paymentResult.data.payment_ref
        ]);

        // Create CHIP payment URL — amount must include 6% SST
        const SST_RATE      = 0.06;
        const chipAmount    = parseFloat((parseFloat(pkg.price_amount) * (1 + SST_RATE)).toFixed(2));
        const paymentGatewayResult = await ChipPaymentService.createSubscriptionPayment({
            payment_ref:    paymentResult.data.payment_ref,
            account_id:     user.account_id,
            amount:         chipAmount,
            description:    `${pkg.package_name} - ${pkg.billing_period} Renewal (incl. 6% SST)`,
            customer_email: user.account_email || '',
            customer_name:  user.account_name || user.account_fullname || ''
        });

        if (!paymentGatewayResult.success) {
            response = INTERNAL_SERVER_ERROR_API_RESPONSE;
            response.message = "Failed to create payment gateway URL.";
            return res.status(response.status_code).json(response);
        }

        // Link CHIP purchase to bill so the webhook can locate it by chip_purchase_id
        if (paymentResult.data.bill_id && paymentGatewayResult.data.purchase_id) {
            const { BillingSetCheckoutUrl } = require('../../../models/AppModel/BillingService');
            await BillingSetCheckoutUrl(
                paymentResult.data.bill_id,
                paymentGatewayResult.data.purchase_id,
                paymentGatewayResult.data.payment_url
            ).catch(e => console.error('[Subscription/renew] BillingSetCheckoutUrl failed:', e));
        }

        // Send notification about renewal billing creation
        try {
            await NotificationService.sendUserNotification(
                user.account_id,
                '🔄 Subscription Renewal Bill Created',
                `Your ${pkg.package_name} renewal bill (${paymentResult.data.bill_no || 'Bill'}) for MYR ${chipAmount.toFixed(2)} has been created. Please complete payment to continue your subscription.`,
                {
                    type:           'RenewalBillCreated',
                    payment_ref:    paymentResult.data.payment_ref,
                    bill_no:        paymentResult.data.bill_no || '',
                    amount:         String(chipAmount),
                    package_name:   pkg.package_name,
                    billing_period: pkg.billing_period
                }
            );
        } catch (notifError) {
            console.error('[Subscription/renew] Failed to send renewal notification:', notifError);
            // Don't fail the request if notification fails
        }

        // Generate receipt URL with token
        const receiptToken = generateReceiptToken(paymentResult.data.payment_ref);
        const receiptUrl = `${req.protocol}://${req.get('host')}/api/subscription/public-receipt/${paymentResult.data.payment_ref}/${receiptToken}`;

        response = SUCCESS_API_RESPONSE;
        response.message = "Please complete payment to renew subscription.";
        response.data = {
            package_name:   pkg.package_name,
            amount:         pkg.price_amount,
            billing_period: pkg.billing_period,
            payment_url:    paymentGatewayResult.data.payment_url,
            payment_ref:    paymentResult.data.payment_ref,
            receipt_url:    receiptUrl,
            is_existing:    false
        };
        return res.status(response.status_code).json(response);
    } catch (error) {
        console.error("Error Renew Subscription:", error);
        response = INTERNAL_SERVER_ERROR_API_RESPONSE;
        response.message = "An error occurred while processing renewal.";
        res.status(response.status_code).json(response);
    }
});

// ============================================================================
// SUBSCRIPTION HISTORY
// ============================================================================

/**
 * GET /api/subscription/history
 * Get user's subscription history
 */
router.get("/history", auth(), async (req, res) => {
    let response = DEFAULT_API_RESPONSE;
    let user = req.user || null;

    if (CHECK_EMPTY(user)) {
        response = UNAUTHORIZED_API_RESPONSE;
        response.message = ERROR_UNAUTHENTICATED;
        return res.status(response.status_code).json(response);
    }

    try {
        const limit = parseInt(req.query.limit) || 10;

        const result = await SubscriptionService.getSubscriptionHistory(user.account_id, limit);

        if (!result.success) {
            response = INTERNAL_SERVER_ERROR_API_RESPONSE;
            response.message = result.error;
            return res.status(response.status_code).json(response);
        }

        response = SUCCESS_API_RESPONSE;
        response.message = "Subscription history retrieved successfully.";
        response.data = result.data;

        res.status(response.status_code).json(response);
    } catch (error) {
        console.error("Error Get Subscription History:", error);
        response = INTERNAL_SERVER_ERROR_API_RESPONSE;
        response.message = "An error occurred while retrieving history.";
        res.status(response.status_code).json(response);
    }
});

/**
 * GET /api/subscription/events
 * Get user's subscription event history
 */
router.get("/events", auth(), async (req, res) => {
    let response = DEFAULT_API_RESPONSE;
    let user = req.user || null;

    if (CHECK_EMPTY(user)) {
        response = UNAUTHORIZED_API_RESPONSE;
        response.message = ERROR_UNAUTHENTICATED;
        return res.status(response.status_code).json(response);
    }

    try {
        const limit = parseInt(req.query.limit) || 20;

        const result = await SubscriptionService.getSubscriptionEvents(user.account_id, limit);

        if (!result.success) {
            response = INTERNAL_SERVER_ERROR_API_RESPONSE;
            response.message = result.error;
            return res.status(response.status_code).json(response);
        }

        response = SUCCESS_API_RESPONSE;
        response.message = "Subscription events retrieved successfully.";
        response.data = result.data;

        res.status(response.status_code).json(response);
    } catch (error) {
        console.error("Error Get Subscription Events:", error);
        response = INTERNAL_SERVER_ERROR_API_RESPONSE;
        response.message = "An error occurred while retrieving events.";
        res.status(response.status_code).json(response);
    }
});

// ============================================================================
// PAYMENT MANAGEMENT
// ============================================================================

/**
 * GET /api/subscription/payments
 * Get user's payment history
 */
router.get("/payments", auth(), async (req, res) => {
    let response = DEFAULT_API_RESPONSE;
    let user = req.user || null;

    if (CHECK_EMPTY(user)) {
        response = UNAUTHORIZED_API_RESPONSE;
        response.message = ERROR_UNAUTHENTICATED;
        return res.status(response.status_code).json(response);
    }

    try {
        const limit = parseInt(req.query.limit) || 10;

        const result = await SubscriptionPaymentService.getPaymentHistory(user.account_id, limit);

        if (!result.success) {
            response = INTERNAL_SERVER_ERROR_API_RESPONSE;
            response.message = result.error;
            return res.status(response.status_code).json(response);
        }

        response = SUCCESS_API_RESPONSE;
        response.message = "Payment history retrieved successfully.";
        response.data = result.data;

        res.status(response.status_code).json(response);
    } catch (error) {
        console.error("Error Get Payment History:", error);
        response = INTERNAL_SERVER_ERROR_API_RESPONSE;
        response.message = "An error occurred while retrieving payment history.";
        res.status(response.status_code).json(response);
    }
});

/**
 * GET /api/subscription/payment/:paymentRef
 * Get specific payment details
 */
router.get("/payment/:paymentRef", auth(), async (req, res) => {
    let response = DEFAULT_API_RESPONSE;
    let user = req.user || null;

    if (CHECK_EMPTY(user)) {
        response = UNAUTHORIZED_API_RESPONSE;
        response.message = ERROR_UNAUTHENTICATED;
        return res.status(response.status_code).json(response);
    }

    try {
        const { paymentRef } = req.params;

        const result = await SubscriptionPaymentService.getPaymentByRef(paymentRef);

        if (!result.success) {
            response = NOT_FOUND_API_RESPONSE;
            response.message = result.error;
            return res.status(response.status_code).json(response);
        }

        // Verify payment belongs to user
        if (result.data.account_id !== user.account_id) {
            response = UNAUTHORIZED_API_RESPONSE;
            response.message = "Unauthorized access to payment.";
            return res.status(response.status_code).json(response);
        }

        response = SUCCESS_API_RESPONSE;
        response.message = "Payment details retrieved successfully.";
        response.data = result.data;

        res.status(response.status_code).json(response);
    } catch (error) {
        console.error("Error Get Payment Details:", error);
        response = INTERNAL_SERVER_ERROR_API_RESPONSE;
        response.message = "An error occurred while retrieving payment details.";
        res.status(response.status_code).json(response);
    }
});

/**
 * GET /api/subscription/payment-receipt/:paymentRef
 * Get payment receipt with full details for display/download
 */
router.get("/payment-receipt/:paymentRef", auth(), async (req, res) => {
    let response = DEFAULT_API_RESPONSE;
    let user = req.user || null;

    if (CHECK_EMPTY(user)) {
        response = UNAUTHORIZED_API_RESPONSE;
        response.message = ERROR_UNAUTHENTICATED;
        return res.status(response.status_code).json(response);
    }

    try {
        const { paymentRef } = req.params;

        const result = await SubscriptionPaymentService.getPaymentReceipt(paymentRef);

        if (!result.success) {
            response = NOT_FOUND_API_RESPONSE;
            response.message = result.error;
            return res.status(response.status_code).json(response);
        }

        // Verify payment belongs to user
        if (result.data.account_id !== user.account_id) {
            response = UNAUTHORIZED_API_RESPONSE;
            response.message = "Unauthorized access to payment receipt.";
            return res.status(response.status_code).json(response);
        }

        response = SUCCESS_API_RESPONSE;
        response.message = "Payment receipt retrieved successfully.";
        response.data = result.data;

        res.status(response.status_code).json(response);
    } catch (error) {
        console.error("Error Get Payment Receipt:", error);
        response = INTERNAL_SERVER_ERROR_API_RESPONSE;
        response.message = "An error occurred while retrieving payment receipt.";
        res.status(response.status_code).json(response);
    }
});

/**
 * GET /api/subscription/public-receipt/:paymentRef/:token
 * Public endpoint to get payment receipt with token validation
 * No authentication required - uses secure token instead
 * For use in browser receipt pages, email links, etc.
 */
router.get("/public-receipt/:paymentRef", async (req, res) => {
    let response = DEFAULT_API_RESPONSE;

    try {
        const { paymentRef, token } = req.params;

        // Verify token
        // if (!verifyReceiptToken(paymentRef, token)) {
        //     response = UNAUTHORIZED_API_RESPONSE;
        //     response.message = "Invalid or expired receipt token.";
        //     return res.status(response.status_code).json(response);
        // }

        // Get payment receipt
        const result = await SubscriptionPaymentService.getPaymentReceipt(paymentRef);

        if (!result.success) {
            response = NOT_FOUND_API_RESPONSE;
            response.message = result.error || "Payment receipt not found.";
            return res.status(response.status_code).json(response);
        }

        response = SUCCESS_API_RESPONSE;
        response.message = "Payment receipt retrieved successfully.";
        response.data = result.data;

        return res.status(response.status_code).json(response);
    } catch (error) {
        console.error("Error Get Public Receipt:", error);
        response = INTERNAL_SERVER_ERROR_API_RESPONSE;
        response.message = "An error occurred while retrieving payment receipt.";
        return res.status(response.status_code).json(response);
    }
});

// ============================================================================
// WEBHOOK - PAYMENT GATEWAY CALLBACK
// ============================================================================

/**
 * POST /api/subscription/webhook
 * Handle payment gateway webhook for subscription payments
 */
router.post("/webhook", async (req, res) => {
    try {
        const signature = req.headers['x-signature'];
        const rawBody = req.body.toString('utf8');

        console.log('[Subscription Webhook] Received webhook');
        console.log('Signature:', signature);
        console.log('Raw Body:', rawBody);

        // Verify signature
        const verifyResult = ChipPaymentService.verifyWebhookSignature(rawBody, signature);
        if (!verifyResult) {
            console.error('[Subscription Webhook] Invalid signature');
            return res.status(200).json({ success: true }); // Return 200 to prevent retries
        }

        // Parse webhook payload
        const webhookData = JSON.parse(rawBody)
        console.log("Log Webhook Data : ", webhookData)
        
        const parseResult = ChipPaymentService.ParseWebhookPayload(webhookData);

        if (!parseResult.status) {
            console.error('[Subscription Webhook] Failed to parse webhook');
            return res.status(200).json({ success: true });
        }

        const data = parseResult.data;
        console.log("Log Parsed Data : ", data)

        console.log('=== SUBSCRIPTION WEBHOOK ===');
        console.log('Event Type:', data.event_type);
        console.log('Purchase ID:', data.purchase_id);
        console.log('Status:', data.payment_status);
        console.log('Reference:', data.reference);
        console.log('Is Paid:', data.is_paid);
        console.log('============================');

        // Resolve our payment_ref from metadata first (most reliable).
        // CHIP's data.reference is CHIP's own reference, not our SUBPAY-... string.
        // Our payment_ref is stored in the purchase metadata under payment_ref / order_id.
        const paymentRef =
            data.metadata?.payment_ref ||
            data.metadata?.order_id   ||
            data.reference            ||
            data.purchase_id;

        if (!paymentRef) {
            console.error('[Subscription Webhook] No payment reference found');
            return res.status(200).json({ success: true });
        }

        console.log('[Subscription Webhook] Resolved paymentRef:', paymentRef);

        // Route by event_type — CHIP's status field is unreliable.
        // e.g. purchase.payment_failure arrives with status: 'created', not 'failed'.
        const chipEventType = data.event_type || '';
        const isSuccess     = chipEventType === 'purchase.paid' || (data.is_paid && data.payment_status === 'paid');
        const isFailure     = chipEventType === 'purchase.payment_failure' || chipEventType === 'purchase.cancelled' || chipEventType === 'purchase.overdue' || data.payment_status === 'failed' || data.payment_status === 'cancelled';

        if (isSuccess) {
            const result = await SubscriptionPaymentService.processSuccessfulPayment(
                paymentRef,
                data.transaction_id || data.purchase_id,
                webhookData
            );
            console.log('[Subscription Webhook] Payment processed:', result);
        } else if (isFailure) {
            const result = await SubscriptionPaymentService.processFailedPayment(
                paymentRef,
                data.failure_reason || chipEventType || 'Payment failed'
            );
            console.log('[Subscription Webhook] Payment failed:', result);
        } else {
            console.log('[Subscription Webhook] Unhandled event type (ignoring):', chipEventType);
        }

        // Always return 200 to prevent webhook retries
        res.status(200).json({ success: true });
    } catch (error) {
        console.error('[Subscription Webhook] Error:', error);
        res.status(200).json({ success: true }); // Return 200 even on error
    }
});

module.exports = router;
