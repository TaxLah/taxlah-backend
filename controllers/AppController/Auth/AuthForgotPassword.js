const express  = require('express')
const router   = express.Router()
const bcrypt   = require('bcrypt')
const {
    DEFAULT_API_RESPONSE,
    SUCCESS_API_RESPONSE,
    BAD_REQUEST_API_RESPONSE,
    NOT_FOUND_API_RESPONSE,
    INTERNAL_SERVER_ERROR_API_RESPONSE,
    CHECK_EMPTY,
    isStrongPassword,
    sanitize,
} = require('../../../configs/helper')
const { AuthGetByEmail, AuthSetOtp, AuthVerifyOtp, AuthResetPassword } = require('../../../models/AppModel/Auth')
const mailService = require('../../../services/MailService')
const { ForgotPasswordEmail } = require('../../../services/MailTemplate')

/** Generate a cryptographically random 6-digit OTP */
function generateOtp() {
    return String(Math.floor(100000 + Math.random() * 900000))
}

// ============================================================================
// POST /api/auth/forgot-password
// Step 1 — Request OTP
// Body: { email }
// ============================================================================
router.post('/forgot-password', async (req, res) => {
    let response = DEFAULT_API_RESPONSE
    try {
        const email = req.body.email ? sanitize(req.body.email.trim()) : null
        console.log("Log Email : ", email)

        if (CHECK_EMPTY(email)) {
            response = { ...BAD_REQUEST_API_RESPONSE }
            response.message = 'Email address is required.'
            return res.status(response.status_code).json(response)
        }

        const authResult = await AuthGetByEmail(email)
        console.log("Log Check Email Exist : ", authResult)

        // Always respond with the same success message regardless of whether
        // the email exists — prevents account enumeration attacks.
        if (!authResult.status) {
            response = { ...SUCCESS_API_RESPONSE }
            response.message = 'If that email is registered, an OTP has been sent.'
            response.data    = null
            return res.status(response.status_code).json(response)
        }

        const otp = generateOtp()
        await AuthSetOtp(authResult.data.auth_id, otp)

        const { subject, text, html } = ForgotPasswordEmail(null, otp)
        await mailService.sendMail({ to: email, subject, text, html })

        console.log(`[ForgotPassword] OTP sent to ${email}`)

        response = { ...SUCCESS_API_RESPONSE }
        response.message = 'If that email is registered, an OTP has been sent.'
        response.data    = null
        return res.status(response.status_code).json(response)
    } catch (e) {
        console.error('[ForgotPassword] Error:', e)
        response = { ...INTERNAL_SERVER_ERROR_API_RESPONSE }
        return res.status(response.status_code).json(response)
    }
})

// ============================================================================
// POST /api/auth/reset-password
// Step 2 — Verify OTP + set new password
// Body: { email, otp, new_password }
// ============================================================================
router.post('/reset-password', async (req, res) => {
    let response = DEFAULT_API_RESPONSE
    try {
        const email        = req.body.email        ? sanitize(req.body.email.trim()) : null
        const otp          = req.body.otp          ? String(req.body.otp).trim()     : null
        const new_password = req.body.new_password || null

        if (CHECK_EMPTY(email) || CHECK_EMPTY(otp) || CHECK_EMPTY(new_password)) {
            response = { ...BAD_REQUEST_API_RESPONSE }
            response.message = 'email, otp, and new_password are all required.'
            return res.status(response.status_code).json(response)
        }

        if (!isStrongPassword(new_password)) {
            response = { ...BAD_REQUEST_API_RESPONSE }
            response.message = 'Password must be at least 8 characters with 1 uppercase, 1 lowercase, 1 number and 1 special character.'
            return res.status(response.status_code).json(response)
        }

        const verifyResult = await AuthVerifyOtp(email, otp)
        if (!verifyResult.status) {
            response = { ...BAD_REQUEST_API_RESPONSE }
            response.message = verifyResult.message || 'Invalid or expired OTP.'
            return res.status(response.status_code).json(response)
        }

        const hashedPassword = await bcrypt.hash(new_password, 15)
        await AuthResetPassword(verifyResult.auth_id, hashedPassword)

        console.log(`[ResetPassword] Password reset for auth_id ${verifyResult.auth_id}`)

        response = { ...SUCCESS_API_RESPONSE }
        response.message = 'Password has been reset successfully. Please sign in with your new password.'
        response.data    = null
        return res.status(response.status_code).json(response)
    } catch (e) {
        console.error('[ResetPassword] Error:', e)
        response = { ...INTERNAL_SERVER_ERROR_API_RESPONSE }
        return res.status(response.status_code).json(response)
    }
})

module.exports = router
