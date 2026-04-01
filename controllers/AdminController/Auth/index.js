const express = require('express')
const router  = express.Router()
const bcrypt  = require('bcrypt')
const jwt     = require('jsonwebtoken')
const crypto  = require('crypto')

const {
    DEFAULT_API_RESPONSE,
    INTERNAL_SERVER_ERROR_API_RESPONSE,
    SUCCESS_API_RESPONSE,
    BAD_REQUEST_API_RESPONSE,
    UNAUTHORIZED_API_RESPONSE,
    NOT_FOUND_API_RESPONSE,
    CHECK_EMPTY,
    sanitize
} = require('../../../configs/helper')

const { superauth }               = require('../../../configs/auth')
const {
    AdminAuthGetByIdentifier,
    AdminAuthGetAccess,
    AdminAuthUpdateAccess
}                                 = require('../../../models/AdminModel/Auth')
const db                          = require('../../../utils/sqlbuilder')

const { ADMIN_SECRET } = process.env

/* ─────────────────────────────────────────────
   POST /superadmin/auth/login
   Body: { username, password }
──────────────────────────────────────────────── */
router.post('/login', async (req, res) => {
    let response = DEFAULT_API_RESPONSE
    try {
        const { username, password } = req.body

        if (CHECK_EMPTY(username)) {
            response = { ...BAD_REQUEST_API_RESPONSE, message: 'Username or email is required.' }
            return res.status(response.status_code).json(response)
        }
        if (CHECK_EMPTY(password)) {
            response = { ...BAD_REQUEST_API_RESPONSE, message: 'Password is required.' }
            return res.status(response.status_code).json(response)
        }

        const adminAuth = await AdminAuthGetByIdentifier(sanitize(username))
        if (!adminAuth.status) {
            response = { ...UNAUTHORIZED_API_RESPONSE, message: 'Invalid credentials.' }
            return res.status(response.status_code).json(response)
        }

        const valid = await bcrypt.compare(password, adminAuth.data.aauth_password)
        if (!valid) {
            response = { ...UNAUTHORIZED_API_RESPONSE, message: 'Invalid credentials.' }
            return res.status(response.status_code).json(response)
        }

        if (adminAuth.data.aauth_status !== 'Active') {
            response = { ...UNAUTHORIZED_API_RESPONSE, message: `Account is ${adminAuth.data.aauth_status}. Contact super admin.` }
            return res.status(response.status_code).json(response)
        }

        // Fetch admin profile
        const [adminProfile] = await db.raw(`SELECT admin_id, admin_name, admin_fullname, admin_email, admin_phone, admin_role FROM admin WHERE admin_id = ? LIMIT 1`, [adminAuth.data.admin_id])

        const tokenPayload = {
            aauth_id: adminAuth.data.aauth_id,
            admin_id: adminAuth.data.admin_id,
            username: adminAuth.data.aauth_username,
            email:    adminAuth.data.aauth_usermail,
            role:     adminAuth.data.aauth_role,
            type:     'admin'
        }

        const token = jwt.sign(tokenPayload, ADMIN_SECRET, { expiresIn: '24h' })

        response = {
            ...SUCCESS_API_RESPONSE,
            message: 'Login successful.',
            data: {
                token,
                admin: {
                    aauth_id:   adminAuth.data.aauth_id,
                    admin_id:   adminAuth.data.admin_id,
                    username:   adminAuth.data.aauth_username,
                    email:      adminAuth.data.aauth_usermail,
                    role:       adminAuth.data.aauth_role,
                    reference:  adminAuth.data.aauth_reference_no,
                    profile:    adminProfile || null
                }
            }
        }
    } catch (e) {
        console.error('[AdminController/Auth] Login:', e)
        response = INTERNAL_SERVER_ERROR_API_RESPONSE
    }
    return res.status(response.status_code).json(response)
})

/* ─────────────────────────────────────────────
   GET /superadmin/auth/me  (requires token)
──────────────────────────────────────────────── */
router.get('/me', superauth(), async (req, res) => {
    let response = DEFAULT_API_RESPONSE
    try {
        const { aauth_id, admin_id } = req.payload

        const authData = await AdminAuthGetAccess(aauth_id)
        if (!authData.status) {
            response = { ...NOT_FOUND_API_RESPONSE, message: 'Admin account not found.' }
            return res.status(response.status_code).json(response)
        }

        const [profile] = await db.raw(`SELECT admin_id, admin_name, admin_fullname, admin_email, admin_phone, admin_role, admin_status FROM admin WHERE admin_id = ? LIMIT 1`, [admin_id])

        response = {
            ...SUCCESS_API_RESPONSE,
            data: {
                auth:    authData.data,
                profile: profile || null
            }
        }
    } catch (e) {
        console.error('[AdminController/Auth] GetMe:', e)
        response = INTERNAL_SERVER_ERROR_API_RESPONSE
    }
    return res.status(response.status_code).json(response)
})

