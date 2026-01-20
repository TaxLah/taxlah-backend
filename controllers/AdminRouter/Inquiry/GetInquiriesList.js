const express = require('express')
const router = express.Router()
const { 
    DEFAULT_API_RESPONSE, 
    INTERNAL_SERVER_ERROR_API_RESPONSE,
    SUCCESS_API_RESPONSE,
    UNAUTHORIZED_API_RESPONSE,
    ERROR_UNAUTHENTICATED,
    CHECK_EMPTY
} = require('../../../configs/helper')
const { GetInquiriesList } = require('../../../models/AppModel/Inquiry')

/**
 * GET /admin/inquiry/list
 * Get paginated list of inquiries for admin
 * Query params: { page, limit, search, status, sortBy, sortOrder }
 */
router.get("/", async(req, res) => {
    let response = DEFAULT_API_RESPONSE
    let user = req.user || null

    if(CHECK_EMPTY(user)) {
        response = UNAUTHORIZED_API_RESPONSE
        response.message = ERROR_UNAUTHENTICATED
        return res.status(response.status_code).json(response)
    }

    try {
        const params = {
            page: req.query.page,
            limit: req.query.limit,
            search: req.query.search,
            status: req.query.status,
            sortBy: req.query.sortBy,
            sortOrder: req.query.sortOrder
        }

        console.log("Get Inquiries List Request: ", params)

        const result = await GetInquiriesList(params)

        if(!result.status) {
            response = INTERNAL_SERVER_ERROR_API_RESPONSE
            response.message = "Error. Failed to fetch inquiries list."
            return res.status(response.status_code).json(response)
        }

        response = SUCCESS_API_RESPONSE
        response.message = "Inquiries list retrieved successfully."
        response.data = result.data

        return res.status(response.status_code).json(response)

    } catch (e) {
        console.log("Error Get Inquiries List: ", e)
        response = INTERNAL_SERVER_ERROR_API_RESPONSE
        response.message = "Error. " + e.message
        return res.status(response.status_code).json(response)
    }
})

module.exports = router
