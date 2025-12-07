const express = require('express')
const router = express.Router()
const { 
    DEFAULT_API_RESPONSE, 
    INTERNAL_SERVER_ERROR_API_RESPONSE,
    BAD_REQUEST_API_RESPONSE,
    SUCCESS_API_RESPONSE,
    CHECK_EMPTY,
    sanitize
} = require('../../../configs/helper')
const { AdminGetMerchantsList } = require('../../../models/AdminModel/Merchant')

/**
 * GET /admin/merchant/list
 * Get paginated list of merchants with optional filters
 * Query: { page, limit, search, category, status, sortBy, sortOrder }
 */
router.get("/list", async(req, res) => {
    let response = DEFAULT_API_RESPONSE

    try {
        // Extract query parameters
        const params = {
            page: req.query.page || 1,
            limit: req.query.limit || 20,
            search: req.query.search || '',
            category: req.query.category || '',
            status: req.query.status || '',
            sortBy: req.query.sortBy || 'created_date',
            sortOrder: req.query.sortOrder || 'DESC'
        }

        // Sanitize search parameter
        if (params.search) {
            params.search = sanitize(params.search)
        }

        const result = await AdminGetMerchantsList(params)

        if (!result.status) {
            response = INTERNAL_SERVER_ERROR_API_RESPONSE
            response.message = result.message || 'Error fetching merchants list'
            return res.status(response.status_code).json(response)
        }

        response = SUCCESS_API_RESPONSE
        response.message = 'Merchants list retrieved successfully'
        response.data = result.data

        return res.status(response.status_code).json(response)

    } catch (error) {
        console.log("Error at AdminGetMerchantsList: ", error)
        response = INTERNAL_SERVER_ERROR_API_RESPONSE
        response.message = error.message || 'Internal server error'
        return res.status(response.status_code).json(response)
    }
})

module.exports = router
