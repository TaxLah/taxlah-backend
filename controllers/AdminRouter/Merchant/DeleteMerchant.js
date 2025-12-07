const express = require('express')
const router = express.Router()
const { 
    DEFAULT_API_RESPONSE, 
    INTERNAL_SERVER_ERROR_API_RESPONSE,
    BAD_REQUEST_API_RESPONSE,
    SUCCESS_API_RESPONSE,
    CHECK_EMPTY
} = require('../../../configs/helper')
const { AdminDeleteMerchant } = require('../../../models/AdminModel/Merchant')

/**
 * DELETE /admin/merchant/delete/:merchant_id
 * Delete merchant (soft delete - marks as deleted)
 * Params: { merchant_id }
 */
router.delete("/delete/:merchant_id", async(req, res) => {
    let response = DEFAULT_API_RESPONSE
    let merchant_id = null

    try {
        merchant_id = req.params.merchant_id || null

        if (CHECK_EMPTY(merchant_id)) {
            response = BAD_REQUEST_API_RESPONSE
            response.message = "Error. Merchant ID is required."
            return res.status(response.status_code).json(response)
        }

        const result = await AdminDeleteMerchant(parseInt(merchant_id))

        if (!result.status) {
            response = BAD_REQUEST_API_RESPONSE
            response.message = result.message || 'Error deleting merchant'
            return res.status(response.status_code).json(response)
        }

        response = SUCCESS_API_RESPONSE
        response.message = result.message || 'Merchant deleted successfully'

        return res.status(response.status_code).json(response)

    } catch (error) {
        console.log("Error at AdminDeleteMerchant: ", error)
        response = INTERNAL_SERVER_ERROR_API_RESPONSE
        response.message = error.message || 'Internal server error'
        return res.status(response.status_code).json(response)
    }
})

module.exports = router
