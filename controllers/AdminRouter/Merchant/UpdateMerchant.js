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
const { AdminUpdateMerchant, AdminGetMerchantDetails } = require('../../../models/AdminModel/Merchant')

/**
 * PUT /admin/merchant/update/:merchant_id
 * Update merchant details
 * Params: { merchant_id }
 * Body: { merchant_name, merchant_category, merchant_image } (optional fields)
 */
router.put("/update/:merchant_id", async(req, res) => {
    let response = DEFAULT_API_RESPONSE
    let merchant_id = null

    try {
        merchant_id = req.params.merchant_id || null

        if (CHECK_EMPTY(merchant_id)) {
            response = BAD_REQUEST_API_RESPONSE
            response.message = "Error. Merchant ID is required."
            return res.status(response.status_code).json(response)
        }

        const {
            merchant_name,
            merchant_category,
            merchant_image
        } = req.body

        // At least one field must be provided
        if (CHECK_EMPTY(merchant_name) && CHECK_EMPTY(merchant_category) && CHECK_EMPTY(merchant_image)) {
            response = BAD_REQUEST_API_RESPONSE
            response.message = "Error. At least one field is required for update."
            return res.status(response.status_code).json(response)
        }

        const merchantData = {
            merchant_name: merchant_name ? sanitize(merchant_name) : undefined,
            merchant_category: merchant_category ? sanitize(merchant_category) : undefined,
            merchant_image: merchant_image ? sanitize(merchant_image) : undefined
        }

        const result = await AdminUpdateMerchant(parseInt(merchant_id), merchantData)

        if (!result.status) {
            response = BAD_REQUEST_API_RESPONSE
            response.message = result.message || 'Error updating merchant'
            return res.status(response.status_code).json(response)
        }

        // Fetch updated merchant details
        const updatedMerchant = await AdminGetMerchantDetails(parseInt(merchant_id))

        response = SUCCESS_API_RESPONSE
        response.message = 'Merchant updated successfully'
        response.data = updatedMerchant.status ? updatedMerchant.data : null

        return res.status(response.status_code).json(response)

    } catch (error) {
        console.log("Error at AdminUpdateMerchant: ", error)
        response = INTERNAL_SERVER_ERROR_API_RESPONSE
        response.message = error.message || 'Internal server error'
        return res.status(response.status_code).json(response)
    }
})

module.exports = router
