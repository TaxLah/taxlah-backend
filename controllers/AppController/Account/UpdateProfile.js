const express = require('express')
const { DEFAULT_API_RESPONSE, CHECK_EMPTY, UNAUTHORIZED_API_RESPONSE, ERROR_UNAUTHENTICATED, INTERNAL_SERVER_ERROR_API_RESPONSE, BAD_REQUEST_API_RESPONSE, FORBIDDEN_API_RESPONSE, SUCCESS_API_RESPONSE, CREATE_ACCESS_TOKEN, CREATE_REFRESH_TOKEN } = require('../../../configs/helper')
const { AccountUpdate, AccountGetInfo } = require('../../../models/AppModel/Account')
const { AuthCheckExistingUsername } = require('../../../models/AppModel/Auth')
const moment = require('moment');
const { UserNotificationCreate } = require('../../../models/AppModel/Notification');
const router = express.Router()

router.patch("/", async(req , res) => {
    let response    = DEFAULT_API_RESPONSE
    let user        = req.user || null

    let account_name                = null
    let account_fullname            = null
    let account_contact             = null
    let account_address_1           = null
    let account_address_2           = null
    let account_address_3           = null
    let account_address_postcode    = null
    let account_address_city        = null
    let account_address_state       = null

    let account_ic                  = null
    let account_gender              = null
    let account_dob                 = null
    let account_age                 = null
    let account_nationality         = null
    let account_salary_range        = null

    if(CHECK_EMPTY(user)) {
        response = UNAUTHORIZED_API_RESPONSE
        response.message = ERROR_UNAUTHENTICATED
        return res.status(response.status_code).json(response)
    }

    try {

        let params = req.body
        console.log("Log Params Update Account : ", params)

        account_name                = params.account_name || null
        account_fullname            = params.account_fullname || null
        account_contact             = params.account_phone || null
        account_address_1           = params.account_address_1 || null
        account_address_2           = params.account_address_2 || null
        account_address_3           = params.account_address_3 || null
        account_address_postcode    = params.account_postcode || null
        account_address_city        = params.account_city || null
        account_address_state       = params.account_state || null

        account_ic                  = params.account_ic || null
        account_gender              = params.account_gender || null                 
        account_dob                 = params.account_dob                 
        account_age                 = params.account_age || null
        account_nationality         = params.account_nationality || null                 
        account_salary_range        = params.account_salary_range || null                   

        if(CHECK_EMPTY(account_name)) {
            response = BAD_REQUEST_API_RESPONSE
            response.message = "Error. Parameter account name undefined or cannot be empty."
            return res.status(response.status_code).json(response)
        } else if(CHECK_EMPTY(account_fullname)) {
            response = BAD_REQUEST_API_RESPONSE
            response.message = "Error. Parameter account fullname undefined or cannot be empty."
            return res.status(response.status_code).json(response)
        } else if(CHECK_EMPTY(account_contact)) {
            response = BAD_REQUEST_API_RESPONSE
            response.message = "Error. Parameter account phone undefined or cannot be empty."
            return res.status(response.status_code).json(response)
        } else if(CHECK_EMPTY(account_address_1)) {
            response = BAD_REQUEST_API_RESPONSE
            response.message = "Error. Parameter account address undefined or cannot be empty."
            return res.status(response.status_code).json(response)
        } else if(CHECK_EMPTY(account_address_postcode)) {
            response = BAD_REQUEST_API_RESPONSE
            response.message = "Error. Parameter account address postcode undefined or cannot be empty."
            return res.status(response.status_code).json(response)
        } else if(CHECK_EMPTY(account_address_city)) {
            response = BAD_REQUEST_API_RESPONSE
            response.message = "Error. Parameter account address city undefined or cannot be empty."
            return res.status(response.status_code).json(response)
        } else if(CHECK_EMPTY(account_address_state)) {
            response = BAD_REQUEST_API_RESPONSE
            response.message = "Error. Parameter account address state undefined or cannot be empty."
            return res.status(response.status_code).json(response)
        } else {

            let account_id      = user.account_id
            let json            = { 
                account_id, 
                account_name, 
                account_fullname, 
                account_contact,
                account_ic,
                account_gender,
                account_dob,
                account_age,
                account_nationality,
                account_salary_range,
                account_address_1, 
                account_address_2, 
                account_address_3, 
                account_address_postcode, 
                account_address_city, 
                account_address_state 
            }
            let updateProfile   = await AccountUpdate(json)
            console.log("Log Function Update Profile : ", updateProfile)

            if(updateProfile.status) {
                let auth            = await AuthCheckExistingUsername(user.username) 
                let user_profile    = await AccountGetInfo(account_id)
                let profile         = {
                    uid: auth.data.auth_id,
                    aid: auth.data.account_id,
                    username: auth.data.auth_username,
                    usermail: auth.data.auth_usermail,
                    ...user_profile.data
                }
                let access_token    = await CREATE_ACCESS_TOKEN(profile)
                let refresh_token   = await CREATE_REFRESH_TOKEN(profile)

                let fcm_title           = `Update Profile Successful`
                let fcm_text            = `You've successful update your profile at ${moment().format("DD MMM YYYY, hh:mm A")}.`
                let user_notification   = await UserNotificationCreate({ 
                    account_id: auth.data.account_id,
                    notification_title: fcm_title,
                    notification_description: fcm_text,
                    read_status: 'No',
                    archive_status: 'No',
                    status: 'Active'
                })

                response = SUCCESS_API_RESPONSE
                response.message = "Login Successful."
                response.data = {
                    profile: profile,
                    access_token,
                    refresh_token
                }
            } else {
                response            = FORBIDDEN_API_RESPONSE
                response.message    = "Error. Unable to update your profile. Please make sure all required information are not empty or undefined."
                response.data       = null
            }
            return res.status(response.status_code).json(response)
        }
        
    } catch (e) {
        response = INTERNAL_SERVER_ERROR_API_RESPONSE
        response.data = null
    } 

    return res.status(response.status_code).json(response)
})
module.exports = router