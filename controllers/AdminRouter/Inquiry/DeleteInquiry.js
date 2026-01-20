const express = require('express')
const router = express.Router()
const { 
    DEFAULT_API_RESPONSE, 
    INTERNAL_SERVER_ERROR_API_RESPONSE,
    SUCCESS_API_RESPONSE,
    UNAUTHORIZED_API_RESPONSE,
    ERROR_UNAUTHENTICATED,
    CHECK_EMPTY
} = require('../../../configs/helper')
const { DeleteInquiry } = require('../../../models/AppModel/Inquiry')

/**
 * DELETE /admin/inquiry/delete/:inquiry_id
 * Delete inquiry (soft delete)
 */
router.delete("/:inquiry_id", async(req, res) => {
    let response = DEFAULT_API_RESPONSE
    let user = req.user || null

    if(CHECK_EMPTY(user)) {
        response = UNAUTHORIZED_API_RESPONSE
        response.message = ERROR_UNAUTHENTICATED
        return res.status(response.status_code).json(response)
    }

    try {
        const inquiry_id = req.params.inquiry_id

        console.log("Delete Inquiry Request: ", inquiry_id)

        const result = await DeleteInquiry(inquiry_id)

        if(!result.status) {
            response = INTERNAL_SERVER_ERROR_API_RESPONSE
            response.message = "Error. Failed to delete inquiry."
            return res.status(response.status_code).json(response)
        }

        if(result.data.affectedRows === 0) {
            response.status_code = 404
            response.status = "error"
            response.message = "Error. Inquiry not found."
            return res.status(response.status_code).json(response)
        }

        response = SUCCESS_API_RESPONSE
        response.message = "Inquiry deleted successfully."
        response.data = result.data

        return res.status(response.status_code).json(response)

    } catch (e) {
        console.log("Error Delete Inquiry: ", e)
        response = INTERNAL_SERVER_ERROR_API_RESPONSE
        response.message = "Error. " + e.message
        return res.status(response.status_code).json(response)
    }
})

module.exports = router
