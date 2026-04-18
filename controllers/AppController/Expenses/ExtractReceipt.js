/**
 * Extract Receipt Controller
 * 
 * Synchronous OCR preview step for premium users.
 * User uploads receipt → AI reads it → returns structured data for user to review.
 * No expense record is created at this point.
 * 
 * POST /api/expenses/extract-receipt
 * 
 * Flow:
 *   1. Upload receipt file (image or PDF)
 *   2. Check premium subscription + daily quota
 *   3. Run ReceiptExtractionService (synchronous, user waits ~5–10s)
 *   4. Consume one quota slot
 *   5. Return extracted data + stored file URL
 *   6. Client shows preview → user edits if needed → calls POST /api/expenses/create
 */

const express   = require('express');
const router    = express.Router();
const {
    DEFAULT_API_RESPONSE,
    INTERNAL_SERVER_ERROR_API_RESPONSE,
    BAD_REQUEST_API_RESPONSE,
    UNAUTHORIZED_API_RESPONSE,
    FORBIDDEN_API_RESPONSE,
    ERROR_UNAUTHENTICATED,
    CHECK_EMPTY
} = require('../../../configs/helper');
const { upload, getFileUrl }                    = require('../../../configs/fileUpload');
const { extractReceiptData }                    = require('../../../services/ReceiptExtractionService');
const { checkSubscriptionAccess }               = require('../../../models/AppModel/SubscriptionService');
const { canUploadReceipt, recordReceiptUpload } = require('../../../models/AppModel/ReceiptUsageService');

/**
 * POST /api/expenses/extract-receipt
 * 
 * Multipart form-data:
 *   receipt_file  — required: image (jpg/png/webp) or PDF
 */
router.post('/', upload.single('receipt_file'), async (req, res) => {
    let response = DEFAULT_API_RESPONSE;
    const user   = req.user || null;

    if (CHECK_EMPTY(user)) {
        response = UNAUTHORIZED_API_RESPONSE;
        response.message = ERROR_UNAUTHENTICATED;
        return res.status(response.status_code).json(response);
    }

    const uploadedFile = req.file;

    if (!uploadedFile) {
        response = { ...BAD_REQUEST_API_RESPONSE, message: 'receipt_file is required' };
        return res.status(response.status_code).json(response);
    }

    const account_id = user.account_id;

    try {
        console.log('[ExtractReceipt] Request from account_id:', account_id, '| file:', uploadedFile.originalname);

        // --- Premium gate: subscription + daily quota ---
        const [subscriptionResult, quotaResult] = await Promise.all([
            checkSubscriptionAccess(account_id),
            canUploadReceipt(account_id)
        ]);

        const hasAIFeature = subscriptionResult.success
            && subscriptionResult.has_access
            && subscriptionResult.features?.ai_categorization;

        if (!hasAIFeature) {
            response = {
                ...FORBIDDEN_API_RESPONSE,
                message: 'AI receipt extraction is a premium feature. Please upgrade your subscription.',
                data: { upgrade_required: true }
            };
            return res.status(response.status_code).json(response);
        }

        if (!quotaResult.success || !quotaResult.can_upload) {
            response = {
                ...FORBIDDEN_API_RESPONSE,
                message: quotaResult.message || 'Monthly receipt upload quota reached.',
                data: {
                    quota_exceeded: true,
                    quota_info: quotaResult
                }
            };
            return res.status(response.status_code).json(response);
        }

        // --- Run OCR extraction (synchronous — user waits for preview) ---
        const extracted = await extractReceiptData(uploadedFile.path, uploadedFile.mimetype);
        console.log('[ExtractReceipt] Extraction complete:', {
            merchant:     extracted.merchant,
            date:         extracted.date,
            total_amount: extracted.total_amount,
            items_count:  extracted.items?.length ?? 0
        });

        // --- Consume one quota slot ---
        await recordReceiptUpload(account_id, false);

        // --- Build stored file URL (to pass to create expense later) ---
        const file_url = getFileUrl(uploadedFile.path);

        response = {
            status_code: 200,
            status: 'success',
            message: 'Receipt extracted successfully. Please review the data before saving.',
            data: {
                extracted: {
                    merchant:     extracted.merchant,
                    date:         extracted.date,
                    total_amount: extracted.total_amount,
                    currency:     extracted.currency,
                    items:        extracted.items,
                    notes:        extracted.notes
                },
                file: {
                    file_url,
                    original_name: uploadedFile.originalname,
                    mimetype:      uploadedFile.mimetype,
                    size:          uploadedFile.size
                },
                quota: {
                    remaining: quotaResult.remaining_uploads != null
                        ? quotaResult.remaining_uploads - 1
                        : null
                },
                tokens_used: extracted.tokens_used
            }
        };

        return res.status(response.status_code).json(response);

    } catch (err) {
        console.error('[ExtractReceipt] Error:', err.message);
        response = {
            ...INTERNAL_SERVER_ERROR_API_RESPONSE,
            message: 'Failed to extract receipt data. Please try again or enter details manually.',
            data: { error: err.message }
        };
        return res.status(response.status_code).json(response);
    }
});

module.exports = router;
