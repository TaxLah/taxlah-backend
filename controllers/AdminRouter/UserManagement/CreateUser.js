const express = require('express')
const router = express.Router()
const bcrypt = require('bcrypt')
const { 
    DEFAULT_API_RESPONSE, 
    INTERNAL_SERVER_ERROR_API_RESPONSE,
    BAD_REQUEST_API_RESPONSE,
    FORBIDDEN_API_RESPONSE,
    SUCCESS_API_RESPONSE,
    CHECK_EMPTY,
    sanitize,
    isValidEmail,
    isStrongPassword
} = require('../../../configs/helper')
const { AuthCheckExistingUsername, AuthCheckExistingEmail, AuthCreateAccessAccount } = require('../../../models/AppModel/Auth')
const { AccountCreate } = require('../../../models/AppModel/Account')
const { UserNotificationCreate } = require('../../../models/AppModel/Notification')

/**
 * POST /admin/users/create
 * Create new user account from admin side
 * Body: { account_username, account_password, account_name, account_fullname, account_email, account_phone, account_role }
 */
router.post("/", async(req, res) => {
    let response = DEFAULT_API_RESPONSE

    try {
        const params = req.body
        console.log("Admin Create User Request: ", params)

        const auth_username = params.account_username || null
        const auth_password = params.account_password || null
        const auth_role = params.account_role || "Individual"
        const account_name = params.account_name || null
        const account_fullname = params.account_fullname || null
        const account_email = params.account_email || null
        const account_phone = params.account_phone || null

        // Validation
        if(CHECK_EMPTY(auth_username)) {
            response = BAD_REQUEST_API_RESPONSE
            response.message = "Error. Username is required."
            return res.status(response.status_code).json(response)
        }

        if(CHECK_EMPTY(auth_password)) {
            response = BAD_REQUEST_API_RESPONSE
            response.message = "Error. Password is required."
            return res.status(response.status_code).json(response)
        }

        if(CHECK_EMPTY(account_name)) {
            response = BAD_REQUEST_API_RESPONSE
            response.message = "Error. Account name is required."
            return res.status(response.status_code).json(response)
        }

        if(CHECK_EMPTY(account_fullname)) {
            response = BAD_REQUEST_API_RESPONSE
            response.message = "Error. Full name is required."
            return res.status(response.status_code).json(response)
        }

        if(CHECK_EMPTY(account_email)) {
            response = BAD_REQUEST_API_RESPONSE
            response.message = "Error. Email is required."
            return res.status(response.status_code).json(response)
        }

        if(CHECK_EMPTY(account_phone)) {
            response = BAD_REQUEST_API_RESPONSE
            response.message = "Error. Phone number is required."
            return res.status(response.status_code).json(response)
        }

        if(!isStrongPassword(auth_password)) {
            response = BAD_REQUEST_API_RESPONSE
            response.message = "Error. Password must be at least 8 chars, 1 uppercase, 1 lowercase, 1 number, 1 special char."
            return res.status(response.status_code).json(response)
        }

        if(!isValidEmail(account_email)) {
            response = BAD_REQUEST_API_RESPONSE
            response.message = "Error. Invalid email format."
            return res.status(response.status_code).json(response)
        }

        // Validate role
        const validRoles = ['Individual', 'Business']
        if(!validRoles.includes(auth_role)) {
            response = BAD_REQUEST_API_RESPONSE
            response.message = `Error. Invalid role. Valid values: ${validRoles.join(', ')}`
            return res.status(response.status_code).json(response)
        }

        // Check for existing username and email
        const check_existing_username = await AuthCheckExistingUsername(auth_username)
        const check_existing_email = await AuthCheckExistingEmail(account_email)

        if(check_existing_username.status) {
            response = FORBIDDEN_API_RESPONSE
            response.message = "Error. Username already exists."
            return res.status(response.status_code).json(response)
        }

        if(check_existing_email.status) {
            response = FORBIDDEN_API_RESPONSE
            response.message = "Error. Email already exists."
            return res.status(response.status_code).json(response)
        }

        // Create account
        const account = {
            account_name: sanitize(account_name),
            account_fullname: sanitize(account_fullname),
            account_email: sanitize(account_email),
            account_contact: sanitize(account_phone),
            account_status: 'Active'
        }

        const profile = await AccountCreate(account)
        console.log("Admin Create Account Profile: ", profile)

        if(!profile.status) {
            response = INTERNAL_SERVER_ERROR_API_RESPONSE
            response.message = "Error. Failed to create user account."
            return res.status(response.status_code).json(response)
        }

        // Create auth access
        const account_id = profile.account_id
        const auth_password_hashed = await bcrypt.hash(auth_password, 15)

        const access = {
            auth_username: sanitize(auth_username),
            auth_usermail: sanitize(account_email),
            auth_password: auth_password_hashed,
            auth_role,
            auth_socmed: 'No',
            auth_is_verified: 'Yes',
            auth_status: 'Active',
            account_id: account_id
        }

        const auth_access = await AuthCreateAccessAccount(access)
        console.log("Admin Create Auth Access: ", auth_access)

        if(!auth_access.status) {
            response = INTERNAL_SERVER_ERROR_API_RESPONSE
            response.message = "Error. Failed to create authentication access."
            return res.status(response.status_code).json(response)
        }

        // Create welcome notification
        const notification = {
            account_id: account_id,
            notification_title: "Welcome to TaxLah!",
            notification_description: "Your account has been created by admin. You can now start managing your tax records.",
            read_status: 'No',
            archive_status: 'No',
            status: 'Active'
        }

        await UserNotificationCreate(notification)

        response = SUCCESS_API_RESPONSE
        response.message = "User account created successfully."
        response.data = {
            account_id: account_id,
            auth_id: auth_access.data,
            username: auth_username,
            email: account_email,
            role: auth_role
        }

        res.status(response.status_code).json(response)

    } catch (error) {
        console.log("Error Admin Create User: ", error)
        response = INTERNAL_SERVER_ERROR_API_RESPONSE
        response.message = "Error. An error occurred while creating user account."
        res.status(response.status_code).json(response)
    }
})

module.exports = router
