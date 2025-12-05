const express = require('express')
const { DEFAULT_API_RESPONSE, INTERNAL_SERVER_ERROR_API_RESPONSE, CHECK_EMPTY, BAD_REQUEST_API_RESPONSE, FORBIDDEN_API_RESPONSE, isStrongPassword, isValidEmail, sanitize, SUCCESS_API_RESPONSE, SEND_EMAIL_NOTIFICATION } = require('../../../configs/helper')
const { AuthCheckExistingUsername, AuthCheckExistingEmail, AuthCreateAccessAccount } = require('../../../models/AppModel/Auth')
const { AccountCreate, AccountDelete } = require('../../../models/AppModel/Account')
const router = express.Router()
const bcrypt    = require('bcrypt');
const { OnboardingEmail } = require('../../../configs/email')
const { UserNotificationCreate } = require('../../../models/AppModel/Notification')

router.post("/", async(req , res) => {
    let response            = DEFAULT_API_RESPONSE
    let auth_username       = null
    let auth_password       = null
    let auth_role           = "Individual"
    let account_name        = null
    let account_fullname    = null
    let account_email       = null
    let account_phone       = null

    try {
        
        let params = req.body
        console.log("Log Params : ", params)

        auth_username       = params.account_username || null
        auth_password       = params.account_password || null
        auth_role           = params.account_role || "Individual"
        account_name        = params.account_name || null
        account_fullname    = params.account_fullname || null
        account_email       = params.account_email || null
        account_phone       = params.account_phone || null

        if(CHECK_EMPTY(auth_username)) {
            response = BAD_REQUEST_API_RESPONSE
            response.message = "Error. Undefined parameter account username or field is empty."
        } else if(CHECK_EMPTY(auth_password)) {
            response = BAD_REQUEST_API_RESPONSE
            response.message = "Error. Undefined parameter account password or field is empty."
        } else if(CHECK_EMPTY(account_name)) {
            response = BAD_REQUEST_API_RESPONSE
            response.message = "Error. Undefined parameter account name or field is empty."
        } else if(CHECK_EMPTY(account_fullname)) {
            response = BAD_REQUEST_API_RESPONSE
            response.message = "Error. Undefined parameter account fullname or field is empty."
        } else if(CHECK_EMPTY(account_email)) {
            response = BAD_REQUEST_API_RESPONSE
            response.message = "Error. Undefined parameter account email or field is empty."
        } else if(CHECK_EMPTY(account_phone)) {
            response = BAD_REQUEST_API_RESPONSE
            response.message = "Error. Undefined parameter account contact number or field is empty."
        } else if(!isStrongPassword(auth_password)) {
            response = BAD_REQUEST_API_RESPONSE
            response.message = "Error. Password need to be at least 8 chars, 1 uppercase, 1 lowercase, 1 number, 1 special char."
        } else if(!isValidEmail(account_email)) {
            response = BAD_REQUEST_API_RESPONSE
            response.message = "Error. Email account is not valid or invalid email format."
        } 
        else {

            let check_existing_username = await AuthCheckExistingUsername(auth_username)
            let check_existing_email    = await AuthCheckExistingEmail(account_email)

            console.log("Log check_existing_username : ", check_existing_username)
            console.log("Log check_existing_email : ", check_existing_email)

            if(check_existing_username.status) {
                response = FORBIDDEN_API_RESPONSE
                response.message = "Error. Account with current username has already exist."
            } else if(check_existing_email.status) {
                response = FORBIDDEN_API_RESPONSE
                response.message = "Error. Account with current email has already exist."
            } else {

                let account = {
                    account_name: sanitize(account_name),
                    account_fullname: sanitize(account_fullname),
                    account_email: sanitize(account_email),
                    account_contact: sanitize(account_phone),
                    account_status: 'Active'
                }

                let profile = await AccountCreate(account)
                console.log("Log Function Create Account Profile : ", profile)
                

                if(profile.status) {

                    let account_id              = profile.account_id
                    let auth_password_hashed    = await bcrypt.hash(auth_password, 15)

                    let access = {
                        auth_username: sanitize(auth_username),
                        auth_usermail: sanitize(account_email),
                        auth_password: auth_password_hashed,
                        auth_role,
                        auth_socmed: 'No',
                        auth_is_verified: 'Yes',
                        auth_status: 'Active',
                        account_id: account_id
                    }

                    let auth_access = await AuthCreateAccessAccount(access)
                    console.log("Log Function Create Auth Access Account : ", auth_access)

                    if(auth_access.status) {
                        response            = SUCCESS_API_RESPONSE
                        response.message    = "Congratulation! Your account has been created successfully."
                        response.data       = null

                        let fcm_title       = "TaxLah Account Successfully Register"
                        let fcm_text        = "Congratulation! Your TaxLah account has been registered successfully. We're thrilled to have you on board. Your account has been successfully created, and you're now ready to simplify your tax filing journey with TaxLah."
                        let create_fcm      = await UserNotificationCreate({ 
                            account_id: profile.account_id, 
                            notification_title: fcm_title,
                            notification_description: fcm_text,
                            read_status: 'No',
                            archive_status: 'No',
                            status: 'Active'
                        })

                        let email_title     = "TaxLah Account Successfully Register."
                        let email_body      = "Congratulation! Your TaxLah account has been registered successfully. We're thrilled to have you on board. Your account has been successfully created, and you're now ready to simplify your tax filing journey with TaxLah."
                        let email_html      = OnboardingEmail(account_fullname || auth_username )
                        let send_email      = await SEND_EMAIL_NOTIFICATION(account_email, email_title, email_body, email_html)

                    } else {
                        let delete_account  = await AccountDelete(profile.account_id)
                        response            = FORBIDDEN_API_RESPONSE
                        response.message    = "System Error! We're sorry that we could not create your account. Please make sure all required information are not left empty."
                        response.data       = null
                    }

                } else {
                    response            = INTERNAL_SERVER_ERROR_API_RESPONSE
                    response.message    = "Error. Unable to create account profile. Please make sure all required field is not empty or format is correct."
                    response.data       = null
                }
            }
        }
    } catch (e) {
        response = INTERNAL_SERVER_ERROR_API_RESPONSE
        response.message = "Error! Please contact our support for more information."
    } finally {
        return res.status(response.status_code).json(response)
    }
})

module.exports = router