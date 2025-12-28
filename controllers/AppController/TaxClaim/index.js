/**
 * Tax Claim Controller
 * API endpoints for managing user tax relief claims
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
const {
    getUserTaxClaims,
    getUserTaxClaimSummary,
    recalculateTaxClaims,
    getRemainingClaimable,
    addAutoClaimReliefs
} = require('../../../models/AppModel/TaxClaimServices');
const { categorizeReceiptFull } = require('../../../models/AppModel/TaxCategorizationServices');

/**
 * GET /api/tax/claims/:year
 * Get user's tax claims for a specific year
 */
router.get("/claims/:year", async (req, res) => {
    let response = DEFAULT_API_RESPONSE;
    let user = req.user || null;

    if (CHECK_EMPTY(user)) {
        response = UNAUTHORIZED_API_RESPONSE;
        response.message = ERROR_UNAUTHENTICATED;
        return res.status(response.status_code).json(response);
    }

    try {
        const taxYear = parseInt(req.params.year);

        if (isNaN(taxYear) || taxYear < 2023 || taxYear > new Date().getFullYear() + 1) {
            response = BAD_REQUEST_API_RESPONSE;
            response.message = "Invalid tax year. Must be 2023 or later.";
            return res.status(response.status_code).json(response);
        }

        const result = await getUserTaxClaims(user.account_id, taxYear);

        if (result.status) {
            response = SUCCESS_API_RESPONSE;
            response.message = "Tax claims retrieved successfully.";
            response.data = result.data;
        } else {
            response = INTERNAL_SERVER_ERROR_API_RESPONSE;
            response.message = result.error || "Failed to retrieve tax claims.";
        }

        res.status(response.status_code).json(response);
    } catch (error) {
        console.error("Error Get Tax Claims:", error);
        response = INTERNAL_SERVER_ERROR_API_RESPONSE;
        response.message = "An error occurred while retrieving tax claims.";
        res.status(response.status_code).json(response);
    }
});

/**
 * GET /api/tax/claims/:year/summary
 * Get user's tax claim summary for a specific year
 */
router.get("/claims/:year/summary", async (req, res) => {
    let response = DEFAULT_API_RESPONSE;
    let user = req.user || null;

    if (CHECK_EMPTY(user)) {
        response = UNAUTHORIZED_API_RESPONSE;
        response.message = ERROR_UNAUTHENTICATED;
        return res.status(response.status_code).json(response);
    }

    try {
        const taxYear = parseInt(req.params.year);

        if (isNaN(taxYear) || taxYear < 2023 || taxYear > new Date().getFullYear() + 1) {
            response = BAD_REQUEST_API_RESPONSE;
            response.message = "Invalid tax year. Must be 2023 or later.";
            return res.status(response.status_code).json(response);
        }

        const result = await getUserTaxClaimSummary(user.account_id, taxYear);

        if (result.status) {
            response = SUCCESS_API_RESPONSE;
            response.message = "Tax claim summary retrieved successfully.";
            response.data = result.data;
        } else {
            response = INTERNAL_SERVER_ERROR_API_RESPONSE;
            response.message = result.error || "Failed to retrieve tax claim summary.";
        }

        res.status(response.status_code).json(response);
    } catch (error) {
        console.error("Error Get Tax Claim Summary:", error);
        response = INTERNAL_SERVER_ERROR_API_RESPONSE;
        response.message = "An error occurred while retrieving tax claim summary.";
        res.status(response.status_code).json(response);
    }
});

/**
 * POST /api/tax/claims/recalculate
 * Recalculate all tax claims for a user for a specific year
 */
router.post("/claims/recalculate", async (req, res) => {
    let response = DEFAULT_API_RESPONSE;
    let user = req.user || null;

    if (CHECK_EMPTY(user)) {
        response = UNAUTHORIZED_API_RESPONSE;
        response.message = ERROR_UNAUTHENTICATED;
        return res.status(response.status_code).json(response);
    }

    try {
        const taxYear = parseInt(req.body.year) || new Date().getFullYear();

        if (taxYear < 2023 || taxYear > new Date().getFullYear() + 1) {
            response = BAD_REQUEST_API_RESPONSE;
            response.message = "Invalid tax year. Must be 2023 or later.";
            return res.status(response.status_code).json(response);
        }

        const result = await recalculateTaxClaims(user.account_id, taxYear);

        if (result.status) {
            response = SUCCESS_API_RESPONSE;
            response.message = "Tax claims recalculated successfully.";
            response.data = result.data;
        } else {
            response = INTERNAL_SERVER_ERROR_API_RESPONSE;
            response.message = result.error || "Failed to recalculate tax claims.";
        }

        res.status(response.status_code).json(response);
    } catch (error) {
        console.error("Error Recalculate Tax Claims:", error);
        response = INTERNAL_SERVER_ERROR_API_RESPONSE;
        response.message = "An error occurred while recalculating tax claims.";
        res.status(response.status_code).json(response);
    }
});

