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

        // Validation
        if(CHECK_EMPTY(rc_id)) {
            response = BAD_REQUEST_API_RESPONSE
            response.message = "Error. Receipt category is required."
            return res.status(response.status_code).json(response)
        }

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
            rc_id: parseInt(rc_id),
            receipt_name: receipt_name ? sanitize(receipt_name) : null,
            receipt_description: receipt_description ? sanitize(receipt_description) : null,
            receipt_amount: parseFloat(receipt_amount),
            receipt_items: receipt_items ? (typeof receipt_items === 'string' ? receipt_items : JSON.stringify(receipt_items)) : null,
            receipt_image_url: receipt_image_url,
            receipt_metadata,
            status: 'Active'
        }

        const result = await CreateReceipt(receiptData)

        if(!result.status) {
            response = INTERNAL_SERVER_ERROR_API_RESPONSE
            response.message = "Error. Failed to create receipt."
            return res.status(response.status_code).json(response)
        }

        response = SUCCESS_API_RESPONSE
        response.message = "Receipt created successfully."
        response.data = {
            receipt_id: result.data,
            ...receiptData
        }

        res.status(response.status_code).json(response)

    } catch (error) {
        console.log("Error Create Receipt: ", error)
        response = INTERNAL_SERVER_ERROR_API_RESPONSE
        response.message = "Error. An error occurred while creating receipt."
        res.status(response.status_code).json(response)
    }
})

module.exports = router
