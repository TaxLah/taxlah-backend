const express = require('express')
const { DEFAULT_API_RESPONSE, INTERNAL_SERVER_ERROR_API_RESPONSE, SUCCESS_API_RESPONSE, FORBIDDEN_API_RESPONSE, ERROR_TECHNICAL_ERROR } = require('../../../configs/helper')
const { UserNotificationGetList, UserNotificationGetInfo } = require('../../../models/AppModel/Notification')
const router = express.Router()

router.get("/", async(req , res) => {
    let response    = DEFAULT_API_RESPONSE
    let user        = req.user

    let page        = req.query.page || 1
    let limit       = req.query.limit || 10
    let offset      = (page - 1) * limit

    try {
        
        let account_id = user.account_id
        let list = await UserNotificationGetList({ account_id, offset, limit })
        if(list.status) {
            response            = SUCCESS_API_RESPONSE
            response.message    = "Success"
            response.data       = list.data
        } else {
            response            = FORBIDDEN_API_RESPONSE
            response.message    = ERROR_TECHNICAL_ERROR
            response.data       = list.data
        }
    } catch (e) {
        response = INTERNAL_SERVER_ERROR_API_RESPONSE
        response.data = null  
    } 

    return res.status(response.status_code).json(response)
})

router.get("/:id", async(req , res) => {
    let response    = DEFAULT_API_RESPONSE
    let user        = req.user
    let id          = req.params.id

    try {
        
        let account_id = user.account_id
        let list = await UserNotificationGetInfo(account_id, id)
        if(list.status) {
            response            = SUCCESS_API_RESPONSE
            response.message    = "Success"
            response.data       = list.data
        } else {
            response            = FORBIDDEN_API_RESPONSE
            response.message    = ERROR_TECHNICAL_ERROR
            response.data       = list.data
        }
    } catch (e) {
        response = INTERNAL_SERVER_ERROR_API_RESPONSE
        response.data = null  
    } 

    return res.status(response.status_code).json(response)
})
module.exports = router