/**
 * GET /api/tax/remaining/:taxId
 * Get remaining claimable amount for a specific tax category
 */
router.get("/remaining/:taxId", async (req, res) => {
    let response = DEFAULT_API_RESPONSE;
    let user = req.user || null;

    if (CHECK_EMPTY(user)) {
        response = UNAUTHORIZED_API_RESPONSE;
        response.message = ERROR_UNAUTHENTICATED;
        return res.status(response.status_code).json(response);
    }

    try {
        const taxId = parseInt(req.params.taxId);
        const taxYear = parseInt(req.query.year) || new Date().getFullYear();

        if (isNaN(taxId)) {
            response = BAD_REQUEST_API_RESPONSE;
            response.message = "Invalid tax category ID.";
            return res.status(response.status_code).json(response);
        }

        const result = await getRemainingClaimable(user.account_id, taxId, taxYear);

        response = SUCCESS_API_RESPONSE;
        response.message = "Remaining claimable amount retrieved successfully.";
        response.data = result;

        res.status(response.status_code).json(response);
    } catch (error) {
        console.error("Error Get Remaining Claimable:", error);
        response = INTERNAL_SERVER_ERROR_API_RESPONSE;
        response.message = "An error occurred while retrieving remaining claimable amount.";
        res.status(response.status_code).json(response);
    }
});

/**
 * POST /api/tax/categorize
 * Auto-categorize receipt data to tax category
 * Body: { receipt_data: { MerchantName, Items, Total, ... } }
 */
router.post("/categorize", async (req, res) => {
    let response = DEFAULT_API_RESPONSE;
    let user = req.user || null;

    if (CHECK_EMPTY(user)) {
        response = UNAUTHORIZED_API_RESPONSE;
        response.message = ERROR_UNAUTHENTICATED;
        return res.status(response.status_code).json(response);
    }

    try {
        const receiptData = req.body.receipt_data;
        const taxYear = parseInt(req.body.year) || new Date().getFullYear();

        if (CHECK_EMPTY(receiptData)) {
            response = BAD_REQUEST_API_RESPONSE;
            response.message = "Receipt data is required.";
            return res.status(response.status_code).json(response);
        }

        const result = await categorizeReceiptFull(receiptData, taxYear);

        response = SUCCESS_API_RESPONSE;
        response.message = result.success 
            ? "Receipt categorized successfully." 
            : "Unable to auto-categorize. Please select manually.";
        response.data = result;

        res.status(response.status_code).json(response);
    } catch (error) {
        console.error("Error Categorize Receipt:", error);
        response = INTERNAL_SERVER_ERROR_API_RESPONSE;
        response.message = "An error occurred while categorizing receipt.";
        res.status(response.status_code).json(response);
    }
});

/**
 * POST /api/tax/init/:year
 * Initialize tax claims for a year (adds auto-claim reliefs)
 */
router.post("/init/:year", async (req, res) => {
    let response = DEFAULT_API_RESPONSE;
    let user = req.user || null;

    if (CHECK_EMPTY(user)) {
        response = UNAUTHORIZED_API_RESPONSE;
        response.message = ERROR_UNAUTHENTICATED;
        return res.status(response.status_code).json(response);
    }

    try {
        const taxYear = parseInt(req.params.year);

        if (isNaN(taxYear) || taxYear < 2023 || taxYear > new Date().getFullYear() + 1) {
            response = BAD_REQUEST_API_RESPONSE;
            response.message = "Invalid tax year. Must be 2023 or later.";
            return res.status(response.status_code).json(response);
        }

        await addAutoClaimReliefs(user.account_id, taxYear);

        // Get updated summary
        const summary = await getUserTaxClaimSummary(user.account_id, taxYear);

        response = SUCCESS_API_RESPONSE;
        response.message = "Tax claims initialized successfully.";
        response.data = summary.data;

        res.status(response.status_code).json(response);
    } catch (error) {
        console.error("Error Init Tax Claims:", error);
        response = INTERNAL_SERVER_ERROR_API_RESPONSE;
        response.message = "An error occurred while initializing tax claims.";
        res.status(response.status_code).json(response);
    }
});

module.exports = router;