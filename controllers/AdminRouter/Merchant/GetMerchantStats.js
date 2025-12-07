const express = require('express')
const router = express.Router()
const { 
    DEFAULT_API_RESPONSE, 
    INTERNAL_SERVER_ERROR_API_RESPONSE,
    SUCCESS_API_RESPONSE
} = require('../../../configs/helper')
const { AdminGetMerchantStats } = require('../../../models/AdminModel/Merchant')

/**
 * GET /admin/merchant/stats
 * Get merchant statistics (total count, active, inactive, deleted)
 */
router.get("/stats", async(req, res) => {
    let response = DEFAULT_API_RESPONSE

    try {
        const result = await AdminGetMerchantStats()

        if (!result.status) {
            response = INTERNAL_SERVER_ERROR_API_RESPONSE
            response.message = result.message || 'Error fetching merchant statistics'
            return res.status(response.status_code).json(response)
        }

        response = SUCCESS_API_RESPONSE
        response.message = 'Merchant statistics retrieved successfully'
        response.data = result.data

        return res.status(response.status_code).json(response)

    } catch (error) {
        console.log("Error at AdminGetMerchantStats: ", error)
        response = INTERNAL_SERVER_ERROR_API_RESPONSE
        response.message = error.message || 'Internal server error'
        return res.status(response.status_code).json(response)
    }
})

module.exports = router
