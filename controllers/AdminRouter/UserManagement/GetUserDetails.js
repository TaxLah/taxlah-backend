const express = require('express')
const router = express.Router()
const { 
    DEFAULT_API_RESPONSE, 
    INTERNAL_SERVER_ERROR_API_RESPONSE,
    BAD_REQUEST_API_RESPONSE,
    NOT_FOUND_API_RESPONSE,
    SUCCESS_API_RESPONSE,
    CHECK_EMPTY
} = require('../../../configs/helper')
const { AdminGetUserDetails } = require('../../../models/AdminModel/UserManagement')

/**
 * GET /admin/users/view/:account_id
 * Get detailed user information
 */
router.get("/:account_id", async(req, res) => {
    let response = DEFAULT_API_RESPONSE

    try {
        const account_id = req.params.account_id

        if(CHECK_EMPTY(account_id)) {
            response = BAD_REQUEST_API_RESPONSE
            response.message = "Error. Account ID is required."
            return res.status(response.status_code).json(response)
        }

        console.log("Admin Get User Details Request - Account ID: ", account_id)

        const result = await AdminGetUserDetails(account_id)

        if(!result.status) {
            response = NOT_FOUND_API_RESPONSE
            response.message = "Error. User not found."
            return res.status(response.status_code).json(response)
        }

        response = SUCCESS_API_RESPONSE
        response.message = "User details retrieved successfully."
        response.data = result.data

        res.status(response.status_code).json(response)

    } catch (error) {
        console.log("Error Admin Get User Details: ", error)
        response = INTERNAL_SERVER_ERROR_API_RESPONSE
        response.message = "Error. An error occurred while retrieving user details."
        res.status(response.status_code).json(response)
    }
})

module.exports = router
