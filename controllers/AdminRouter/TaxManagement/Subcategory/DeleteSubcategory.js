const express = require('express')
const router = express.Router()
const { 
    DEFAULT_API_RESPONSE, 
    INTERNAL_SERVER_ERROR_API_RESPONSE,
    BAD_REQUEST_API_RESPONSE,
    SUCCESS_API_RESPONSE,
    CHECK_EMPTY
} = require('../../../../configs/helper')
const { AdminDeleteTaxSubcategory } = require('../../../../models/AdminModel/TaxSubcategory')

/**
 * DELETE /admin/tax/subcategory/delete/:taxsub_id
 * Delete tax subcategory (soft delete - sets status to Deleted)
 */
router.delete("/:taxsub_id", async(req, res) => {
    let response = DEFAULT_API_RESPONSE

    try {
        const taxsub_id = req.params.taxsub_id

        if(CHECK_EMPTY(taxsub_id)) {
            response = BAD_REQUEST_API_RESPONSE
            response.message = "Error. Tax subcategory ID is required."
            return res.status(response.status_code).json(response)
        }

        console.log("Admin Delete Tax Subcategory Request - Taxsub ID: ", taxsub_id)

        const result = await AdminDeleteTaxSubcategory(taxsub_id)

        if(!result.status) {
            response = INTERNAL_SERVER_ERROR_API_RESPONSE
            response.message = "Error. Failed to delete tax subcategory."
            return res.status(response.status_code).json(response)
        }

        response = SUCCESS_API_RESPONSE
        response.message = "Tax subcategory deleted successfully."
        response.data = { taxsub_id: parseInt(taxsub_id), deleted: true }

        res.status(response.status_code).json(response)

    } catch (error) {
        console.log("Error Admin Delete Tax Subcategory: ", error)
        response = INTERNAL_SERVER_ERROR_API_RESPONSE
        response.message = "Error. An error occurred while deleting tax subcategory."
        res.status(response.status_code).json(response)
    }
})

module.exports = router
