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
const { UpdateReceipt } = require('../../../models/AppModel/Receipt')

/**
 * PUT /api/receipt/update/:receipt_id
 * Update receipt for authenticated user
 * Body: { rc_id, receipt_name, receipt_description, receipt_amount, receipt_image_url }
 */
router.put("/:receipt_id", async(req, res) => {
    let response = DEFAULT_API_RESPONSE
    let user = req.user || null

    if(CHECK_EMPTY(user)) {
        response = UNAUTHORIZED_API_RESPONSE
        response.message = ERROR_UNAUTHENTICATED
        return res.status(response.status_code).json(response)
    }

    try {
        const receipt_id = req.params.receipt_id
        const params = req.body
        const account_id = user.account_id

        if(CHECK_EMPTY(receipt_id)) {
            response = BAD_REQUEST_API_RESPONSE
            response.message = "Error. Receipt ID is required."
            return res.status(response.status_code).json(response)
        }

        console.log("Update Receipt Request - Receipt ID: ", receipt_id, " Params: ", params)

        // Build update object with only provided fields
        let updateData = {}

        if(params.rc_id && !CHECK_EMPTY(params.rc_id)) {
            updateData.rc_id = parseInt(params.rc_id)
        }

        if(params.receipt_name !== undefined) {
            updateData.receipt_name = params.receipt_name ? sanitize(params.receipt_name) : null
        }

        if(params.receipt_description !== undefined) {
            updateData.receipt_description = params.receipt_description ? sanitize(params.receipt_description) : null
        }

        if(params.receipt_amount !== undefined) {
            if(isNaN(params.receipt_amount) || params.receipt_amount < 0) {
                response = BAD_REQUEST_API_RESPONSE
                response.message = "Error. Receipt amount must be a valid non-negative number."
                return res.status(response.status_code).json(response)
            }
            updateData.receipt_amount = parseFloat(params.receipt_amount)
        }

        if(params.receipt_items !== undefined) {
            if(params.receipt_items) {
                try {
                    if(typeof params.receipt_items === 'string') {
                        JSON.parse(params.receipt_items)
                    }
                    updateData.receipt_items = typeof params.receipt_items === 'string' ? params.receipt_items : JSON.stringify(params.receipt_items)
                } catch(e) {
                    response = BAD_REQUEST_API_RESPONSE
                    response.message = "Error. Receipt items must be valid JSON."
                    return res.status(response.status_code).json(response)
                }
            } else {
                updateData.receipt_items = null
            }
        }

        if(params.receipt_image_url && !CHECK_EMPTY(params.receipt_image_url)) {
            updateData.receipt_image_url = params.receipt_image_url
        }

        // Check if there's anything to update
        if(Object.keys(updateData).length === 0) {
            response = BAD_REQUEST_API_RESPONSE
            response.message = "Error. No valid fields to update."
            return res.status(response.status_code).json(response)
        }

        const result = await UpdateReceipt(receipt_id, account_id, updateData)

        if(!result.status) {
            response = INTERNAL_SERVER_ERROR_API_RESPONSE
            response.message = "Error. Failed to update receipt."
            return res.status(response.status_code).json(response)
        }

        response = SUCCESS_API_RESPONSE
        response.message = "Receipt updated successfully."
        response.data = {
            receipt_id: parseInt(receipt_id),
            updated_fields: updateData
        }

        res.status(response.status_code).json(response)

    } catch (error) {
        console.log("Error Update Receipt: ", error)
        response = INTERNAL_SERVER_ERROR_API_RESPONSE
        response.message = "Error. An error occurred while updating receipt."
        res.status(response.status_code).json(response)
    }
})

module.exports = router
