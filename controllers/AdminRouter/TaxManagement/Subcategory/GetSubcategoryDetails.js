const express = require('express')
const router = express.Router()
const { 
    DEFAULT_API_RESPONSE, 
    INTERNAL_SERVER_ERROR_API_RESPONSE,
    BAD_REQUEST_API_RESPONSE,
    NOT_FOUND_API_RESPONSE,
    SUCCESS_API_RESPONSE,
    CHECK_EMPTY
} = require('../../../../configs/helper')
const { AdminGetTaxSubcategoryDetails } = require('../../../../models/AdminModel/TaxSubcategory')

/**
 * GET /admin/tax/subcategory/view/:taxsub_id
 * Get detailed tax subcategory information
 */
router.get("/:taxsub_id", async(req, res) => {
    let response = DEFAULT_API_RESPONSE

    try {
        const taxsub_id = req.params.taxsub_id

        if(CHECK_EMPTY(taxsub_id)) {
            response = BAD_REQUEST_API_RESPONSE
            response.message = "Error. Tax subcategory ID is required."
            return res.status(response.status_code).json(response)
        }

        console.log("Admin Get Tax Subcategory Details Request - Taxsub ID: ", taxsub_id)

        const result = await AdminGetTaxSubcategoryDetails(taxsub_id)

        if(!result.status) {
            response = NOT_FOUND_API_RESPONSE
            response.message = "Error. Tax subcategory not found."
            return res.status(response.status_code).json(response)
        }

        response = SUCCESS_API_RESPONSE
        response.message = "Tax subcategory details retrieved successfully."
        response.data = result.data

        res.status(response.status_code).json(response)

    } catch (error) {
        console.log("Error Admin Get Tax Subcategory Details: ", error)
        response = INTERNAL_SERVER_ERROR_API_RESPONSE
        response.message = "Error. An error occurred while retrieving tax subcategory details."
        res.status(response.status_code).json(response)
    }
})

module.exports = router
