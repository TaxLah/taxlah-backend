const express = require('express')
const router = express.Router()
const { 
    DEFAULT_API_RESPONSE, 
    INTERNAL_SERVER_ERROR_API_RESPONSE,
    BAD_REQUEST_API_RESPONSE,
    SUCCESS_API_RESPONSE,
    UNAUTHORIZED_API_RESPONSE,
    ERROR_UNAUTHENTICATED,
    CHECK_EMPTY
} = require('../../../configs/helper')
const { GetReceiptsList } = require('../../../models/AppModel/Receipt')

/**
 * GET /api/receipt/list
 * Get paginated list of receipts for authenticated user
 * Query params: page, limit, search, rc_id, status, sortBy, sortOrder
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
        const account_id = user.account_id

        const params = {
            page: req.query.page,
            limit: req.query.limit,
            search: req.query.search,
            rc_id: req.query.rc_id,
            status: req.query.status,
            sortBy: req.query.sortBy,
            sortOrder: req.query.sortOrder
        }

        console.log("Get Receipts List Request - Account ID: ", account_id, " Params: ", params)

        const result = await GetReceiptsList(account_id, params)

        if(!result.status) {
            response = INTERNAL_SERVER_ERROR_API_RESPONSE
            response.message = "Error. Failed to retrieve receipts."
            return res.status(response.status_code).json(response)
        }

        response = SUCCESS_API_RESPONSE
        response.message = "Receipts retrieved successfully."
        response.data = result.data

        res.status(response.status_code).json(response)

    } catch (error) {
        console.log("Error Get Receipts List: ", error)
        response = INTERNAL_SERVER_ERROR_API_RESPONSE
        response.message = "Error. An error occurred while retrieving receipts."
        res.status(response.status_code).json(response)
    }
})

module.exports = router
