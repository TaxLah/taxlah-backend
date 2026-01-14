const express = require('express')
const router = express.Router()
const { 
    DEFAULT_API_RESPONSE, 
    INTERNAL_SERVER_ERROR_API_RESPONSE,
    BAD_REQUEST_API_RESPONSE,
    SUCCESS_API_RESPONSE,
    UNAUTHORIZED_API_RESPONSE,
    ERROR_UNAUTHENTICATED,
    CHECK_EMPTY,
    sanitize
} = require('../../../configs/helper')
const { CreateReceipt } = require('../../../models/AppModel/Receipt')
const { UserNotificationCreate } = require('../../../models/AppModel/Notification')
const { processReceiptForTaxClaim } = require('../../../models/AppModel/TaxClaimServices')

/**
 * POST /api/receipt/create
 * Create new receipt for authenticated user
 * Body: { rc_id, receipt_name, receipt_description, receipt_amount, receipt_image_url }
 */
router.post("/", async(req, res) => {
    let response = DEFAULT_API_RESPONSE
    let user = req.user || null

    if(CHECK_EMPTY(user)) {
        response = UNAUTHORIZED_API_RESPONSE
        response.message = ERROR_UNAUTHENTICATED
        return res.status(response.status_code).json(response)
    }

    try {
        const params = req.body
        const account_id = user.account_id

        console.log("Create Receipt Request: ", params)

        const rc_id                 = params.rc_id || null
        const receipt_name          = params.receipt_name || null
        const receipt_description   = params.receipt_description || null
        const receipt_amount        = params.receipt_amount || 0
        const receipt_items         = params.receipt_items || null
        const receipt_image_url     = params.receipt_image_url || null
        const receipt_metadata      = params.receipt_metadata || null

        // Tax claim fields (NEW)
        const tax_id                = params.tax_id ? parseInt(params.tax_id) : null;
        const taxsub_id             = params.taxsub_id ? parseInt(params.taxsub_id) : null;
        const tax_year              = parseInt(params.tax_year) || new Date().getFullYear();

        // Validation
        // if(CHECK_EMPTY(rc_id)) {
        //     response = BAD_REQUEST_API_RESPONSE
        //     response.message = "Error. Receipt category is required."
        //     return res.status(response.status_code).json(response)
        // }

        if(CHECK_EMPTY(receipt_image_url)) {
            response = BAD_REQUEST_API_RESPONSE
            response.message = "Error. Receipt image is required."
            return res.status(response.status_code).json(response)
        }

        // Validate receipt_amount is a number
        if(isNaN(receipt_amount) || receipt_amount < 0) {
            response = BAD_REQUEST_API_RESPONSE
            response.message = "Error. Receipt amount must be a valid non-negative number."
            return res.status(response.status_code).json(response)
        }

        // Validate receipt_items JSON if provided
        if(receipt_items) {
            try {
                if(typeof receipt_items === 'string') {
                    JSON.parse(receipt_items)
                }
            } catch(e) {
                response = BAD_REQUEST_API_RESPONSE
                response.message = "Error. Receipt items must be valid JSON."
                return res.status(response.status_code).json(response)
            }
        }

        // Create receipt data
        const receiptData = {
            account_id: parseInt(account_id),
            rc_id: rc_id ? parseInt(rc_id) : null,
            receipt_name: receipt_name ? sanitize(receipt_name) : null,
            receipt_description: receipt_description ? sanitize(receipt_description) : null,
            receipt_amount: parseFloat(receipt_amount),
            receipt_items: receipt_items ? (typeof receipt_items === 'string' ? receipt_items : JSON.stringify(receipt_items)) : null,
            receipt_image_url: receipt_image_url,
            receipt_metadata: receipt_metadata ? (typeof receipt_metadata === 'string' ? receipt_metadata : JSON.stringify(receipt_metadata)) : null,
            status: 'Active'
        }

        const result = await CreateReceipt(receiptData)

        if(!result.status) {
            response = INTERNAL_SERVER_ERROR_API_RESPONSE
            response.message = "Error. Failed to create receipt."
            return res.status(response.status_code).json(response)
        }

        const receipt_id = result.data;
        let taxClaimResult = null;
        let limitReached = false;
        let limitMessage = null;

        // Step 2: Create tax claim if tax_id is provided
        if(tax_id && receipt_amount > 0) {
            try {
                taxClaimResult = await processReceiptForTaxClaim(account_id, receipt_id, tax_id, taxsub_id, receipt_amount, tax_year);

                if(taxClaimResult.status) {
                    limitReached = taxClaimResult.data.limit_reached || false;
                    limitMessage = taxClaimResult.data.limit_message || null;
                }
            } catch(taxError) {
                console.log("Tax claim creation error (non-fatal):", taxError);
                // Continue - receipt was created successfully
            }
        }

        // Step 3: Create notification
        let notificationMessage = `Your receipt "${receipt_name || ''}" has been created successfully with amount RM ${receipt_amount.toFixed(2)}.`;
        
        if(taxClaimResult && taxClaimResult.status) {
            notificationMessage += ` Tax relief claim has been updated.`;
        }

        // Create notification for successful receipt creation
        await UserNotificationCreate({
            account_id: parseInt(account_id),
            notification_title: "Receipt Created Successfully",
            notification_description: notificationMessage,
            read_status: 'No',
            archive_status: 'No',
            status: 'Active'
        })

        response = SUCCESS_API_RESPONSE
        response.message = "Receipt created successfully."
        response.data = {
            receipt_id: result.data,
            ...receiptData,
            tax_claim: taxClaimResult ? {
                success: taxClaimResult.status,
                claim_id: taxClaimResult.data?.claim?.claim_id || null,
                claimed_amount: taxClaimResult.data?.claim?.claimed_amount || 0,
                limit_reached: limitReached,
                limit_message: limitMessage
            } : null
        }

        // Add warning if limit was reached
        if(limitReached) {
            response.message = "Receipt created. Warning: Tax relief limit reached.";
        }

        return res.status(response.status_code).json(response)

    } catch (error) {
        console.log("Error Create Receipt: ", error)
        response = INTERNAL_SERVER_ERROR_API_RESPONSE
        response.message = "Error. An error occurred while creating receipt."
        return res.status(response.status_code).json(response)
    }
})

module.exports = router
