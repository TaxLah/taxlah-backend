const express = require('express')
const router = express.Router()
const rateLimit = require('express-rate-limit')

const Onboarding      = require("./AuthRegister")
const SignIn          = require("./AuthLogin")
const Authenticate    = require("./Authenticate")
const ForgotPassword  = require("./AuthForgotPassword")

const authRateLimiter = rateLimit({
	windowMs: parseInt(process.env.AUTH_RATE_LIMIT_WINDOW_MS || '900000', 10), // 15 minutes
	max: parseInt(process.env.AUTH_RATE_LIMIT_MAX || '10', 10),
	standardHeaders: true,
	legacyHeaders: false,
	skip: () => process.env.NODE_ENV === 'test',
	message: {
        sttaus_code: 429,
		status: 'error',
		message: 'Too many authentication attempts. Please try again later in 15 minutes.'
	}
})

router.use(authRateLimiter)

router.use("/onboard",          Onboarding)
router.use("/signin",           SignIn)
router.use("/authenticate",     Authenticate)
router.use("/",                 ForgotPassword)  // POST /forgot-password  &  POST /reset-password
router.use("/verify-account", require("./AuthCompleteRegister"))

module.exports = router