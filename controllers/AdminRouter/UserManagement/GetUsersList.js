const express = require('express')
const router = express.Router()
const { 
    DEFAULT_API_RESPONSE, 
    INTERNAL_SERVER_ERROR_API_RESPONSE,
    SUCCESS_API_RESPONSE
} = require('../../../configs/helper')
const { AdminGetUsersList } = require('../../../models/AdminModel/UserManagement')

/**
 * GET /admin/users/list
 * Get paginated list of users with filters
 * Query params: { page, limit, search, status, sortBy, sortOrder }
 */
router.get("/", async(req, res) => {
    let response = DEFAULT_API_RESPONSE

    try {
        const params = {
            page: req.query.page || 1,
            limit: req.query.limit || 20,
            search: req.query.search || '',
            status: req.query.status || '',
            sortBy: req.query.sortBy || 'created_date',
            sortOrder: req.query.sortOrder || 'DESC'
        }

        console.log("Admin Get Users List Request: ", params)

        const result = await AdminGetUsersList(params)
        console.log("Log Function AdminGetUsersList : ", result)

        if(!result.status) {
            response = INTERNAL_SERVER_ERROR_API_RESPONSE
            response.message = "Error. Failed to retrieve users list."
            return res.status(response.status_code).json(response)
        }

        response = SUCCESS_API_RESPONSE
        response.message = "Users list retrieved successfully."
        response.data = result.data

        res.status(response.status_code).json(response)

    } catch (error) {
        console.log("Error Admin Get Users List: ", error)
        response = INTERNAL_SERVER_ERROR_API_RESPONSE
        response.message = "Error. An error occurred while retrieving users list."
        res.status(response.status_code).json(response)
    }
})

module.exports = router
