const express = require('express')
const router = express.Router()
const { 
    DEFAULT_API_RESPONSE, 
    INTERNAL_SERVER_ERROR_API_RESPONSE,
    BAD_REQUEST_API_RESPONSE,
    SUCCESS_API_RESPONSE,
    CHECK_EMPTY
} = require('../../../../configs/helper')
const { AdminUpdateTaxCategoryStatus } = require('../../../../models/AdminModel/TaxCategory')

/**
 * PATCH /admin/tax/category/status/:tax_id
 * Update tax category status
 * Body: { status: 'Active' | 'Inactive' | 'Deleted' | 'Others' }
 */
router.patch("/:tax_id", async(req, res) => {
    let response = DEFAULT_API_RESPONSE

    try {
        const tax_id = req.params.tax_id
        const { status } = req.body

        if(CHECK_EMPTY(tax_id)) {
            response = BAD_REQUEST_API_RESPONSE
            response.message = "Error. Tax category ID is required."
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

        console.log("Admin Update Tax Category Status Request - Tax ID: ", tax_id, " Status: ", status)

        const result = await AdminUpdateTaxCategoryStatus(tax_id, status)

        if(!result.status) {
            response = INTERNAL_SERVER_ERROR_API_RESPONSE
            response.message = "Error. Failed to update tax category status."
            return res.status(response.status_code).json(response)
        }

        response = SUCCESS_API_RESPONSE
        response.message = "Tax category status updated successfully."
        response.data = { tax_id: parseInt(tax_id), status: status }

        res.status(response.status_code).json(response)

    } catch (error) {
        console.log("Error Admin Update Tax Category Status: ", error)
        response = INTERNAL_SERVER_ERROR_API_RESPONSE
        response.message = "Error. An error occurred while updating tax category status."
        res.status(response.status_code).json(response)
    }
})

module.exports = router
