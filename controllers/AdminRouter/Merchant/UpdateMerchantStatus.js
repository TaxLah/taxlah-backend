const express = require('express')
const router = express.Router()
const { 
    DEFAULT_API_RESPONSE, 
    INTERNAL_SERVER_ERROR_API_RESPONSE,
    BAD_REQUEST_API_RESPONSE,
    SUCCESS_API_RESPONSE,
    CHECK_EMPTY
} = require('../../../configs/helper')
const { AdminUpdateMerchantStatus } = require('../../../models/AdminModel/Merchant')

/**
 * PATCH /admin/merchant/status/:merchant_id
 * Update merchant status
 * Params: { merchant_id }
 * Body: { status } - Active, Inactive, Deleted, Others
 */
router.patch("/status/:merchant_id", async(req, res) => {
    let response = DEFAULT_API_RESPONSE
    let merchant_id = null

    try {
        merchant_id = req.params.merchant_id || null
        const { status } = req.body

        if (CHECK_EMPTY(merchant_id)) {
            response = BAD_REQUEST_API_RESPONSE
            response.message = "Error. Merchant ID is required."
            return res.status(response.status_code).json(response)
        }

        if (CHECK_EMPTY(status)) {
            response = BAD_REQUEST_API_RESPONSE
            response.message = "Error. Status is required."
            return res.status(response.status_code).json(response)
        }

        const result = await AdminUpdateMerchantStatus(parseInt(merchant_id), status)

        if (!result.status) {
            response = BAD_REQUEST_API_RESPONSE
            response.message = result.message || 'Error updating merchant status'
            return res.status(response.status_code).json(response)
        }

        response = SUCCESS_API_RESPONSE
        response.message = result.message || 'Merchant status updated successfully'

        return res.status(response.status_code).json(response)

    } catch (error) {
        console.log("Error at AdminUpdateMerchantStatus: ", error)
        response = INTERNAL_SERVER_ERROR_API_RESPONSE
        response.message = error.message || 'Internal server error'
        return res.status(response.status_code).json(response)
    }
})

module.exports = router
