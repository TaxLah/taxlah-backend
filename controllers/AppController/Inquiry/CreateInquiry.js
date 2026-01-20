const express = require('express')
const router = express.Router()
const { 
    DEFAULT_API_RESPONSE, 
    INTERNAL_SERVER_ERROR_API_RESPONSE,
    BAD_REQUEST_API_RESPONSE,
    SUCCESS_API_RESPONSE,
    CHECK_EMPTY
} = require('../../../configs/helper')
const { CreateInquiry } = require('../../../models/AppModel/Inquiry')

/**
 * POST /api/public/inquiry
 * Create new inquiry - Public endpoint (no authentication required)
 * Body: { inquiry_name, inquiry_email, inquiry_subject, inquiry_message }
 */
router.post("/", async(req, res) => {
    let response = DEFAULT_API_RESPONSE

    try {
        const params = req.body

        console.log("Create Inquiry Request: ", params)

        const inquiry_name = params.inquiry_name || null
        const inquiry_email = params.inquiry_email || null
        const inquiry_subject = params.inquiry_subject || null
        const inquiry_message = params.inquiry_message || null

        // Validation
        if(CHECK_EMPTY(inquiry_name)) {
            response = BAD_REQUEST_API_RESPONSE
            response.message = "Error. Name is required."
            return res.status(response.status_code).json(response)
        }

        if(CHECK_EMPTY(inquiry_email)) {
            response = BAD_REQUEST_API_RESPONSE
            response.message = "Error. Email is required."
            return res.status(response.status_code).json(response)
        }

        // Basic email validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
        if(!emailRegex.test(inquiry_email)) {
            response = BAD_REQUEST_API_RESPONSE
            response.message = "Error. Please provide a valid email address."
            return res.status(response.status_code).json(response)
        }

        if(CHECK_EMPTY(inquiry_message)) {
            response = BAD_REQUEST_API_RESPONSE
            response.message = "Error. Message is required."
            return res.status(response.status_code).json(response)
        }

        // Create inquiry
        const createResult = await CreateInquiry({
            inquiry_name,
            inquiry_email,
            inquiry_subject,
            inquiry_message
        })

        if(!createResult.status) {
            response = INTERNAL_SERVER_ERROR_API_RESPONSE
            response.message = "Error. Failed to create inquiry."
            return res.status(response.status_code).json(response)
        }

        response = SUCCESS_API_RESPONSE
        response.message = "Inquiry submitted successfully. We'll get back to you soon."
        response.data = createResult.data

        return res.status(response.status_code).json(response)

    } catch (e) {
        console.log("Error Create Inquiry: ", e)
        response = INTERNAL_SERVER_ERROR_API_RESPONSE
        response.message = "Error. " + e.message
        return res.status(response.status_code).json(response)
    }
})

module.exports = router
