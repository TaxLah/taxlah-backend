const express = require('express')
const router = express.Router()
const { 
    DEFAULT_API_RESPONSE, 
    INTERNAL_SERVER_ERROR_API_RESPONSE,
    SUCCESS_API_RESPONSE
} = require('../../../configs/helper')
const { AdminGetUserStats } = require('../../../models/AdminModel/UserManagement')

/**
 * GET /admin/users/stats
 * Get user statistics (total, active, pending, suspended, new users, etc.)
 */
router.get("/", async(req, res) => {
    let response = DEFAULT_API_RESPONSE

    try {
        console.log("Admin Get User Stats Request")

        const result = await AdminGetUserStats()

        if(!result.status) {
            response = INTERNAL_SERVER_ERROR_API_RESPONSE
            response.message = "Error. Failed to retrieve user statistics."
            return res.status(response.status_code).json(response)
        }

        response = SUCCESS_API_RESPONSE
        response.message = "User statistics retrieved successfully."
        response.data = result.data

        res.status(response.status_code).json(response)

    } catch (error) {
        console.log("Error Admin Get User Stats: ", error)
        response = INTERNAL_SERVER_ERROR_API_RESPONSE
        response.message = "Error. An error occurred while retrieving user statistics."
        res.status(response.status_code).json(response)
    }
})

module.exports = router
