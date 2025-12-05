const express = require('express')
const router = express.Router()
const { 
    DEFAULT_API_RESPONSE, 
    INTERNAL_SERVER_ERROR_API_RESPONSE,
    BAD_REQUEST_API_RESPONSE,
    SUCCESS_API_RESPONSE,
    CHECK_EMPTY
} = require('../../../configs/helper')
const { AdminGetUserActivityLogs } = require('../../../models/AdminModel/UserManagement')

/**
 * GET /admin/users/activity/:account_id
 * Get user activity logs
 * Query params: { limit }
 */
router.get("/:account_id", async(req, res) => {
    let response = DEFAULT_API_RESPONSE

    try {
        const account_id = req.params.account_id
        const limit = parseInt(req.query.limit) || 50

        if(CHECK_EMPTY(account_id)) {
            response = BAD_REQUEST_API_RESPONSE
            response.message = "Error. Account ID is required."
            return res.status(response.status_code).json(response)
        }

        console.log("Admin Get User Activity Logs Request - Account ID: ", account_id, " Limit: ", limit)

        const result = await AdminGetUserActivityLogs(account_id, limit)

        if(!result.status) {
            response = INTERNAL_SERVER_ERROR_API_RESPONSE
            response.message = "Error. Failed to retrieve user activity logs."
            return res.status(response.status_code).json(response)
        }

        response = SUCCESS_API_RESPONSE
        response.message = "User activity logs retrieved successfully."
        response.data = {
            account_id: parseInt(account_id),
            logs: result.data,
            total: result.data.length
        }

        res.status(response.status_code).json(response)

    } catch (error) {
        console.log("Error Admin Get User Activity Logs: ", error)
        response = INTERNAL_SERVER_ERROR_API_RESPONSE
        response.message = "Error. An error occurred while retrieving user activity logs."
        res.status(response.status_code).json(response)
    }
})

module.exports = router
