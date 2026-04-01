/**
 * File Uploader Controller (Updated)
 * Includes auto-categorization for tax relief
 * Requires authentication and active subscription
 */

const express = require('express');
const router = express.Router();
const { upload, getFileUrl } = require('../../configs/fileUpload');
const {
    DEFAULT_API_RESPONSE,
    INTERNAL_SERVER_ERROR_API_RESPONSE,
    BAD_REQUEST_API_RESPONSE,
    SUCCESS_API_RESPONSE,
    UNAUTHORIZED_API_RESPONSE,
    FORBIDDEN_API_RESPONSE,
    ERROR_UNAUTHENTICATED,
    CHECK_EMPTY
} = require('../../configs/helper');
const { auth } = require('../../configs/auth');
const ExtractReceipt = require('./ExtractReceipt');
const { categorizeReceiptFull } = require('../../models/AppModel/TaxCategorizationServices');
const { checkSubscriptionAccess } = require('../../models/AppModel/SubscriptionService');
const { canUploadReceipt, recordReceiptUpload } = require('../../models/AppModel/ReceiptUsageService');

/**
 * Middleware to check if user has active subscription
 */
const checkSubscription = async (req, res, next) => {
    try {
        const user = req.user;
        
        if (CHECK_EMPTY(user)) {
            const response = UNAUTHORIZED_API_RESPONSE;
            response.message = ERROR_UNAUTHENTICATED;
            return res.status(response.status_code).json(response);
        }

        // Check subscription access
        const accessResult = await checkSubscriptionAccess(user.account_id);
        
        if (!accessResult.success) {
            const response = INTERNAL_SERVER_ERROR_API_RESPONSE;
            response.message = "Failed to verify subscription status.";
            return res.status(response.status_code).json(response);
        }

        if (!accessResult.has_access) {
            const response = FORBIDDEN_API_RESPONSE;
            response.message = "Active subscription required. Please subscribe to access this feature.";
            response.data = {
                subscription_status: accessResult.subscription_status,
                has_access: false,
                message: "Your subscription is not active. Please renew or subscribe to continue."
            };
            return res.status(response.status_code).json(response);
        }

        // Attach subscription info to request for potential use
        req.subscription = {
            has_access: accessResult.has_access,
            status: accessResult.subscription_status,
            features: accessResult.features
        };

        next();
    } catch (error) {
        console.error("Subscription check error:", error);
        const response = INTERNAL_SERVER_ERROR_API_RESPONSE;
        response.message = "An error occurred while checking subscription.";
        return res.status(response.status_code).json(response);
    }
};

/**
 * Middleware to check upload limits
 * Validates if user can upload based on subscription tier and usage limits
 */
const checkUploadLimit = async (req, res, next) => {
    try {
        const user = req.user;
        
        if (CHECK_EMPTY(user)) {
            const response = UNAUTHORIZED_API_RESPONSE;
            response.message = ERROR_UNAUTHENTICATED;
            return res.status(response.status_code).json(response);
        }

        // Check if user can upload
        const uploadCheck = await canUploadReceipt(user.account_id);
        
        if (!uploadCheck.success) {
            const response = INTERNAL_SERVER_ERROR_API_RESPONSE;
            response.message = "Failed to check upload limits.";
            return res.status(response.status_code).json(response);
        }

        if (!uploadCheck.can_upload) {
            const response = FORBIDDEN_API_RESPONSE;
            response.message = uploadCheck.message;
            response.data = {
                can_upload: false,
                reason: uploadCheck.reason,
                usage: uploadCheck.usage,
                upgrade_message: "Upgrade to premium for unlimited uploads and advanced features."
            };
            return res.status(response.status_code).json(response);
        }

        // Attach upload info to request
        req.uploadInfo = {
            can_upload: true,
            reason: uploadCheck.reason,
            usage: uploadCheck.usage
        };

        next();
    } catch (error) {
        console.error("Upload limit check error:", error);
        const response = INTERNAL_SERVER_ERROR_API_RESPONSE;
        response.message = "An error occurred while checking upload limits.";
        return res.status(response.status_code).json(response);
    }
};

/**
 * POST /file-uploader
 * Upload single or multiple files
 * Requires authentication and active subscription
 */
