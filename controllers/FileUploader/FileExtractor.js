/**
 * File Uploader Controller (Updated)
 * Includes auto-categorization for tax relief
 */

const express = require('express');
const router = express.Router();
const { upload, getFileUrl } = require('../../configs/fileUpload');
const {
    DEFAULT_API_RESPONSE,
    INTERNAL_SERVER_ERROR_API_RESPONSE,
    BAD_REQUEST_API_RESPONSE,
    SUCCESS_API_RESPONSE
} = require('../../configs/helper');
const ExtractReceipt = require('./ExtractReceipt');
const { categorizeReceiptFull } = require('../../models/AppModel/TaxCategorizationServices');

/**
 * POST /file-uploader
 * Upload single or multiple files
 */
router.post("/", upload.array('files', 10), async (req, res) => {
    let response = DEFAULT_API_RESPONSE;

    try {
        const files = req.files;

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
            count: files.length
        };

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
 */
router.post("/single", upload.single('file'), async (req, res) => {
    let response = DEFAULT_API_RESPONSE;

    try {
        const file = req.file;

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
            url: fileUrl
        };

        // Extract receipt data using Azure Document Intelligence
        let extractedReceipt = null;
        try {
            extractedReceipt = await ExtractReceipt(fileUrl);
        } catch (extractError) {
            console.log("Receipt extraction error:", extractError);
            // Continue without extraction - user can enter manually
        }

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
 */
router.post("/receipt", upload.single('file'), async (req, res) => {
    let response = DEFAULT_API_RESPONSE;

    try {
        const file = req.file;
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
            tax_year: taxYear
        };

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
 */
router.post("/categorize", async (req, res) => {
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

module.exports = router;