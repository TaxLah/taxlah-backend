const express = require('express')
const { DEFAULT_API_RESPONSE, CHECK_EMPTY, UNAUTHORIZED_API_RESPONSE, ERROR_UNAUTHENTICATED, INTERNAL_SERVER_ERROR_API_RESPONSE, SUCCESS_API_RESPONSE, FORBIDDEN_API_RESPONSE, ERROR_TECHNICAL_ERROR } = require('../../../configs/helper')
const { AccountGetInfo } = require('../../../models/AppModel/Account')
const router = express.Router()

router.get("/", async(req , res) => {
    let response    = DEFAULT_API_RESPONSE
    let user        = req.user || null

    if(CHECK_EMPTY(user)) {
        response = UNAUTHORIZED_API_RESPONSE
        response.message = ERROR_UNAUTHENTICATED
        return res.status(response.status_code).json(response)
    }

    try {
        let profile = await AccountGetInfo(user.account_id)
        if(profile.status) {
            response = SUCCESS_API_RESPONSE
            response.message = "Success"
            response.data = profile.data
        } else {
            response = FORBIDDEN_API_RESPONSE
            response.message = ERROR_TECHNICAL_ERROR
            response.data = null
        }
    } catch (e) {
        response = INTERNAL_SERVER_ERROR_API_RESPONSE
        response.data = null
    }

    return res.status(response.status_code).json(response)
})
module.exports = router