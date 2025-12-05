const express = require('express')
const router = express.Router()
const { 
    DEFAULT_API_RESPONSE, 
    INTERNAL_SERVER_ERROR_API_RESPONSE,
    BAD_REQUEST_API_RESPONSE,
    SUCCESS_API_RESPONSE,
    CHECK_EMPTY,
    sanitize
} = require('../../../../configs/helper')
const { AdminUpdateTaxCategory } = require('../../../../models/AdminModel/TaxCategory')

/**
 * PUT /admin/tax/category/update/:tax_id
 * Update tax category information
 * Body: { tax_title, tax_description, tax_max_claim, tax_content }
 */
router.put("/:tax_id", async(req, res) => {
    let response = DEFAULT_API_RESPONSE

    try {
        const tax_id = req.params.tax_id
        const params = req.body

        if(CHECK_EMPTY(tax_id)) {
            response = BAD_REQUEST_API_RESPONSE
            response.message = "Error. Tax category ID is required."
            return res.status(response.status_code).json(response)
        }

        console.log("Admin Update Tax Category Request - Tax ID: ", tax_id, " Params: ", params)

        // Build update object with only provided fields
        let updateData = {}

        if(params.tax_title && !CHECK_EMPTY(params.tax_title)) {
            updateData.tax_title = sanitize(params.tax_title)
        }

        if(params.tax_description !== undefined) {
            updateData.tax_description = params.tax_description ? sanitize(params.tax_description) : null
        }

        if(params.tax_max_claim !== undefined) {
            if(isNaN(params.tax_max_claim) || params.tax_max_claim < 0) {
                response = BAD_REQUEST_API_RESPONSE
                response.message = "Error. Tax max claim must be a valid non-negative number."
                return res.status(response.status_code).json(response)
            }
            updateData.tax_max_claim = parseFloat(params.tax_max_claim)
        }

        if(params.tax_content !== undefined) {
            if(params.tax_content) {
                try {
                    if(typeof params.tax_content === 'string') {
                        JSON.parse(params.tax_content)
                    }
                    updateData.tax_content = typeof params.tax_content === 'string' ? params.tax_content : JSON.stringify(params.tax_content)
                } catch(e) {
                    response = BAD_REQUEST_API_RESPONSE
                    response.message = "Error. Tax content must be valid JSON."
                    return res.status(response.status_code).json(response)
                }
            } else {
                updateData.tax_content = null
            }
        }

        // Check if there's anything to update
        if(Object.keys(updateData).length === 0) {
            response = BAD_REQUEST_API_RESPONSE
            response.message = "Error. No valid fields to update."
            return res.status(response.status_code).json(response)
        }

        const result = await AdminUpdateTaxCategory(tax_id, updateData)

        if(!result.status) {
            response = INTERNAL_SERVER_ERROR_API_RESPONSE
            response.message = "Error. Failed to update tax category."
            return res.status(response.status_code).json(response)
        }

        response = SUCCESS_API_RESPONSE
        response.message = "Tax category updated successfully."
        response.data = { tax_id: parseInt(tax_id), updated_fields: Object.keys(updateData) }

        res.status(response.status_code).json(response)

    } catch (error) {
        console.log("Error Admin Update Tax Category: ", error)
        response = INTERNAL_SERVER_ERROR_API_RESPONSE
        response.message = "Error. An error occurred while updating tax category."
        res.status(response.status_code).json(response)
    }
})

module.exports = router
