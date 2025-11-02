const express = require('express')
const { DEFAULT_API_RESPONSE, INTERNAL_SERVER_ERROR_API_RESPONSE, SUCCESS_API_RESPONSE, FORBIDDEN_API_RESPONSE } = require('../../../configs/helper')
const { TaxCategoryList } = require('../../../models/AppModel/TaxCategories')
const router = express.Router()

router.get("/", async(req , res) => {
    let response = DEFAULT_API_RESPONSE
    try {
        let tax_category = await TaxCategoryList()
        if(tax_category.status) {
            response = SUCCESS_API_RESPONSE
            response.data = tax_category.data
        } else {
            response = FORBIDDEN_API_RESPONSE
            response.data = []
        }
    } catch (e) {
        response = INTERNAL_SERVER_ERROR_API_RESPONSE
        response.data = null
    } finally {
        return res.status(response.status_code).json(response)
    }
})
module.exports = router