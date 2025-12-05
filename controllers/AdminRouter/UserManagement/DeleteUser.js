const express = require('express')
const router = express.Router()
const { 
    DEFAULT_API_RESPONSE, 
    INTERNAL_SERVER_ERROR_API_RESPONSE,
    BAD_REQUEST_API_RESPONSE,
    SUCCESS_API_RESPONSE,
    CHECK_EMPTY
} = require('../../../configs/helper')
const { AdminDeleteUser } = require('../../../models/AdminModel/UserManagement')

/**
 * DELETE /admin/users/delete/:account_id
 * Delete user account (CASCADE will delete all related data)
 */
router.delete("/:account_id", async(req, res) => {
    let response = DEFAULT_API_RESPONSE

    try {
        const account_id = req.params.account_id

        if(CHECK_EMPTY(account_id)) {
            response = BAD_REQUEST_API_RESPONSE
            response.message = "Error. Account ID is required."
            return res.status(response.status_code).json(response)
        }

        console.log("Admin Delete User Request - Account ID: ", account_id)

        const result = await AdminDeleteUser(account_id)

        if(!result.status) {
            response = INTERNAL_SERVER_ERROR_API_RESPONSE
            response.message = "Error. Failed to delete user account."
            return res.status(response.status_code).json(response)
        }

        response = SUCCESS_API_RESPONSE
        response.message = "User account deleted successfully."
        response.data = { account_id: parseInt(account_id), deleted: true }

        res.status(response.status_code).json(response)

    } catch (error) {
        console.log("Error Admin Delete User: ", error)
        response = INTERNAL_SERVER_ERROR_API_RESPONSE
        response.message = "Error. An error occurred while deleting user account."
        res.status(response.status_code).json(response)
    }
})

module.exports = router
