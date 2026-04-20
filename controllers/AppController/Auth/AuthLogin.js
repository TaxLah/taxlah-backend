const express = require('express')
const { DEFAULT_API_RESPONSE, INTERNAL_SERVER_ERROR_API_RESPONSE, ERROR_TECHNICAL_ERROR, CHECK_EMPTY, BAD_REQUEST_API_RESPONSE, FORBIDDEN_API_RESPONSE, UNAUTHORIZED_API_RESPONSE, CREATE_ACCESS_TOKEN, CREATE_REFRESH_TOKEN, SUCCESS_API_RESPONSE } = require('../../../configs/helper')
const { AuthCheckExistingUsername, AuthCheckExistingEmail, AuthLogin } = require('../../../models/AppModel/Auth')
const router    = express.Router()
const bcrypt    = require('bcrypt');
const moment = require('moment');
const { UserNotificationCreate } = require('../../../models/AppModel/Notification');
const { AccountGetInfo } = require('../../../models/AppModel/Account');
const { addAutoClaimReliefs } = require('../../../models/AppModel/TaxClaimServices');

router.post("/", async(req , res) => {
    let response        = DEFAULT_API_RESPONSE
    let auth_username   = null
    let auth_password   = null

    try {

        let params = req.body
        console.log("Log Params : ", params)

        auth_username = params.auth_username || null
        auth_password = params.auth_password || null

        if(CHECK_EMPTY(auth_username)) {
            response = BAD_REQUEST_API_RESPONSE
            response.message = "Error. Parameter account username is undefined or empty."
        } else if(CHECK_EMPTY(auth_password)) {
            response = BAD_REQUEST_API_RESPONSE
            response.message = "Error. Parameter account password is undefined or empty."
        } else {
            let check_username = await AuthCheckExistingUsername(auth_username)
            console.log("Log Function Check Username : ", check_username)

            let check_email = await AuthCheckExistingEmail(auth_username)
            console.log("Log Function Check Email : ", check_email)

            if(check_username.status === false && check_email.status === false) {
                response = FORBIDDEN_API_RESPONSE
                response.message = "Error. Account with username is not exist or invalid account username."
            } else {
                let auth_id = check_username.data.auth_id || check_email.data.auth_id
                let login   = await AuthLogin(auth_id)
                console.log("Log Function Auth Login : ", login)

                if(!login.status) {
                    response = FORBIDDEN_API_RESPONSE
                    response.message = "Error! Accout with account username is not exist or suspended. Please contact support for more information."
                } else {

                    let user_password = login.data.auth_password
                    let compare = await bcrypt.compare(auth_password, user_password)

                    if(!compare) {
                        response = UNAUTHORIZED_API_RESPONSE
                        response.message = "Error. Account username or password is incorrect. Please try again."
                        response.data = null
                    } else {

                        let user_profile = await AccountGetInfo(login.data.account_id)
                        let profile = {
                            uid: login.data.auth_id,
                            aid: check_username.data.account_id,
                            username: login.data.auth_username,
                            usermail: login.data.auth_usermail,
                            ...user_profile.data
                        }

                        let access_token    = await CREATE_ACCESS_TOKEN(profile)
                        let refresh_token   = await CREATE_REFRESH_TOKEN(profile)

                        let fcm_title           = `Login Successful`
                        let fcm_text            = `You've successful logged in at ${moment().format("DD MMM YYYY, hh:mm A")}.`
                        let user_notification   = await UserNotificationCreate({ 
                            account_id: check_username.data.account_id,
                            notification_title: fcm_title,
                            notification_description: fcm_text,
                            read_status: 'No',
                            archive_status: 'No',
                            status: 'Active'
                        })

                        // Trigger tax claim initialisation for current year (non-blocking)
                        const currentYear = new Date().getFullYear();
                        addAutoClaimReliefs(login.data.account_id, currentYear)
                            .catch(err => console.error('[AuthLogin] Tax init error:', err.message));

                        response                = SUCCESS_API_RESPONSE
                        response.status_code    = 200
                        response.message        = "Login Successful."
                        response.data = {
                            profile: profile,
                            access_token,
                            refresh_token
                        }
                    }
                }
            }
        }
        
    } catch (e) {
        console.log("err : ", e)
        response            = INTERNAL_SERVER_ERROR_API_RESPONSE
        response.message    = ERROR_TECHNICAL_ERROR
        response.data       = null
    } finally {
        return res.status(response.status_code).json(response)
    }
})
module.exports = router