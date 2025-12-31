/**
 * Credit Controller
 * API endpoints for credit management
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

const CreditService         = require('../../../models/AppModel/CreditService');
const PaymentOrderService   = require('../../../models/AppModel/PaymentOrderService');
const ChipPaymentService    = require('../../../services/ChipPaymentService');

// ============================================================================
// CREDIT BALANCE & INFO
// ============================================================================

/**
 * GET /api/credit/balance
 * Get user's credit balance and summary
 */
router.get("/balance", async (req, res) => {
    let response = DEFAULT_API_RESPONSE;
    let user = req.user || null;

    if (CHECK_EMPTY(user)) {
        response = UNAUTHORIZED_API_RESPONSE;
        response.message = ERROR_UNAUTHENTICATED;
        return res.status(response.status_code).json(response);
    }

    try {
        const result = await CreditService.getCreditBalance(user.account_id);

        if (!result.success) {
            response = INTERNAL_SERVER_ERROR_API_RESPONSE;
            response.message = result.error;
            return res.status(response.status_code).json(response);
        }

        response = SUCCESS_API_RESPONSE;
        response.message = "Credit balance retrieved successfully.";
        response.data = result.data;

        res.status(response.status_code).json(response);
    } catch (error) {
        console.error("Error Get Credit Balance:", error);
        response = INTERNAL_SERVER_ERROR_API_RESPONSE;
        response.message = "An error occurred while retrieving credit balance.";
        res.status(response.status_code).json(response);
    }
});

/**
 * GET /api/credit/check/:amount
 * Check if user has enough credits
 */
router.get("/check/:amount", async (req, res) => {
    let response = DEFAULT_API_RESPONSE;
    let user = req.user || null;

    if (CHECK_EMPTY(user)) {
        response = UNAUTHORIZED_API_RESPONSE;
        response.message = ERROR_UNAUTHENTICATED;
        return res.status(response.status_code).json(response);
    }

    try {
        const amount = parseInt(req.params.amount);

        if (isNaN(amount) || amount <= 0) {
            response = BAD_REQUEST_API_RESPONSE;
            response.message = "Invalid credit amount.";
            return res.status(response.status_code).json(response);
        }

        const result = await CreditService.hasEnoughCredits(user.account_id, amount);

        response = SUCCESS_API_RESPONSE;
        response.message = result.hasEnough ? "Sufficient credits available." : "Insufficient credits.";
        response.data = result;

        res.status(response.status_code).json(response);
    } catch (error) {
        console.error("Error Check Credits:", error);
        response = INTERNAL_SERVER_ERROR_API_RESPONSE;
        response.message = "An error occurred while checking credits.";
        res.status(response.status_code).json(response);
    }
});

/**
 * GET /api/credit/batches
 * Get user's credit batches (with expiry info)
 */
router.get("/batches", async (req, res) => {
    let response = DEFAULT_API_RESPONSE;
    let user = req.user || null;

    if (CHECK_EMPTY(user)) {
        response = UNAUTHORIZED_API_RESPONSE;
        response.message = ERROR_UNAUTHENTICATED;
        return res.status(response.status_code).json(response);
    }

    try {
        const result = await CreditService.getCreditBatches(user.account_id);

        if (!result.success) {
            response = INTERNAL_SERVER_ERROR_API_RESPONSE;
            response.message = result.error;
            return res.status(response.status_code).json(response);
        }

        response = SUCCESS_API_RESPONSE;
        response.message = "Credit batches retrieved successfully.";
        response.data = result.data;

        res.status(response.status_code).json(response);
    } catch (error) {
        console.error("Error Get Credit Batches:", error);
        response = INTERNAL_SERVER_ERROR_API_RESPONSE;
        response.message = "An error occurred while retrieving credit batches.";
        res.status(response.status_code).json(response);
    }
});

/**
 * GET /api/credit/history
 * Get user's credit transaction history
 */