router.post("/", auth(), checkSubscription, checkUploadLimit, upload.array('files', 10), async (req, res) => {
    let response = DEFAULT_API_RESPONSE;

    try {
        const files = req.files;
        const user = req.user;

        if (!files || files.length === 0) {
            response = BAD_REQUEST_API_RESPONSE;
            response.message = "Error. No files uploaded.";
            return res.status(response.status_code).json(response);
        }

        console.log("File Upload Request - Files: ", files.length);

        const uploadedFiles = files.map(file => {
            const fileUrl = getFileUrl(file.path);

            return {
                filename: file.filename,
                original_name: file.originalname,
                mimetype: file.mimetype,
                size: file.size,
                path: file.path,
                url: fileUrl
            };
        });

        response = SUCCESS_API_RESPONSE;
        response.message = `${files.length} file(s) uploaded successfully.`;
        response.data = {
            files: uploadedFiles,
            count: files.length,
            usage_info: req.uploadInfo.usage
        };

        // Record the upload
        const usedFreeReceipt = req.uploadInfo.reason === 'free_receipt';
        await recordReceiptUpload(user.account_id, usedFreeReceipt);

        res.status(response.status_code).json(response);

    } catch (error) {
        console.log("Error File Upload: ", error);
        response = INTERNAL_SERVER_ERROR_API_RESPONSE;
        response.message = error.message || "Error. An error occurred while uploading files.";
        res.status(response.status_code).json(response);
    }
});

/**
 * POST /file-uploader/single
 * Upload single file with OCR extraction
 * Requires authentication and active subscription
 */
router.post("/single", auth(), checkSubscription, checkUploadLimit, upload.single('file'), async (req, res) => {
    let response = DEFAULT_API_RESPONSE;

    try {
        const file = req.file;
        const user = req.user;

        if (!file) {
            response = BAD_REQUEST_API_RESPONSE;
            response.message = "Error. No file uploaded.";
            return res.status(response.status_code).json(response);
        }

        console.log("Single File Upload Request - File: ", file.originalname);

        const fileUrl = getFileUrl(file.path);

        response = SUCCESS_API_RESPONSE;
        response.message = "File uploaded successfully.";
        response.data = {
            filename: file.filename,
            original_name: file.originalname,
            mimetype: file.mimetype,
            size: file.size,
            path: file.path,
            url: fileUrl,
            usage_info: req.uploadInfo.usage
        };

        // Extract receipt data using Azure Document Intelligence
        let extractedReceipt = null;
        try {
            extractedReceipt = await ExtractReceipt(fileUrl);
        } catch (extractError) {
            console.log("Receipt extraction error:", extractError);
            // Continue without extraction - user can enter manually
        }

        // Record the upload
        const usedFreeReceipt = req.uploadInfo.reason === 'free_receipt';
        await recordReceiptUpload(user.account_id, usedFreeReceipt);

        res.status(response.status_code).json({
            file_image: response.data,
            receipt: extractedReceipt
        });

    } catch (error) {
        console.log("Error Single File Upload: ", error);
        response = INTERNAL_SERVER_ERROR_API_RESPONSE;
        response.message = error.message || "Error. An error occurred while uploading file.";
        res.status(response.status_code).json(response);
    }
});

/**
 * POST /file-uploader/receipt
 * Upload receipt with OCR extraction AND auto-categorization
 * This is the new endpoint for full receipt processing
 * Requires authentication and active subscription
 */
