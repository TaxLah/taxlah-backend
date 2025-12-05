const express = require('express')
const router = express.Router()
const jwt = require('jsonwebtoken')
const { 
    DEFAULT_API_RESPONSE, 
    INTERNAL_SERVER_ERROR_API_RESPONSE,
    UNAUTHORIZED_API_RESPONSE,
    SUCCESS_API_RESPONSE
} = require('../../../configs/helper')
const { AdminAuthGetAccess } = require('../../../models/AdminModel/Auth')

const { ADMIN_SECRET } = process.env

/**
 * POST /admin/auth/authenticate
 * Verify admin JWT token and return admin info
 * Headers: { Authorization: "Bearer <token>" }
 */
router.post("/", async(req, res) => {
    let response = DEFAULT_API_RESPONSE

    try {
        const authHeader = req.headers.authorization
        
        if(!authHeader || !authHeader.startsWith('Bearer ')) {
            response = UNAUTHORIZED_API_RESPONSE
            response.message = "Error. Authorization token is required."
            return res.status(response.status_code).json(response)
        }

        const token = authHeader.split(' ')[1]

        // Verify JWT token
        let decoded
        try {
            decoded = jwt.verify(token, ADMIN_SECRET)
        } catch (error) {
            response = UNAUTHORIZED_API_RESPONSE
            response.message = "Error. Invalid or expired token."
            return res.status(response.status_code).json(response)
        }

        // Check if it's an admin token
        if(decoded.type !== 'admin') {
            response = UNAUTHORIZED_API_RESPONSE
            response.message = "Error. Invalid token type. Admin access required."
            return res.status(response.status_code).json(response)
        }

        // Get admin auth details
        const adminAuth = await AdminAuthGetAccess(decoded.aauth_id)

        if(!adminAuth.status) {
            response = UNAUTHORIZED_API_RESPONSE
            response.message = "Error. Admin account not found."
            return res.status(response.status_code).json(response)
        }

        // Check if admin is still active
        if(adminAuth.data.aauth_status !== 'Active') {
            response = UNAUTHORIZED_API_RESPONSE
            response.message = `Error. Admin account is ${adminAuth.data.aauth_status.toLowerCase()}.`
            return res.status(response.status_code).json(response)
        }

        response = SUCCESS_API_RESPONSE
        response.message = "Authentication successful."
        response.data = {
            admin: {
                aauth_id: adminAuth.data.aauth_id,
                admin_id: adminAuth.data.admin_id,
                username: adminAuth.data.aauth_username,
                email: adminAuth.data.aauth_usermail,
                role: adminAuth.data.aauth_role,
                reference_no: adminAuth.data.aauth_reference_no
            }
        }

        res.status(response.status_code).json(response)

    } catch (error) {
        console.log("Error Admin Authenticate: ", error)
        response = INTERNAL_SERVER_ERROR_API_RESPONSE
        response.message = "Error. An error occurred during authentication."
        res.status(response.status_code).json(response)
    }
})

module.exports = router