router.get("/history", async (req, res) => {
    let response = DEFAULT_API_RESPONSE;
    let user = req.user || null;

    if (CHECK_EMPTY(user)) {
        response = UNAUTHORIZED_API_RESPONSE;
        response.message = ERROR_UNAUTHENTICATED;
        return res.status(response.status_code).json(response);
    }

    try {
        const limit = parseInt(req.query.limit) || 20;
        const offset = parseInt(req.query.offset) || 0;
        const type = req.query.type || null;

        const result = await CreditService.getTransactionHistory(user.account_id, { limit, offset, type });

        if (!result.success) {
            response = INTERNAL_SERVER_ERROR_API_RESPONSE;
            response.message = result.error;
            return res.status(response.status_code).json(response);
        }

        response = SUCCESS_API_RESPONSE;
        response.message = "Transaction history retrieved successfully.";
        response.data = result.data;

        res.status(response.status_code).json(response);
    } catch (error) {
        console.error("Error Get Transaction History:", error);
        response = INTERNAL_SERVER_ERROR_API_RESPONSE;
        response.message = "An error occurred while retrieving transaction history.";
        res.status(response.status_code).json(response);
    }
});

// ============================================================================
// PACKAGES & RATES
// ============================================================================

/**
 * GET /api/credit/packages
 * Get available credit packages
 */
router.get("/packages", async (req, res) => {
    let response = DEFAULT_API_RESPONSE;

    try {
        const result = await CreditService.getCreditPackages(true);

        if (!result.success) {
            response = INTERNAL_SERVER_ERROR_API_RESPONSE;
            response.message = result.error;
            return res.status(response.status_code).json(response);
        }

        response = SUCCESS_API_RESPONSE;
        response.message = "Credit packages retrieved successfully.";
        response.data = result.data;

        res.status(response.status_code).json(response);
    } catch (error) {
        console.error("Error Get Credit Packages:", error);
        response = INTERNAL_SERVER_ERROR_API_RESPONSE;
        response.message = "An error occurred while retrieving credit packages.";
        res.status(response.status_code).json(response);
    }
});

/**
 * GET /api/credit/packages/:id
 * Get specific package details
 */
router.get("/packages/:id", async (req, res) => {
    let response = DEFAULT_API_RESPONSE;

    try {
        const packageId = parseInt(req.params.id);

        if (isNaN(packageId)) {
            response = BAD_REQUEST_API_RESPONSE;
            response.message = "Invalid package ID.";
            return res.status(response.status_code).json(response);
        }

        const result = await CreditService.getPackageById(packageId);

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
        console.error("Error Get Package:", error);
        response = INTERNAL_SERVER_ERROR_API_RESPONSE;
        response.message = "An error occurred while retrieving package details.";
        res.status(response.status_code).json(response);
    }
});

/**
 * GET /api/credit/rates
 * Get credit usage rates
 */
router.get("/rates", async (req, res) => {
    let response = DEFAULT_API_RESPONSE;

    try {
        const result = await CreditService.getAllUsageRates();

        if (!result.success) {
            response = INTERNAL_SERVER_ERROR_API_RESPONSE;
            response.message = result.error;
            return res.status(response.status_code).json(response);
        }

        response = SUCCESS_API_RESPONSE;
        response.message = "Usage rates retrieved successfully.";
        response.data = result.data;

        res.status(response.status_code).json(response);
    } catch (error) {
        console.error("Error Get Usage Rates:", error);
        response = INTERNAL_SERVER_ERROR_API_RESPONSE;
        response.message = "An error occurred while retrieving usage rates.";
        res.status(response.status_code).json(response);
    }
});

// ============================================================================
// PURCHASE CREDITS
// ============================================================================

/**
 * POST /api/credit/purchase
 * Create a payment order to purchase credits
 * Body: { package_id, success_url, failure_url }
 */