/* ─────────────────────────────────────────────
   POST /superadmin/auth/forgot-password
   Body: { email }
   Generates a 6-digit OTP and stores in admin_password_reset
──────────────────────────────────────────────── */
router.post('/forgot-password', async (req, res) => {
    let response = DEFAULT_API_RESPONSE
    try {
        const { email } = req.body

        if (CHECK_EMPTY(email)) {
            response = { ...BAD_REQUEST_API_RESPONSE, message: 'Email is required.' }
            return res.status(response.status_code).json(response)
        }

        const adminAuth = await AdminAuthGetByIdentifier(sanitize(email))
        // Always return success to prevent email enumeration
        if (!adminAuth.status) {
            response = { ...SUCCESS_API_RESPONSE, message: 'If the email exists, an OTP has been sent.' }
            return res.status(response.status_code).json(response)
        }

        const otp         = Math.floor(100000 + Math.random() * 900000).toString()
        const reset_token = crypto.createHash('sha256').update(`${otp}${Date.now()}`).digest('hex')
        const expires_at  = new Date(Date.now() + 15 * 60 * 1000) // 15 minutes

        // Invalidate existing unused tokens for this admin
        await db.raw(`UPDATE admin_password_reset SET is_used = 'Yes' WHERE admin_id = ? AND is_used = 'No'`, [adminAuth.data.admin_id])

        await db.insert('admin_password_reset', {
            admin_id:     adminAuth.data.admin_id,
            reset_token,
            reset_otp:    otp,
            expires_at,
            is_used:      'No',
            created_date: new Date()
        })

        // Queue OTP email (fire-and-forget)
        try {
            const queues = require('../../../queue')
            await queues.email.add('reset-otp', {
                to:      adminAuth.data.aauth_usermail,
                subject: 'TaxLah Admin - Password Reset OTP',
                html:    `<p>Your OTP is <strong>${otp}</strong>. Valid for 15 minutes.</p>`
            })
        } catch (qErr) {
            console.error('[AdminController/Auth] Queue email failed:', qErr)
        }

        response = { ...SUCCESS_API_RESPONSE, message: 'If the email exists, an OTP has been sent.' }
    } catch (e) {
        console.error('[AdminController/Auth] ForgotPassword:', e)
        response = INTERNAL_SERVER_ERROR_API_RESPONSE
    }
    return res.status(response.status_code).json(response)
})

/* ─────────────────────────────────────────────
   POST /superadmin/auth/reset-password
   Body: { otp, new_password }
──────────────────────────────────────────────── */
router.post('/reset-password', async (req, res) => {
    let response = DEFAULT_API_RESPONSE
    try {
        const { otp, new_password } = req.body

        if (CHECK_EMPTY(otp) || CHECK_EMPTY(new_password)) {
            response = { ...BAD_REQUEST_API_RESPONSE, message: 'OTP and new_password are required.' }
            return res.status(response.status_code).json(response)
        }
        if (new_password.length < 8) {
            response = { ...BAD_REQUEST_API_RESPONSE, message: 'Password must be at least 8 characters.' }
            return res.status(response.status_code).json(response)
        }

        const [resetRow] = await db.raw(
            `SELECT * FROM admin_password_reset WHERE reset_otp = ? AND is_used = 'No' AND expires_at > NOW() ORDER BY created_date DESC LIMIT 1`,
            [otp]
        )

        if (!resetRow) {
            response = { ...BAD_REQUEST_API_RESPONSE, message: 'Invalid or expired OTP.' }
            return res.status(response.status_code).json(response)
        }

        const hashed = await bcrypt.hash(new_password, 12)

        await db.update('admin_auth', { aauth_password: hashed }, { admin_id: resetRow.admin_id })
        await db.update('admin_password_reset', { is_used: 'Yes' }, { reset_id: resetRow.reset_id })

        response = { ...SUCCESS_API_RESPONSE, message: 'Password reset successful.' }
    } catch (e) {
        console.error('[AdminController/Auth] ResetPassword:', e)
        response = INTERNAL_SERVER_ERROR_API_RESPONSE
    }
    return res.status(response.status_code).json(response)
})

/* ─────────────────────────────────────────────
   PUT /superadmin/auth/change-password  (requires token)
   Body: { current_password, new_password }
──────────────────────────────────────────────── */
router.put('/change-password', superauth(), async (req, res) => {
    let response = DEFAULT_API_RESPONSE
    try {
        const { aauth_id } = req.payload
        const { current_password, new_password } = req.body

        if (CHECK_EMPTY(current_password) || CHECK_EMPTY(new_password)) {
            response = { ...BAD_REQUEST_API_RESPONSE, message: 'current_password and new_password are required.' }
            return res.status(response.status_code).json(response)
        }
        if (new_password.length < 8) {
            response = { ...BAD_REQUEST_API_RESPONSE, message: 'New password must be at least 8 characters.' }
            return res.status(response.status_code).json(response)
        }

        const [authRow] = await db.raw(`SELECT aauth_id, aauth_password FROM admin_auth WHERE aauth_id = ? LIMIT 1`, [aauth_id])
        if (!authRow) {
            response = { ...NOT_FOUND_API_RESPONSE, message: 'Admin not found.' }
            return res.status(response.status_code).json(response)
        }

        const valid = await bcrypt.compare(current_password, authRow.aauth_password)
        if (!valid) {
            response = { ...BAD_REQUEST_API_RESPONSE, message: 'Current password is incorrect.' }
            return res.status(response.status_code).json(response)
        }

        const hashed = await bcrypt.hash(new_password, 12)
        await AdminAuthUpdateAccess({ aauth_id, aauth_password: hashed })

        response = { ...SUCCESS_API_RESPONSE, message: 'Password changed successfully.' }
    } catch (e) {
        console.error('[AdminController/Auth] ChangePassword:', e)
        response = INTERNAL_SERVER_ERROR_API_RESPONSE
    }
    return res.status(response.status_code).json(response)
})

module.exports = router
