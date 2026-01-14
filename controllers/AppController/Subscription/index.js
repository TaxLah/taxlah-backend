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
const { auth } = require('../../../configs/auth');

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

/**
 * GET /api/subscription/my-subscription
 * Get user's current active subscription
 */
router.get("/my-subscription", auth(), async (req, res) => {
    let response = DEFAULT_API_RESPONSE;
    let user = req.user || null;

    if (CHECK_EMPTY(user)) {
        response = UNAUTHORIZED_API_RESPONSE;
        response.message = ERROR_UNAUTHENTICATED;
        return res.status(response.status_code).json(response);
    }

    try {
        const result = await SubscriptionService.getActiveSubscription(user.account_id);

        if (!result.success) {
            response = INTERNAL_SERVER_ERROR_API_RESPONSE;
            response.message = result.error;
            return res.status(response.status_code).json(response);
        }

        response = SUCCESS_API_RESPONSE;
        response.message = result.has_subscription 
            ? "Active subscription found." 
            : "No active subscription.";
        response.data = result.data;
        response.has_subscription = result.has_subscription;

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
        const hasTrial = pkg.trial_days > 0;

        // Try to create subscription (will only create if trial, otherwise returns requires_payment)
        const subResult = await SubscriptionService.createSubscription(
            user.account_id,
            package_id,
            payment_method || 'Chip'
        );

        if (!subResult.success) {
            response = BAD_REQUEST_API_RESPONSE;
            response.message = subResult.error;
            return res.status(response.status_code).json(response);
        }

        // Check if payment is required (non-trial packages)
        if (subResult.requires_payment) {
            // Calculate period dates for payment record
            const now = new Date();
            const periodEnd = new Date(now);
            
            if (pkg.billing_period === 'Monthly') {
                periodEnd.setMonth(periodEnd.getMonth() + 1);
            } else {
                periodEnd.setFullYear(periodEnd.getFullYear() + 1);
            }

            // Create payment record WITHOUT subscription_id (will be added after payment succeeds)
            const paymentResult = await SubscriptionPaymentService.createPaymentRecord(
                null, // subscription_id is null - will be created after payment
                user.account_id,
                pkg.price_amount,
                now,
                periodEnd,
                payment_method || 'Chip'
            );

            if (!paymentResult.success) {
                response = INTERNAL_SERVER_ERROR_API_RESPONSE;
                response.message = "Failed to create payment record.";
                return res.status(response.status_code).json(response);
            }

            // Store package_id in payment metadata for later subscription creation
            const updateMetadataSql = `
                UPDATE subscription_payment
                SET gateway_response = ?
                WHERE payment_ref = ?
            `;
            await require('../../../utils/sqlbuilder').raw(updateMetadataSql, [
                JSON.stringify({ package_id: package_id }),
                paymentResult.data.payment_ref
            ]);

            // Create payment gateway URL
            const paymentGatewayResult = await ChipPaymentService.createSubscriptionPayment({
                payment_ref: paymentResult.data.payment_ref,
                account_id: user.account_id,
                amount: pkg.price_amount,
                description: `${pkg.package_name} - ${pkg.billing_period} Subscription`,
                customer_email: user.account_email || '',
                customer_name: user.account_name || user.account_fullname || ''
            });

            if (!paymentGatewayResult.success) {
                response = INTERNAL_SERVER_ERROR_API_RESPONSE;
                response.message = "Failed to create payment gateway URL.";
                return res.status(response.status_code).json(response);
            }

            response = SUCCESS_API_RESPONSE;
            response.message = "Please complete payment to activate subscription.";
            response.data = {
                package_name: pkg.package_name,
                amount: pkg.price_amount,
                billing_period: pkg.billing_period,
                payment_url: paymentGatewayResult.data.payment_url,
                payment_ref: paymentResult.data.payment_ref
            };
        } else {
            // Trial subscription - created immediately
            const subscription = subResult.data;
            
            response = SUCCESS_API_RESPONSE;
            response.message = "Subscription activated with trial period.";
            response.data = {
                subscription_id: subscription.subscription_id,
                subscription_ref: subscription.subscription_ref,
                status: 'Trial',
                trial_end_date: subscription.trial_end_date,
                current_period_end: subscription.current_period_end
            };
        }

        res.status(response.status_code).json(response);
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

        console.log('=== SUBSCRIPTION WEBHOOK ===');
        console.log('Event Type:', data.event_type);
        console.log('Purchase ID:', data.purchase_id);
        console.log('Status:', data.payment_status);
        console.log('Reference:', data.reference);
        console.log('Is Paid:', data.is_paid);
        console.log('============================');

        // Get payment reference from purchase_id or reference
        const paymentRef = data.purchase_id || data.reference;

        if (!paymentRef) {
            console.error('[Subscription Webhook] No payment reference found');
            return res.status(200).json({ success: true });
        }

        // Handle based on payment status
        if (data.is_paid && data.payment_status === 'paid') {
            // Process successful payment
            const result = await SubscriptionPaymentService.processSuccessfulPayment(
                paymentRef,
                data.transaction_id || data.id,
                webhookData
            );

            console.log('[Subscription Webhook] Payment processed:', result);
        } else if (data.payment_status === 'failed' || data.payment_status === 'cancelled') {
            // Process failed payment
            const result = await SubscriptionPaymentService.processFailedPayment(
                paymentRef,
                data.failure_reason || 'Payment failed'
            );

            console.log('[Subscription Webhook] Payment failed:', result);
        }

        // Always return 200 to prevent webhook retries
        res.status(200).json({ success: true });
    } catch (error) {
        console.error('[Subscription Webhook] Error:', error);
        res.status(200).json({ success: true }); // Return 200 even on error
    }
});

module.exports = router;
