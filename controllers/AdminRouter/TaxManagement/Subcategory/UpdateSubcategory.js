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
const { AdminUpdateTaxSubcategory } = require('../../../../models/AdminModel/TaxSubcategory')

/**
 * PUT /admin/tax/subcategory/update/:taxsub_id
 * Update tax subcategory information
 * Body: { tax_id, taxsub_title, taxsub_description, taxsub_max_claim, taxsub_tags, taxsub_content }
 */
router.put("/:taxsub_id", async(req, res) => {
    let response = DEFAULT_API_RESPONSE

    try {
        const taxsub_id = req.params.taxsub_id
        const params = req.body

        if(CHECK_EMPTY(taxsub_id)) {
            response = BAD_REQUEST_API_RESPONSE
            response.message = "Error. Tax subcategory ID is required."
            return res.status(response.status_code).json(response)
        }

        console.log("Admin Update Tax Subcategory Request - Taxsub ID: ", taxsub_id, " Params: ", params)

        // Build update object with only provided fields
        let updateData = {}

        if(params.tax_id && !CHECK_EMPTY(params.tax_id)) {
            updateData.tax_id = parseInt(params.tax_id)
        }

        if(params.taxsub_title && !CHECK_EMPTY(params.taxsub_title)) {
            updateData.taxsub_title = sanitize(params.taxsub_title)
        }

        if(params.taxsub_description !== undefined) {
            updateData.taxsub_description = params.taxsub_description ? sanitize(params.taxsub_description) : null
        }

        if(params.taxsub_max_claim !== undefined) {
            if(isNaN(params.taxsub_max_claim) || params.taxsub_max_claim < 0) {
                response = BAD_REQUEST_API_RESPONSE
                response.message = "Error. Tax max claim must be a valid non-negative number."
                return res.status(response.status_code).json(response)
            }
            updateData.taxsub_max_claim = parseFloat(params.taxsub_max_claim)
        }

        if(params.taxsub_tags !== undefined) {
            if(params.taxsub_tags) {
                try {
                    if(typeof params.taxsub_tags === 'string') {
                        JSON.parse(params.taxsub_tags)
                    }
                    updateData.taxsub_tags = typeof params.taxsub_tags === 'string' ? params.taxsub_tags : JSON.stringify(params.taxsub_tags)
                } catch(e) {
                    response = BAD_REQUEST_API_RESPONSE
                    response.message = "Error. Tax tags must be valid JSON."
                    return res.status(response.status_code).json(response)
                }
            } else {
                updateData.taxsub_tags = null
            }
        }

        if(params.taxsub_content !== undefined) {
            if(params.taxsub_content) {
                try {
                    if(typeof params.taxsub_content === 'string') {
                        JSON.parse(params.taxsub_content)
                    }
                    updateData.taxsub_content = typeof params.taxsub_content === 'string' ? params.taxsub_content : JSON.stringify(params.taxsub_content)
                } catch(e) {
                    response = BAD_REQUEST_API_RESPONSE
                    response.message = "Error. Tax content must be valid JSON."
                    return res.status(response.status_code).json(response)
                }
            } else {
                updateData.taxsub_content = null
            }
        }

        // Check if there's anything to update
        if(Object.keys(updateData).length === 0) {
            response = BAD_REQUEST_API_RESPONSE
            response.message = "Error. No valid fields to update."
            return res.status(response.status_code).json(response)
        }

        const result = await AdminUpdateTaxSubcategory(taxsub_id, updateData)

        if(!result.status) {
            response = INTERNAL_SERVER_ERROR_API_RESPONSE
            response.message = "Error. Failed to update tax subcategory."
            return res.status(response.status_code).json(response)
        }

        response = SUCCESS_API_RESPONSE
        response.message = "Tax subcategory updated successfully."
        response.data = { taxsub_id: parseInt(taxsub_id), updated_fields: Object.keys(updateData) }

        res.status(response.status_code).json(response)

    } catch (error) {
        console.log("Error Admin Update Tax Subcategory: ", error)
        response = INTERNAL_SERVER_ERROR_API_RESPONSE
        response.message = "Error. An error occurred while updating tax subcategory."
        res.status(response.status_code).json(response)
    }
})

module.exports = router