router.post("/purchase", async (req, res) => {
    let response = DEFAULT_API_RESPONSE;
    let user = req.user || null;

    if (CHECK_EMPTY(user)) {
        response = UNAUTHORIZED_API_RESPONSE;
        response.message = ERROR_UNAUTHENTICATED;
        return res.status(response.status_code).json(response);
    }

    try {
        const { package_id, success_url, failure_url } = req.body;

        if (!package_id) {
            response = BAD_REQUEST_API_RESPONSE;
            response.message = "Package ID is required.";
            return res.status(response.status_code).json(response);
        }

        // Get callback URL from environment or use default
        const callbackUrl = process.env.CHIP_CALLBACK_URL || `${process.env.API_BASE_URL}/api/credit/webhook`;

        const result = await PaymentOrderService.createOrder({
            accountId: user.account_id,
            packageId: parseInt(package_id),
            customerEmail: user.account_email,
            customerName: user.account_fullname || user.account_name,
            customerPhone: user.account_contact,
            successUrl: success_url || `${process.env.APP_URL}/payment/success`,
            failureUrl: failure_url || `${process.env.APP_URL}/payment/failed`,
            callbackUrl
        });

        if (!result.success) {
            response = BAD_REQUEST_API_RESPONSE;
            response.message = result.error;
            return res.status(response.status_code).json(response);
        }

        response = SUCCESS_API_RESPONSE;
        response.message = "Payment order created successfully.";
        response.data = result.data;

        res.status(response.status_code).json(response);
    } catch (error) {
        console.error("Error Create Purchase Order:", error);
        response = INTERNAL_SERVER_ERROR_API_RESPONSE;
        response.message = "An error occurred while creating purchase order.";
        res.status(response.status_code).json(response);
    }
});

/**
 * GET /api/credit/orders
 * Get user's order history
 */
router.get("/orders", async (req, res) => {
    let response = DEFAULT_API_RESPONSE;
    let user = req.user || null;

    if (CHECK_EMPTY(user)) {
        response = UNAUTHORIZED_API_RESPONSE;
        response.message = ERROR_UNAUTHENTICATED;
        return res.status(response.status_code).json(response);
    }

    try {
        const limit = parseInt(req.query.limit) || 20;
        const offset = parseInt(req.query.offset) || 0;
        const status = req.query.status || null;

        const result = await PaymentOrderService.getUserOrders(user.account_id, { limit, offset, status });

        if (!result.success) {
            response = INTERNAL_SERVER_ERROR_API_RESPONSE;
            response.message = result.error;
            return res.status(response.status_code).json(response);
        }

        response = SUCCESS_API_RESPONSE;
        response.message = "Orders retrieved successfully.";
        response.data = result.data;

        res.status(response.status_code).json(response);
    } catch (error) {
        console.error("Error Get Orders:", error);
        response = INTERNAL_SERVER_ERROR_API_RESPONSE;
        response.message = "An error occurred while retrieving orders.";
        res.status(response.status_code).json(response);
    }
});

/**
 * GET /api/credit/orders/:uuid
 * Get specific order details
 */
router.get("/orders/:uuid", async (req, res) => {
    let response = DEFAULT_API_RESPONSE;
    let user = req.user || null;

    if (CHECK_EMPTY(user)) {
        response = UNAUTHORIZED_API_RESPONSE;
        response.message = ERROR_UNAUTHENTICATED;
        return res.status(response.status_code).json(response);
    }

    try {
        const orderUuid = req.params.uuid;

        const result = await PaymentOrderService.getOrderByUuid(orderUuid);

        if (!result.success) {
            response = NOT_FOUND_API_RESPONSE;
            response.message = result.error;
            return res.status(response.status_code).json(response);
        }

        // Verify ownership
        if (result.data.account_id !== user.account_id) {
            response = UNAUTHORIZED_API_RESPONSE;
            response.message = "Access denied.";
            return res.status(response.status_code).json(response);
        }

        response = SUCCESS_API_RESPONSE;
        response.message = "Order retrieved successfully.";
        response.data = result.data;

        res.status(response.status_code).json(response);
    } catch (error) {
        console.error("Error Get Order:", error);
        response = INTERNAL_SERVER_ERROR_API_RESPONSE;
        response.message = "An error occurred while retrieving order.";
        res.status(response.status_code).json(response);
    }
});

/**
 * GET /api/credit/orders/:uuid/status
 * Check order payment status
 */
