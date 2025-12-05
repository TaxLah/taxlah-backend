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
const { AdminCreateTaxCategory } = require('../../../../models/AdminModel/TaxCategory')

/**
 * POST /admin/tax/category/create
 * Create new tax category
 * Body: { tax_title, tax_description, tax_max_claim, tax_content }
 */
router.post("/", async(req, res) => {
    let response = DEFAULT_API_RESPONSE

    try {
        const params = req.body
        console.log("Admin Create Tax Category Request: ", params)

        const tax_title = params.tax_title || null
        const tax_description = params.tax_description || null
        const tax_max_claim = params.tax_max_claim || 0
        const tax_content = params.tax_content || null

        // Validation
        if(CHECK_EMPTY(tax_title)) {
            response = BAD_REQUEST_API_RESPONSE
            response.message = "Error. Tax category title is required."
            return res.status(response.status_code).json(response)
        }

        // Validate tax_max_claim is a number
        if(isNaN(tax_max_claim) || tax_max_claim < 0) {
            response = BAD_REQUEST_API_RESPONSE
            response.message = "Error. Tax max claim must be a valid non-negative number."
            return res.status(response.status_code).json(response)
        }

        // Validate JSON content if provided
        if(tax_content) {
            try {
                if(typeof tax_content === 'string') {
                    JSON.parse(tax_content)
                }
            } catch(e) {
                response = BAD_REQUEST_API_RESPONSE
                response.message = "Error. Tax content must be valid JSON."
                return res.status(response.status_code).json(response)
            }
        }

        // Create category data
        const categoryData = {
            tax_title: sanitize(tax_title),
            tax_description: tax_description ? sanitize(tax_description) : null,
            tax_max_claim: parseFloat(tax_max_claim),
            tax_content: tax_content ? (typeof tax_content === 'string' ? tax_content : JSON.stringify(tax_content)) : null,
            status: 'Active'
        }

        const result = await AdminCreateTaxCategory(categoryData)

        if(!result.status) {
            response = INTERNAL_SERVER_ERROR_API_RESPONSE
            response.message = "Error. Failed to create tax category."
            return res.status(response.status_code).json(response)
        }

        response = SUCCESS_API_RESPONSE
        response.message = "Tax category created successfully."
        response.data = {
            tax_id: result.data,
            ...categoryData
        }

        res.status(response.status_code).json(response)

    } catch (error) {
        console.log("Error Admin Create Tax Category: ", error)
        response = INTERNAL_SERVER_ERROR_API_RESPONSE
        response.message = "Error. An error occurred while creating tax category."
        res.status(response.status_code).json(response)
    }
})

module.exports = router
