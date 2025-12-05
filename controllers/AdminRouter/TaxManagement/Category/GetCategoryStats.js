const express = require('express')
const router = express.Router()
const { 
    DEFAULT_API_RESPONSE, 
    INTERNAL_SERVER_ERROR_API_RESPONSE,
    SUCCESS_API_RESPONSE
} = require('../../../../configs/helper')
const { AdminGetTaxCategoryStats } = require('../../../../models/AdminModel/TaxCategory')

/**
 * GET /admin/tax/category/stats
 * Get tax category statistics
 */
router.get("/", async(req, res) => {
    let response = DEFAULT_API_RESPONSE

    try {
        console.log("Admin Get Tax Category Stats Request")

        const result = await AdminGetTaxCategoryStats()

        if(!result.status) {
            response = INTERNAL_SERVER_ERROR_API_RESPONSE
            response.message = "Error. Failed to retrieve tax category statistics."
            return res.status(response.status_code).json(response)
        }

        response = SUCCESS_API_RESPONSE
        response.message = "Tax category statistics retrieved successfully."
        response.data = result.data

        res.status(response.status_code).json(response)

    } catch (error) {
        console.log("Error Admin Get Tax Category Stats: ", error)
        response = INTERNAL_SERVER_ERROR_API_RESPONSE
        response.message = "Error. An error occurred while retrieving tax category statistics."
        res.status(response.status_code).json(response)
    }
})

module.exports = router
