const express = require('express')
const router = express.Router()
const { 
    DEFAULT_API_RESPONSE, 
    INTERNAL_SERVER_ERROR_API_RESPONSE,
    BAD_REQUEST_API_RESPONSE,
    SUCCESS_API_RESPONSE,
    CHECK_EMPTY,
    sanitize
} = require('../../../configs/helper')
const { AdminCreateMerchant } = require('../../../models/AdminModel/Merchant')

/**
 * POST /admin/merchant/create
 * Create a new merchant
 * Body: { merchant_name, merchant_category, merchant_image }
 */
router.post("/create", async(req, res) => {
    let response = DEFAULT_API_RESPONSE

    try {
        const {
            merchant_name,
            merchant_category,
            merchant_image
        } = req.body

        // Validate required fields
        if (CHECK_EMPTY(merchant_name)) {
            response = BAD_REQUEST_API_RESPONSE
            response.message = "Error. Merchant name is required."
            return res.status(response.status_code).json(response)
        }

        if (CHECK_EMPTY(merchant_category)) {
            response = BAD_REQUEST_API_RESPONSE
            response.message = "Error. Merchant category is required."
            return res.status(response.status_code).json(response)
        }

        if (CHECK_EMPTY(merchant_image)) {
            response = BAD_REQUEST_API_RESPONSE
            response.message = "Error. Merchant image URL is required."
            return res.status(response.status_code).json(response)
        }

        const merchantData = {
            merchant_name: sanitize(merchant_name),
            merchant_category: sanitize(merchant_category),
            merchant_image: sanitize(merchant_image)
        }

        const result = await AdminCreateMerchant(merchantData)

        if (!result.status) {
            response = BAD_REQUEST_API_RESPONSE
            response.message = result.message || 'Error creating merchant'
            return res.status(response.status_code).json(response)
        }

        response = SUCCESS_API_RESPONSE
        response.message = 'Merchant created successfully'
        response.data = result.data

        return res.status(response.status_code).json(response)

    } catch (error) {
        console.log("Error at AdminCreateMerchant: ", error)
        response = INTERNAL_SERVER_ERROR_API_RESPONSE
        response.message = error.message || 'Internal server error'
        return res.status(response.status_code).json(response)
    }
})

module.exports = router
