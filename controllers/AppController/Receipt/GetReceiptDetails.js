const express = require('express')
const router = express.Router()
const { 
    DEFAULT_API_RESPONSE, 
    INTERNAL_SERVER_ERROR_API_RESPONSE,
    BAD_REQUEST_API_RESPONSE,
    SUCCESS_API_RESPONSE,
    NOT_FOUND_API_RESPONSE,
    UNAUTHORIZED_API_RESPONSE,
    ERROR_UNAUTHENTICATED,
    CHECK_EMPTY
} = require('../../../configs/helper')
const { GetReceiptDetails } = require('../../../models/AppModel/Receipt')

/**
 * GET /api/receipt/details/:receipt_id
 * Get receipt details for authenticated user
 */
router.get("/:receipt_id", async(req, res) => {
    let response = DEFAULT_API_RESPONSE
    let user = req.user || null

    if(CHECK_EMPTY(user)) {
        response = UNAUTHORIZED_API_RESPONSE
        response.message = ERROR_UNAUTHENTICATED
        return res.status(response.status_code).json(response)
    }

    try {
        const receipt_id = req.params.receipt_id
        const account_id = user.account_id

        if(CHECK_EMPTY(receipt_id)) {
            response = BAD_REQUEST_API_RESPONSE
            response.message = "Error. Receipt ID is required."
            return res.status(response.status_code).json(response)
        }

        console.log("Get Receipt Details Request - Receipt ID: ", receipt_id, " Account ID: ", account_id)

        const result = await GetReceiptDetails(receipt_id, account_id)

        if(!result.status) {
            response = NOT_FOUND_API_RESPONSE
            response.message = "Error. Receipt not found."
            return res.status(response.status_code).json(response)
        }

        response = SUCCESS_API_RESPONSE
        response.message = "Receipt details retrieved successfully."
        response.data = result.data

        res.status(response.status_code).json(response)

    } catch (error) {
        console.log("Error Get Receipt Details: ", error)
        response = INTERNAL_SERVER_ERROR_API_RESPONSE
        response.message = "Error. An error occurred while retrieving receipt details."
        res.status(response.status_code).json(response)
    }
})

module.exports = router
