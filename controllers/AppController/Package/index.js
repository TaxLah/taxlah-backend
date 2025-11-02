const express = require('express')
const { DEFAULT_API_RESPONSE, INTERNAL_SERVER_ERROR_API_RESPONSE, SUCCESS_API_RESPONSE, FORBIDDEN_API_RESPONSE } = require('../../../configs/helper')
const { GetPackage } = require('../../../models/AppModel/Package')
const router = express.Router()

router.get("/", async(req , res) => {
    let response = DEFAULT_API_RESPONSE
    try {
        let package = await GetPackage()
        if(package.status) {
            response        = SUCCESS_API_RESPONSE
            response.data   = package.data
        } else {
            response        = FORBIDDEN_API_RESPONSE
            response.data   = null
        }
    } catch (e) {
        response        = INTERNAL_SERVER_ERROR_API_RESPONSE
        response.data   = null   
    } finally {
        return res.status(response.status_code).json(response)
    }
})
module.exports = router