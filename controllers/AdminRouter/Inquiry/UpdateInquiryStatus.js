const express = require('express')
const router = express.Router()
const { 
    DEFAULT_API_RESPONSE, 
    INTERNAL_SERVER_ERROR_API_RESPONSE,
    BAD_REQUEST_API_RESPONSE,
    SUCCESS_API_RESPONSE,
    UNAUTHORIZED_API_RESPONSE,
    ERROR_UNAUTHENTICATED,
    CHECK_EMPTY
} = require('../../../configs/helper')
const { UpdateInquiryStatus } = require('../../../models/AppModel/Inquiry')

/**
 * PUT /admin/inquiry/status/:inquiry_id
 * Update inquiry status
 * Body: { status }
 */
router.put("/:inquiry_id", async(req, res) => {
    let response = DEFAULT_API_RESPONSE
    let user = req.user || null

    if(CHECK_EMPTY(user)) {
        response = UNAUTHORIZED_API_RESPONSE
        response.message = ERROR_UNAUTHENTICATED
        return res.status(response.status_code).json(response)
    }

    try {
        const inquiry_id = req.params.inquiry_id
        const status = req.body.status

        console.log("Update Inquiry Status Request: ", { inquiry_id, status })

        // Validation
        const validStatuses = ['Active', 'Pending', 'In-Progress', 'Completed', 'Rejected', 'Deleted', 'Others']
        if(!status || !validStatuses.includes(status)) {
            response = BAD_REQUEST_API_RESPONSE
            response.message = `Error. Invalid status. Valid values are: ${validStatuses.join(', ')}`
            return res.status(response.status_code).json(response)
        }

        const result = await UpdateInquiryStatus(inquiry_id, status)

        if(!result.status) {
            response = INTERNAL_SERVER_ERROR_API_RESPONSE
            response.message = "Error. Failed to update inquiry status."
            return res.status(response.status_code).json(response)
        }

        if(result.data.affectedRows === 0) {
            response.status_code = 404
            response.status = "error"
            response.message = "Error. Inquiry not found."
            return res.status(response.status_code).json(response)
        }

        response = SUCCESS_API_RESPONSE
        response.message = "Inquiry status updated successfully."
        response.data = result.data

        return res.status(response.status_code).json(response)

    } catch (e) {
        console.log("Error Update Inquiry Status: ", e)
        response = INTERNAL_SERVER_ERROR_API_RESPONSE
        response.message = "Error. " + e.message
        return res.status(response.status_code).json(response)
    }
})

module.exports = router
