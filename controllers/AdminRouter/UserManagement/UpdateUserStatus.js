const express = require('express')
const router = express.Router()
const { 
    DEFAULT_API_RESPONSE, 
    INTERNAL_SERVER_ERROR_API_RESPONSE,
    BAD_REQUEST_API_RESPONSE,
    SUCCESS_API_RESPONSE,
    CHECK_EMPTY
} = require('../../../configs/helper')
const { AdminUpdateUserStatus } = require('../../../models/AdminModel/UserManagement')

/**
 * PATCH /admin/users/status/:account_id
 * Update user account status
 * Body: { status: 'Pending' | 'Active' | 'Suspended' | 'Others' }
 */
router.patch("/:account_id", async(req, res) => {
    let response = DEFAULT_API_RESPONSE

    try {
        const account_id = req.params.account_id
        const { status } = req.body

        if(CHECK_EMPTY(account_id)) {
            response = BAD_REQUEST_API_RESPONSE
            response.message = "Error. Account ID is required."
            return res.status(response.status_code).json(response)
        }

        if(CHECK_EMPTY(status)) {
            response = BAD_REQUEST_API_RESPONSE
            response.message = "Error. Status is required."
            return res.status(response.status_code).json(response)
        }

        const validStatuses = ['Pending', 'Active', 'Suspended', 'Others']
        if(!validStatuses.includes(status)) {
            response = BAD_REQUEST_API_RESPONSE
            response.message = `Error. Invalid status. Valid values: ${validStatuses.join(', ')}`
            return res.status(response.status_code).json(response)
        }

        console.log("Admin Update User Status Request - Account ID: ", account_id, " Status: ", status)

        const result = await AdminUpdateUserStatus(account_id, status)

        if(!result.status) {
            response = INTERNAL_SERVER_ERROR_API_RESPONSE
            response.message = "Error. Failed to update user status."
            return res.status(response.status_code).json(response)
        }

        response = SUCCESS_API_RESPONSE
        response.message = "User status updated successfully."
        response.data = { account_id: parseInt(account_id), status: status }

        res.status(response.status_code).json(response)

    } catch (error) {
        console.log("Error Admin Update User Status: ", error)
        response = INTERNAL_SERVER_ERROR_API_RESPONSE
        response.message = "Error. An error occurred while updating user status."
        res.status(response.status_code).json(response)
    }
})

module.exports = router