// router.post("/receipt", auth(), checkSubscription, checkUploadLimit, upload.single('file'), async (req, res) => {
router.post("/receipt", auth(), checkUploadLimit, upload.single('file'), async (req, res) => {
    let response = DEFAULT_API_RESPONSE;

    try {
        const file = req.file;
        const user = req.user;
        const taxYear = parseInt(req.body.year) || new Date().getFullYear();

        if (!file) {
            response = BAD_REQUEST_API_RESPONSE;
            response.message = "Error. No file uploaded.";
            return res.status(response.status_code).json(response);
        }

        console.log("Receipt Upload Request - File:", file.originalname, "Year:", taxYear);

        const fileUrl = getFileUrl(file.path);

        // Step 1: Upload file info
        const fileInfo = {
            filename: file.filename,
            original_name: file.originalname,
            mimetype: file.mimetype,
            size: file.size,
            path: file.path,
            url: fileUrl
        };

        // Step 2: Extract receipt data using Azure Document Intelligence
        let extractedReceipt = null;
        let extractionError = null;
        
        try {
            extractedReceipt = await ExtractReceipt(fileUrl);
            console.log("Receipt extracted successfully:", extractedReceipt?.MerchantName?.content);
        } catch (extractError) {
            console.log("Receipt extraction error:", extractError.message);
            extractionError = extractError.message;
        }

        // Step 3: Auto-categorize receipt to tax relief category
        let categorization = null;
        
        if (extractedReceipt) {
            try {
                categorization = await categorizeReceiptFull(extractedReceipt, taxYear);
                console.log("Receipt categorized:", categorization.tax_code, "Confidence:", categorization.confidence);
            } catch (catError) {
                console.log("Categorization error:", catError.message);
            }
        }

        // Step 4: Build response
        response = SUCCESS_API_RESPONSE;
        response.message = "Receipt processed successfully.";
        response.data = {
            file: fileInfo,
            receipt: extractedReceipt ? {
                merchant_name: extractedReceipt.MerchantName?.content || null,
                merchant_address: extractedReceipt.MerchantAddress?.content || null,
                merchant_phone: extractedReceipt.MerchantPhoneNumber?.content || null,
                total: extractedReceipt.Total?.content || null,
                transaction_date: extractedReceipt.TransactionDate?.content || null,
                transaction_time: extractedReceipt.TransactionTime?.content || null,
                receipt_type: extractedReceipt.ReceiptType?.content || null,
                items: extractedReceipt.Items?.values?.map(item => ({
                    description: item.description || "",
                    quantity: item.quantity || 1,
                    price: item.price || 0.00,
                    total_price: item.total_price || 0.00
                })) || [],
                raw_data: extractedReceipt
            } : null,
            extraction_error: extractionError,
            categorization: categorization ? {
                success: categorization.success,
                tax_code: categorization.tax_code,
                tax_id: categorization.tax_id || null,
                tax_title: categorization.tax_title || null,
                tax_max_claim: categorization.tax_max_claim || null,
                subcategory_code: categorization.subcategory_code,
                taxsub_id: categorization.taxsub_id || null,
                taxsub_title: categorization.taxsub_title || null,
                taxsub_max_claim: categorization.taxsub_max_claim || null,
                confidence: categorization.confidence,
                matched_keywords: categorization.matched_keywords,
                suggestions: categorization.suggestions || [],
                message: categorization.message
            } : {
                success: false,
                message: "Unable to categorize. Please select tax category manually."
            },
            tax_year: taxYear,
            usage_info: req.uploadInfo.usage
        };

        // Record the upload
        const usedFreeReceipt = req.uploadInfo.reason === 'free_receipt';
        await recordReceiptUpload(user.account_id, usedFreeReceipt);

        res.status(response.status_code).json(response);

    } catch (error) {
        console.log("Error Receipt Upload: ", error);
        response = INTERNAL_SERVER_ERROR_API_RESPONSE;
        response.message = error.message || "Error. An error occurred while processing receipt.";
        res.status(response.status_code).json(response);
    }
});

/**
 * POST /file-uploader/categorize
 * Categorize existing receipt data (without file upload)
 * Useful for re-categorizing or manual testing
 * Requires authentication and active subscription
 * Note: This doesn't count against upload limits since no Azure OCR is used
 */
router.post("/categorize", auth(), checkSubscription, async (req, res) => {
    let response = DEFAULT_API_RESPONSE;

    try {
        const receiptData = req.body.receipt_data;
        const taxYear = parseInt(req.body.year) || new Date().getFullYear();

        if (!receiptData) {
            response = BAD_REQUEST_API_RESPONSE;
            response.message = "Error. Receipt data is required.";
            return res.status(response.status_code).json(response);
        }

        // Auto-categorize
        const categorization = await categorizeReceiptFull(receiptData, taxYear);

        response = SUCCESS_API_RESPONSE;
        response.message = categorization.success 
            ? "Receipt categorized successfully." 
            : "Unable to auto-categorize. Please select manually.";
        response.data = {
            categorization: categorization,
            tax_year: taxYear
        };

        res.status(response.status_code).json(response);

    } catch (error) {
        console.log("Error Categorize Receipt: ", error);
        response = INTERNAL_SERVER_ERROR_API_RESPONSE;
        response.message = error.message || "Error. An error occurred while categorizing receipt.";
        res.status(response.status_code).json(response);
    }
});

/**
 * GET /file-uploader/usage
 * Get user's upload usage statistics
 * Shows daily/monthly limits, free receipts remaining, etc.
 */
router.get("/usage", auth(), async (req, res) => {
    let response = DEFAULT_API_RESPONSE;
    const user = req.user;

    try {
        if (CHECK_EMPTY(user)) {
            response = UNAUTHORIZED_API_RESPONSE;
            response.message = ERROR_UNAUTHENTICATED;
            return res.status(response.status_code).json(response);
        }

        const { getUsageStatistics } = require('../../models/AppModel/ReceiptUsageService');
        const usageResult = await getUsageStatistics(user.account_id);

        if (!usageResult.success) {
            response = INTERNAL_SERVER_ERROR_API_RESPONSE;
            response.message = "Failed to retrieve usage statistics.";
            return res.status(response.status_code).json(response);
        }

        response = SUCCESS_API_RESPONSE;
        response.message = "Usage statistics retrieved successfully.";
        response.data = usageResult.data;

        res.status(response.status_code).json(response);

    } catch (error) {
        console.log("Error Get Usage Statistics: ", error);
        response = INTERNAL_SERVER_ERROR_API_RESPONSE;
        response.message = error.message || "Error. An error occurred while retrieving usage statistics.";
        res.status(response.status_code).json(response);
    }
});

module.exports = router;