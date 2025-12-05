const express = require('express')
const router = express.Router()
const { 
    DEFAULT_API_RESPONSE, 
    INTERNAL_SERVER_ERROR_API_RESPONSE,
    BAD_REQUEST_API_RESPONSE,
    SUCCESS_API_RESPONSE,
    CHECK_EMPTY
} = require('../../../../configs/helper')
const { AdminDeleteTaxCategory } = require('../../../../models/AdminModel/TaxCategory')

/**
 * DELETE /admin/tax/category/delete/:tax_id
 * Delete tax category (soft delete - sets status to Deleted)
 */
router.delete("/:tax_id", async(req, res) => {
    let response = DEFAULT_API_RESPONSE

    try {
        const tax_id = req.params.tax_id

        if(CHECK_EMPTY(tax_id)) {
            response = BAD_REQUEST_API_RESPONSE
            response.message = "Error. Tax category ID is required."
            return res.status(response.status_code).json(response)
        }

        console.log("Admin Delete Tax Category Request - Tax ID: ", tax_id)

        const result = await AdminDeleteTaxCategory(tax_id)

        if(!result.status) {
            response = INTERNAL_SERVER_ERROR_API_RESPONSE
            response.message = "Error. Failed to delete tax category."
            return res.status(response.status_code).json(response)
        }

        response = SUCCESS_API_RESPONSE
        response.message = "Tax category deleted successfully."
        response.data = { tax_id: parseInt(tax_id), deleted: true }

        res.status(response.status_code).json(response)

    } catch (error) {
        console.log("Error Admin Delete Tax Category: ", error)
        response = INTERNAL_SERVER_ERROR_API_RESPONSE
        response.message = "Error. An error occurred while deleting tax category."
        res.status(response.status_code).json(response)
    }
})

module.exports = router
