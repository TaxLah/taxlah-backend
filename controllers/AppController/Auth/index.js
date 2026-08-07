const express = require('express')
const router = express.Router()
const rateLimit = require('express-rate-limit')
const { ipKeyGenerator } = require('express-rate-limit')

const Onboarding      = require("./AuthRegister")
const SignIn          = require("./AuthLogin")
const Authenticate    = require("./Authenticate")
const ForgotPassword  = require("./AuthForgotPassword")

const TOO_MANY = (message) => ({ status_code: 429, status: 'error', message })

const BASE = {
	windowMs: parseInt(process.env.AUTH_RATE_LIMIT_WINDOW_MS || '900000', 10), // 15 minutes
	standardHeaders: true,
	legacyHeaders: false,
	skip: () => process.env.NODE_ENV === 'test'
}

/**
 * Two limiters rather than one, because a single per-IP limit does not work here.
 *
 * Malaysian mobile carriers put many subscribers behind one CGNAT address, so a tight
 * per-IP cap locks out real users in blocks. A tight per-identity cap stops targeted
 * brute force; a loose per-IP cap stops raw floods. Both are needed.
 *
 * Note both relies on app.set('trust proxy', 1) in server.js — without it every request
 * carries nginx's IP and the per-IP limiter throttles the whole user base as one client.
 */

// Loose per-IP ceiling — catches floods without punishing shared carrier addresses.
const ipFloodLimiter = rateLimit({
	...BASE,
	max: parseInt(process.env.AUTH_RATE_LIMIT_IP_MAX || '100', 10),
	message: TOO_MANY('Too many authentication attempts from this network. Please try again in 15 minutes.')
})

// Strict per-identity limit. Counts only failures, so a user who logs in successfully
// never burns quota. Falls back to IP when no identity was supplied.
const identityLimiter = rateLimit({
	...BASE,
	max: parseInt(process.env.AUTH_RATE_LIMIT_MAX || '10', 10),
	skipSuccessfulRequests: true,
	keyGenerator: (req) => {
		// Field names differ per route: signin uses auth_username, forgot/reset use email,
		// verify-account uses email_account.
		const identity = req.body?.auth_username
			|| req.body?.email
			|| req.body?.email_account
			|| req.body?.account_email
		return identity ? `id:${String(identity).trim().toLowerCase()}` : ipKeyGenerator(req.ip)
	},
	message: TOO_MANY('Too many failed attempts for this account. Please try again in 15 minutes.')
})

// Applied to the credential-handling routes only.
//
// /authenticate is deliberately excluded: the mobile app polls it roughly once a minute
// while in use, so any 15-minute cap would throttle ordinary sessions. It already
// requires a valid token, so it is not a credential-guessing surface.
router.use("/onboard",          ipFloodLimiter, identityLimiter, Onboarding)
router.use("/signin",           ipFloodLimiter, identityLimiter, SignIn)
router.use("/authenticate",     Authenticate)
router.use("/verify-account",   ipFloodLimiter, identityLimiter, require("./AuthCompleteRegister"))
router.use("/",                 ipFloodLimiter, identityLimiter, ForgotPassword)  // POST /forgot-password  &  POST /reset-password

module.exports = router