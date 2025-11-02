const express = require('express')
const { auth } = require('../../../configs/auth')
const { DEFAULT_API_RESPONSE, INTERNAL_SERVER_ERROR_API_RESPONSE, CHECK_EMPTY, BAD_REQUEST_API_RESPONSE, SUCCESS_API_RESPONSE, FORBIDDEN_API_RESPONSE } = require('../../../configs/helper')
const { DeviceCreate, DeviceUpdate } = require('../../../models/AppModel/Device')
const router = express.Router()

router.post("/", auth(), async(req , res) => {
    let response    = DEFAULT_API_RESPONSE
    let user        = req.user

    let device_uuid         = null
    let device_name         = null
    let device_os           = null
    let device_enable_fcm   = null
    let device_fcm_token    = null

    try {
        let params = req.body
        console.log("Log Params : ", params)

        device_uuid         = params.device_uuid || null
        device_name         = params.device_name || null
        device_os           = params.device_os || null
        device_enable_fcm   = params.device_enable_fcm || "Yes"
        device_fcm_token    = params.device_fcm_token || null

        if(CHECK_EMPTY(device_uuid)) {
            response = BAD_REQUEST_API_RESPONSE
            response.message = "Error. Parameter device uuid is undefined or empty."
        } else if(CHECK_EMPTY(device_name)) {
            response = BAD_REQUEST_API_RESPONSE
            response.message = "Error. Parameter device name is undefined or empty."
        } else if(CHECK_EMPTY(device_os)) {
            response = BAD_REQUEST_API_RESPONSE
            response.message = "Error. Parameter device operating system is undefined or empty."
        } else if(device_os !== 'Android' && device_os !== 'IOS') {
            response = BAD_REQUEST_API_RESPONSE
            response.message = "Error. Invalid value for parameter device operating system. Please select either Android or IOS."
        } else if(CHECK_EMPTY(device_enable_fcm)) {
            response = BAD_REQUEST_API_RESPONSE
            response.message = "Error. Parameter device enable push notification is undefined or empty."
        } else {
            let account_id = user.account_id
            let json = {
                account_id,
                device_uuid,
                device_name,
                device_os,
                device_enable_fcm,
                device_fcm_token
            }
            let create_device = await DeviceCreate(json)
            if(create_device.status) {
                response = SUCCESS_API_RESPONSE
                response.data = create_device.data
            } else {
                response = FORBIDDEN_API_RESPONSE
                response.message = "Error. Unable to create device account. Please make sure all required field is not empty or undefined."
                response.data = null
            }
        }
    } catch (e) {
        response = INTERNAL_SERVER_ERROR_API_RESPONSE
        response.data = null
    } finally {
        return res.status(response.status_code).json(response)
    }
})

router.patch("/:device_id", auth(), async(req , res) => {
    let response    = DEFAULT_API_RESPONSE
    let user        = req.user

    let device_id           = req.params.device_id
    let device_uuid         = null
    let device_name         = null
    let device_os           = null
    let device_enable_fcm   = null
    let device_fcm_token    = null

    try {
        let params = req.body
        console.log("Log Params : ", params)

        device_uuid         = params.device_uuid || null
        device_name         = params.device_name || null
        device_os           = params.device_os || null
        device_enable_fcm   = params.device_enable_fcm || "Yes"
        device_fcm_token    = params.device_fcm_token || null

        if(CHECK_EMPTY(device_id)) {
            response = BAD_REQUEST_API_RESPONSE
            response.message = "Error. Parameter device id is undefined or empty."
        } else if(CHECK_EMPTY(device_uuid)) {
            response = BAD_REQUEST_API_RESPONSE
            response.message = "Error. Parameter device uuid is undefined or empty."
        } else if(CHECK_EMPTY(device_name)) {
            response = BAD_REQUEST_API_RESPONSE
            response.message = "Error. Parameter device name is undefined or empty."
        } else if(CHECK_EMPTY(device_os)) {
            response = BAD_REQUEST_API_RESPONSE
            response.message = "Error. Parameter device operating system is undefined or empty."
        } else if(device_os !== 'Android' && device_os !== 'IOS') {
            response = BAD_REQUEST_API_RESPONSE
            response.message = "Error. Invalid value for parameter device operating system. Please select either Android or IOS."
        } else if(CHECK_EMPTY(device_enable_fcm)) {
            response = BAD_REQUEST_API_RESPONSE
            response.message = "Error. Parameter device enable push notification is undefined or empty."
        } else {
            let account_id = user.account_id
            let json = {
                account_id,
                device_id,
                device_uuid,
                device_name,
                device_os,
                device_enable_fcm,
                device_fcm_token
            }
            let create_device = await DeviceUpdate(json)
            if(create_device.status) {
                response = SUCCESS_API_RESPONSE
                response.data = create_device.data
            } else {
                response = FORBIDDEN_API_RESPONSE
                response.message = "Error. Unable to update device account. Please make sure all required field is not empty or undefined."
                response.data = null
            }
        }
    } catch (e) {
        response = INTERNAL_SERVER_ERROR_API_RESPONSE
        response.data = null
    } finally {
        return res.status(response.status_code).json(response)
    }
})
module.exports = router