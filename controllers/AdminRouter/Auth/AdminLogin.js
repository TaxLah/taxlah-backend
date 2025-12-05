const express = require('express')
const router = express.Router()
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
const { 
    DEFAULT_API_RESPONSE, 
    INTERNAL_SERVER_ERROR_API_RESPONSE, 
    CHECK_EMPTY, 
    BAD_REQUEST_API_RESPONSE, 
    UNAUTHORIZED_API_RESPONSE,
    SUCCESS_API_RESPONSE, 
    sanitize 
} = require('../../../configs/helper')
const { AdminAuthGetByIdentifier } = require('../../../models/AdminModel/Auth')

const { ADMIN_SECRET } = process.env

/**
 * POST /admin/auth/login
 * Admin login endpoint
 * Body: { username, password }
 */
router.post("/", async(req, res) => {
    let response = DEFAULT_API_RESPONSE

    try {
        const params = req.body
        console.log("Admin Login Request: ", params)

        const username = params.username || null
        const password = params.password || null

        // Validation
        if(CHECK_EMPTY(username)) {
            response = BAD_REQUEST_API_RESPONSE
            response.message = "Error. Username or email is required."
            return res.status(response.status_code).json(response)
        }

        if(CHECK_EMPTY(password)) {
            response = BAD_REQUEST_API_RESPONSE
            response.message = "Error. Password is required."
            return res.status(response.status_code).json(response)
        }

        // Get admin auth by username or email
        const adminAuth = await AdminAuthGetByIdentifier(sanitize(username))

        if(!adminAuth.status) {
            response = UNAUTHORIZED_API_RESPONSE
            response.message = "Error. Invalid username/email or password."
            return res.status(response.status_code).json(response)
        }

        // Verify password
        const isPasswordValid = await bcrypt.compare(password, adminAuth.data.aauth_password)

        if(!isPasswordValid) {
            response = UNAUTHORIZED_API_RESPONSE
            response.message = "Error. Invalid username/email or password."
            return res.status(response.status_code).json(response)
        }

        // Check if admin is active
        if(adminAuth.data.aauth_status !== 'Active') {
            response = UNAUTHORIZED_API_RESPONSE
            response.message = `Error. Admin account is ${adminAuth.data.aauth_status.toLowerCase()}. Please contact super admin.`
            return res.status(response.status_code).json(response)
        }

        // Generate JWT token
        const tokenPayload = {
            aauth_id: adminAuth.data.aauth_id,
            admin_id: adminAuth.data.admin_id,
            username: adminAuth.data.aauth_username,
            email: adminAuth.data.aauth_usermail,
            role: adminAuth.data.aauth_role,
            type: 'admin'
        }

        const token = jwt.sign(tokenPayload, ADMIN_SECRET, { expiresIn: '24h' })

        response = SUCCESS_API_RESPONSE
        response.message = "Login successful."
        response.data = {
            token: token,
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
        console.log("Error Admin Login: ", error)
        response = INTERNAL_SERVER_ERROR_API_RESPONSE
        response.message = "Error. An error occurred during login."
        res.status(response.status_code).json(response)
    }
})

module.exports = router
