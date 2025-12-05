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
const { AdminCreateTaxSubcategory } = require('../../../../models/AdminModel/TaxSubcategory')

/**
 * POST /admin/tax/subcategory/create
 * Create new tax subcategory
 * Body: { taxsub_title, taxsub_description, taxsub_max_claim, taxsub_tags, taxsub_content }
 */
router.post("/", async(req, res) => {
    let response = DEFAULT_API_RESPONSE

    try {
        const params = req.body
        console.log("Admin Create Tax Subcategory Request: ", params)

        const taxsub_title = params.taxsub_title || null
        const taxsub_description = params.taxsub_description || null
        const taxsub_max_claim = params.taxsub_max_claim || 0
        const taxsub_tags = params.taxsub_tags || null
        const taxsub_content = params.taxsub_content || null

        // Validation
        if(CHECK_EMPTY(taxsub_title)) {
            response = BAD_REQUEST_API_RESPONSE
            response.message = "Error. Tax subcategory title is required."
            return res.status(response.status_code).json(response)
        }

        // Validate taxsub_max_claim is a number
        if(isNaN(taxsub_max_claim) || taxsub_max_claim < 0) {
            response = BAD_REQUEST_API_RESPONSE
            response.message = "Error. Tax max claim must be a valid non-negative number."
            return res.status(response.status_code).json(response)
        }

        // Validate JSON fields if provided
        if(taxsub_tags) {
            try {
                if(typeof taxsub_tags === 'string') {
                    JSON.parse(taxsub_tags)
                }
            } catch(e) {
                response = BAD_REQUEST_API_RESPONSE
                response.message = "Error. Tax tags must be valid JSON."
                return res.status(response.status_code).json(response)
            }
        }

        if(taxsub_content) {
            try {
                if(typeof taxsub_content === 'string') {
                    JSON.parse(taxsub_content)
                }
            } catch(e) {
                response = BAD_REQUEST_API_RESPONSE
                response.message = "Error. Tax content must be valid JSON."
                return res.status(response.status_code).json(response)
            }
        }

        // Create subcategory data
        const subcategoryData = {
            taxsub_title: sanitize(taxsub_title),
            taxsub_description: taxsub_description ? sanitize(taxsub_description) : null,
            taxsub_max_claim: parseFloat(taxsub_max_claim),
            taxsub_tags: taxsub_tags ? (typeof taxsub_tags === 'string' ? taxsub_tags : JSON.stringify(taxsub_tags)) : null,
            taxsub_content: taxsub_content ? (typeof taxsub_content === 'string' ? taxsub_content : JSON.stringify(taxsub_content)) : null,
            status: 'Active'
        }

        const result = await AdminCreateTaxSubcategory(subcategoryData)

        if(!result.status) {
            response = INTERNAL_SERVER_ERROR_API_RESPONSE
            response.message = "Error. Failed to create tax subcategory."
            return res.status(response.status_code).json(response)
        }

        response = SUCCESS_API_RESPONSE
        response.message = "Tax subcategory created successfully."
        response.data = {
            taxsub_id: result.data,
            ...subcategoryData
        }

        res.status(response.status_code).json(response)

    } catch (error) {
        console.log("Error Admin Create Tax Subcategory: ", error)
        response = INTERNAL_SERVER_ERROR_API_RESPONSE
        response.message = "Error. An error occurred while creating tax subcategory."
        res.status(response.status_code).json(response)
    }
})

module.exports = router
