const express = require('express')
const router = express.Router()
const { 
    DEFAULT_API_RESPONSE, 
    INTERNAL_SERVER_ERROR_API_RESPONSE,
    BAD_REQUEST_API_RESPONSE,
    SUCCESS_API_RESPONSE,
    CHECK_EMPTY
} = require('../../../../configs/helper')
const { AdminUpdateTaxSubcategoryStatus } = require('../../../../models/AdminModel/TaxSubcategory')

/**
 * PATCH /admin/tax/subcategory/status/:taxsub_id
 * Update tax subcategory status
 * Body: { status: 'Active' | 'Inactive' | 'Deleted' | 'Others' }
 */
router.patch("/:taxsub_id", async(req, res) => {
    let response = DEFAULT_API_RESPONSE

    try {
        const taxsub_id = req.params.taxsub_id
        const { status } = req.body

        if(CHECK_EMPTY(taxsub_id)) {
            response = BAD_REQUEST_API_RESPONSE
            response.message = "Error. Tax subcategory ID is required."
            return res.status(response.status_code).json(response)
        }

        if(CHECK_EMPTY(status)) {
            response = BAD_REQUEST_API_RESPONSE
            response.message = "Error. Status is required."
            return res.status(response.status_code).json(response)
        }

        const validStatuses = ['Active', 'Inactive', 'Deleted', 'Others']
        if(!validStatuses.includes(status)) {
            response = BAD_REQUEST_API_RESPONSE
            response.message = `Error. Invalid status. Valid values: ${validStatuses.join(', ')}`
            return res.status(response.status_code).json(response)
        }

        console.log("Admin Update Tax Subcategory Status Request - Taxsub ID: ", taxsub_id, " Status: ", status)

        const result = await AdminUpdateTaxSubcategoryStatus(taxsub_id, status)

        if(!result.status) {
            response = INTERNAL_SERVER_ERROR_API_RESPONSE
            response.message = "Error. Failed to update tax subcategory status."
            return res.status(response.status_code).json(response)
        }

        response = SUCCESS_API_RESPONSE
        response.message = "Tax subcategory status updated successfully."
        response.data = { taxsub_id: parseInt(taxsub_id), status: status }

        res.status(response.status_code).json(response)

    } catch (error) {
        console.log("Error Admin Update Tax Subcategory Status: ", error)
        response = INTERNAL_SERVER_ERROR_API_RESPONSE
        response.message = "Error. An error occurred while updating tax subcategory status."
        res.status(response.status_code).json(response)
    }
})

module.exports = router
