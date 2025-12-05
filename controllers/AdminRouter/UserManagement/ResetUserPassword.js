const express = require('express')
const router = express.Router()
const bcrypt = require('bcrypt')
const { 
    DEFAULT_API_RESPONSE, 
    INTERNAL_SERVER_ERROR_API_RESPONSE,
    BAD_REQUEST_API_RESPONSE,
    NOT_FOUND_API_RESPONSE,
    SUCCESS_API_RESPONSE,
    CHECK_EMPTY,
    isStrongPassword
} = require('../../../configs/helper')
const { AdminGetUserDetails } = require('../../../models/AdminModel/UserManagement')
const { AuthUpdateAccessAccount } = require('../../../models/AppModel/Auth')
const { UserNotificationCreate } = require('../../../models/AppModel/Notification')

/**
 * PATCH /admin/users/reset-password/:account_id
 * Reset user password from admin side
 * Body: { new_password }
 */
router.patch("/:account_id", async(req, res) => {
    let response = DEFAULT_API_RESPONSE

    try {
        const account_id = req.params.account_id
        const { new_password } = req.body

        if(CHECK_EMPTY(account_id)) {
            response = BAD_REQUEST_API_RESPONSE
            response.message = "Error. Account ID is required."
            return res.status(response.status_code).json(response)
        }

        if(CHECK_EMPTY(new_password)) {
            response = BAD_REQUEST_API_RESPONSE
            response.message = "Error. New password is required."
            return res.status(response.status_code).json(response)
        }

        if(!isStrongPassword(new_password)) {
            response = BAD_REQUEST_API_RESPONSE
            response.message = "Error. Password must be at least 8 chars, 1 uppercase, 1 lowercase, 1 number, 1 special char."
            return res.status(response.status_code).json(response)
        }

        console.log("Admin Reset User Password Request - Account ID: ", account_id)

        // Check if user exists
        const userDetails = await AdminGetUserDetails(account_id)

        if(!userDetails.status) {
            response = NOT_FOUND_API_RESPONSE
            response.message = "Error. User not found."
            return res.status(response.status_code).json(response)
        }

        // Check if user has auth access
        if(!userDetails.data.auth_id) {
            response = NOT_FOUND_API_RESPONSE
            response.message = "Error. User authentication record not found."
            return res.status(response.status_code).json(response)
        }

        // Hash new password
        const auth_password_hashed = await bcrypt.hash(new_password, 15)

        // Update password
        const updateData = {
            auth_id: userDetails.data.auth_id,
            auth_password: auth_password_hashed
        }

        const result = await AuthUpdateAccessAccount(updateData)

        if(!result.status) {
            response = INTERNAL_SERVER_ERROR_API_RESPONSE
            response.message = "Error. Failed to reset user password."
            return res.status(response.status_code).json(response)
        }

        // Create notification for user
        const notification = {
            account_id: parseInt(account_id),
            notification_title: "Password Reset",
            notification_description: "Your password has been reset by admin. Please use your new password to login.",
            read_status: 'No',
            archive_status: 'No',
            status: 'Active'
        }

        await UserNotificationCreate(notification)

        response = SUCCESS_API_RESPONSE
        response.message = "User password reset successfully."
        response.data = {
            account_id: parseInt(account_id),
            auth_id: userDetails.data.auth_id,
            reset_at: new Date().toISOString()
        }

        res.status(response.status_code).json(response)

    } catch (error) {
        console.log("Error Admin Reset User Password: ", error)
        response = INTERNAL_SERVER_ERROR_API_RESPONSE
        response.message = "Error. An error occurred while resetting user password."
        res.status(response.status_code).json(response)
    }
})

module.exports = router
