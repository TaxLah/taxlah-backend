const express = require('express')
const router = express.Router()
const { 
    DEFAULT_API_RESPONSE, 
    INTERNAL_SERVER_ERROR_API_RESPONSE,
    SUCCESS_API_RESPONSE
} = require('../../../configs/helper')
const { GetReceiptCategoriesList } = require('../../../models/AppModel/ReceiptCategory')

/**
 * GET /api/receipt-category/list
 * Get list of active receipt categories for user selection
 */
router.get("/", async(req, res) => {
    let response = DEFAULT_API_RESPONSE

    try {
        console.log("Get Receipt Categories List Request")

        const result = await GetReceiptCategoriesList()

        if(!result.status) {
            response = INTERNAL_SERVER_ERROR_API_RESPONSE
            response.message = "Error. Failed to retrieve receipt categories."
            return res.status(response.status_code).json(response)
        }

        response = SUCCESS_API_RESPONSE
        response.message = "Receipt categories retrieved successfully."
        response.data = {
            categories: result.data,
            total: result.data.length
        }

        res.status(response.status_code).json(response)

    } catch (error) {
        console.log("Error Get Receipt Categories List: ", error)
        response = INTERNAL_SERVER_ERROR_API_RESPONSE
        response.message = "Error. An error occurred while retrieving receipt categories."
        res.status(response.status_code).json(response)
    }
})

module.exports = router