router.get("/orders/:uuid/status", async (req, res) => {
    let response = DEFAULT_API_RESPONSE;
    let user = req.user || null;

    if (CHECK_EMPTY(user)) {
        response = UNAUTHORIZED_API_RESPONSE;
        response.message = ERROR_UNAUTHENTICATED;
        return res.status(response.status_code).json(response);
    }

    try {
        const orderUuid = req.params.uuid;

        // First verify ownership
        const order = await PaymentOrderService.getOrderByUuid(orderUuid);
        if (!order.success || order.data.account_id !== user.account_id) {
            response = NOT_FOUND_API_RESPONSE;
            response.message = "Order not found.";
            return res.status(response.status_code).json(response);
        }

        const result = await PaymentOrderService.checkOrderStatus(orderUuid);

        if (!result.success) {
            response = INTERNAL_SERVER_ERROR_API_RESPONSE;
            response.message = result.error;
            return res.status(response.status_code).json(response);
        }

        response = SUCCESS_API_RESPONSE;
        response.message = "Order status retrieved successfully.";
        response.data = result.data;

        res.status(response.status_code).json(response);
    } catch (error) {
        console.error("Error Check Order Status:", error);
        response = INTERNAL_SERVER_ERROR_API_RESPONSE;
        response.message = "An error occurred while checking order status.";
        res.status(response.status_code).json(response);
    }
});

/**
 * POST /api/credit/orders/:uuid/cancel
 * Cancel a pending order
 */
router.post("/orders/:uuid/cancel", async (req, res) => {
    let response = DEFAULT_API_RESPONSE;
    let user = req.user || null;

    if (CHECK_EMPTY(user)) {
        response = UNAUTHORIZED_API_RESPONSE;
        response.message = ERROR_UNAUTHENTICATED;
        return res.status(response.status_code).json(response);
    }

    try {
        const orderUuid = req.params.uuid;

        const result = await PaymentOrderService.cancelOrder(orderUuid, user.account_id);

        if (!result.success) {
            response = BAD_REQUEST_API_RESPONSE;
            response.message = result.error;
            return res.status(response.status_code).json(response);
        }

        response = SUCCESS_API_RESPONSE;
        response.message = result.message;

        res.status(response.status_code).json(response);
    } catch (error) {
        console.error("Error Cancel Order:", error);
        response = INTERNAL_SERVER_ERROR_API_RESPONSE;
        response.message = "An error occurred while cancelling order.";
        res.status(response.status_code).json(response);
    }
});

// ============================================================================
// USE CREDITS (Internal)
// ============================================================================

/**
 * POST /api/credit/use
 * Use credits for a feature (typically called internally)
 * Body: { rate_code, reference_type, reference_id }
 */
router.post("/use", async (req, res) => {
    let response = DEFAULT_API_RESPONSE;
    let user = req.user || null;

    if (CHECK_EMPTY(user)) {
        response = UNAUTHORIZED_API_RESPONSE;
        response.message = ERROR_UNAUTHENTICATED;
        return res.status(response.status_code).json(response);
    }

    try {
        const { rate_code, reference_type, reference_id } = req.body;

        if (!rate_code) {
            response = BAD_REQUEST_API_RESPONSE;
            response.message = "Rate code is required.";
            return res.status(response.status_code).json(response);
        }

        const result = await CreditService.checkAndUseCredits(
            user.account_id,
            rate_code,
            reference_type,
            reference_id
        );

        if (!result.success) {
            response = BAD_REQUEST_API_RESPONSE;
            response.message = result.error;
            response.data = result.data;
            return res.status(response.status_code).json(response);
        }

        response = SUCCESS_API_RESPONSE;
        response.message = "Credits used successfully.";
        response.data = result.data;

        res.status(response.status_code).json(response);
    } catch (error) {
        console.error("Error Use Credits:", error);
        response = INTERNAL_SERVER_ERROR_API_RESPONSE;
        response.message = "An error occurred while using credits.";
        res.status(response.status_code).json(response);
    }
});

module.exports = router;
