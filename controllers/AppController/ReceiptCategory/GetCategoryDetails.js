const express = require('express')
const router = express.Router()
const { 
    DEFAULT_API_RESPONSE, 
    INTERNAL_SERVER_ERROR_API_RESPONSE,
    BAD_REQUEST_API_RESPONSE,
    SUCCESS_API_RESPONSE,
    NOT_FOUND_API_RESPONSE,
    CHECK_EMPTY
} = require('../../../configs/helper')
const { GetReceiptCategoryDetails } = require('../../../models/AppModel/ReceiptCategory')

/**
 * GET /api/receipt-category/details/:rc_id
 * Get receipt category details by ID
 */
router.get("/:rc_id", async(req, res) => {
    let response = DEFAULT_API_RESPONSE

    try {
        const rc_id = req.params.rc_id

        if(CHECK_EMPTY(rc_id)) {
            response = BAD_REQUEST_API_RESPONSE
            response.message = "Error. Receipt category ID is required."
            return res.status(response.status_code).json(response)
        }

        console.log("Get Receipt Category Details Request - RC ID: ", rc_id)

        const result = await GetReceiptCategoryDetails(rc_id)

        if(!result.status) {
            response = NOT_FOUND_API_RESPONSE
            response.message = "Error. Receipt category not found."
            return res.status(response.status_code).json(response)
        }

        response = SUCCESS_API_RESPONSE
        response.message = "Receipt category details retrieved successfully."
        response.data = result.data

        res.status(response.status_code).json(response)

    } catch (error) {
        console.log("Error Get Receipt Category Details: ", error)
        response = INTERNAL_SERVER_ERROR_API_RESPONSE
        response.message = "Error. An error occurred while retrieving receipt category details."
        res.status(response.status_code).json(response)
    }
})

module.exports = router
