const express = require('express')
const { DEFAULT_API_RESPONSE, INTERNAL_SERVER_ERROR_API_RESPONSE, SUCCESS_API_RESPONSE, FORBIDDEN_API_RESPONSE, ERROR_TECHNICAL_ERROR } = require('../../../configs/helper')
const { AccountDelete } = require('../../../models/AppModel/Account')
const router = express.Router()

router.delete("/", async(req , res) => {
    let response    = DEFAULT_API_RESPONSE
    let user        = req.user

    try {
        
        let delete_profile = await AccountDelete(user.account_id)
        if(delete_profile.status) {
            response = SUCCESS_API_RESPONSE
            response.message = "Your account and access has been deleted successfully."
        } else {
            response = FORBIDDEN_API_RESPONSE
            response.message = ERROR_TECHNICAL_ERROR
        }
        return res.status(response.status_code).json(response)
    } catch (e) {
        console.log("[ERROR-API-DELETE-PROFILE] : ", e)
        response = INTERNAL_SERVER_ERROR_API_RESPONSE
    }

    return res.status(response.status_code).json(response)
})
module.exports = router