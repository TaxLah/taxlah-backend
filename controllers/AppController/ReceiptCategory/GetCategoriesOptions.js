const express = require('express')
const router = express.Router()
const { 
    DEFAULT_API_RESPONSE, 
    INTERNAL_SERVER_ERROR_API_RESPONSE,
    SUCCESS_API_RESPONSE
} = require('../../../configs/helper')
const { GetReceiptCategoriesOptions } = require('../../../models/AppModel/ReceiptCategory')

/**
 * GET /api/receipt-category/options
 * Get receipt categories as select options (value/label format)
 */
router.get("/", async(req, res) => {
    let response = DEFAULT_API_RESPONSE

    try {
        console.log("Get Receipt Categories Options Request")

        const result = await GetReceiptCategoriesOptions()

        if(!result.status) {
            response = INTERNAL_SERVER_ERROR_API_RESPONSE
            response.message = "Error. Failed to retrieve receipt categories."
            return res.status(response.status_code).json(response)
        }

        // Transform data to value/label format
        const options = result.data.map(category => ({
            value: category.rc_id,
            label: category.rc_name
        }))

        response = SUCCESS_API_RESPONSE
        response.message = "Receipt category options retrieved successfully."
        response.data = options

        res.status(response.status_code).json(response)

    } catch (error) {
        console.log("Error Get Receipt Categories Options: ", error)
        response = INTERNAL_SERVER_ERROR_API_RESPONSE
        response.message = "Error. An error occurred while retrieving receipt category options."
        res.status(response.status_code).json(response)
    }
})

module.exports = router
