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
const { AdminGetTaxCategoryDetails } = require('../../../../models/AdminModel/TaxCategory')

/**
 * GET /admin/tax/category/view/:tax_id
 * Get detailed tax category information
 */
router.get("/:tax_id", async(req, res) => {
    let response = DEFAULT_API_RESPONSE

    try {
        const tax_id = req.params.tax_id

        if(CHECK_EMPTY(tax_id)) {
            response = BAD_REQUEST_API_RESPONSE
            response.message = "Error. Tax category ID is required."
            return res.status(response.status_code).json(response)
        }

        console.log("Admin Get Tax Category Details Request - Tax ID: ", tax_id)

        const result = await AdminGetTaxCategoryDetails(tax_id)

        if(!result.status) {
            response = NOT_FOUND_API_RESPONSE
            response.message = "Error. Tax category not found."
            return res.status(response.status_code).json(response)
        }

        response = SUCCESS_API_RESPONSE
        response.message = "Tax category details retrieved successfully."
        response.data = result.data

        res.status(response.status_code).json(response)

    } catch (error) {
        console.log("Error Admin Get Tax Category Details: ", error)
        response = INTERNAL_SERVER_ERROR_API_RESPONSE
        response.message = "Error. An error occurred while retrieving tax category details."
        res.status(response.status_code).json(response)
    }
})

module.exports = router
