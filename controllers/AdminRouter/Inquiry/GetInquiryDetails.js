const express = require('express')
const router = express.Router()
const { 
    DEFAULT_API_RESPONSE, 
    INTERNAL_SERVER_ERROR_API_RESPONSE,
    SUCCESS_API_RESPONSE,
    UNAUTHORIZED_API_RESPONSE,
    ERROR_UNAUTHENTICATED,
    CHECK_EMPTY
} = require('../../../configs/helper')
const { GetInquiryDetails } = require('../../../models/AppModel/Inquiry')

/**
 * GET /admin/inquiry/details/:inquiry_id
 * Get inquiry details by ID for admin
 */
router.get("/:inquiry_id", async(req, res) => {
    let response = DEFAULT_API_RESPONSE
    let user = req.user || null

    if(CHECK_EMPTY(user)) {
        response = UNAUTHORIZED_API_RESPONSE
        response.message = ERROR_UNAUTHENTICATED
        return res.status(response.status_code).json(response)
    }

    try {
        const inquiry_id = req.params.inquiry_id

        console.log("Get Inquiry Details Request: ", inquiry_id)

        const result = await GetInquiryDetails(inquiry_id)

        if(!result.status) {
            response = INTERNAL_SERVER_ERROR_API_RESPONSE
            response.message = "Error. Failed to fetch inquiry details."
            return res.status(response.status_code).json(response)
        }

        if(!result.data) {
            response.status_code = 404
            response.status = "error"
            response.message = "Error. Inquiry not found."
            return res.status(response.status_code).json(response)
        }

        response = SUCCESS_API_RESPONSE
        response.message = "Inquiry details retrieved successfully."
        response.data = result.data

        return res.status(response.status_code).json(response)

    } catch (e) {
        console.log("Error Get Inquiry Details: ", e)
        response = INTERNAL_SERVER_ERROR_API_RESPONSE
        response.message = "Error. " + e.message
        return res.status(response.status_code).json(response)
    }
})

module.exports = router
