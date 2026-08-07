const express = require('express')
const rateLimit = require('express-rate-limit')
const { ipKeyGenerator } = require('express-rate-limit')
const { DEFAULT_API_RESPONSE, INTERNAL_SERVER_ERROR_API_RESPONSE, SUCCESS_API_RESPONSE, FORBIDDEN_API_RESPONSE, CHECK_EMPTY, BAD_REQUEST_API_RESPONSE } = require('../../../configs/helper')
const { auth } = require('../../../configs/auth')
const { TaxCategoryList } = require('../../../models/AppModel/TaxCategories')
const { classifyTaxEligibility } = require('../../../services/TaxEligibilityService')
const router = express.Router()

/**
 * POST / forwards straight to an OpenAI completion. Left open it is an unmetered proxy
 * to our own API key, so it is both authenticated and capped per account.
 */
const classifyRateLimiter = rateLimit({
    windowMs: parseInt(process.env.AI_RATE_LIMIT_WINDOW_MS || '3600000', 10), // 1 hour
    max: parseInt(process.env.AI_RATE_LIMIT_MAX || '60', 10),
    standardHeaders: true,
    legacyHeaders: false,
    // auth() runs first so account_id is normally present; ipKeyGenerator is the
    // fallback and must be used so IPv6 clients cannot sidestep the limit per-address.
    keyGenerator: (req) => req.user?.account_id
        ? `acct:${req.user.account_id}`
        : ipKeyGenerator(req.ip),
    skip: () => process.env.NODE_ENV === 'test',
    message: {
        status_code: 429,
        status: 'error',
        message: 'Too many tax identification requests. Please try again later.'
    }
})

router.get("/", async(req , res) => {
    let response = DEFAULT_API_RESPONSE
    try {
        let tax_category = await TaxCategoryList()
        if(tax_category.status) {
            response = SUCCESS_API_RESPONSE
            response.data = tax_category.data
        } else {
            response = FORBIDDEN_API_RESPONSE
            response.data = []
        }
    } catch (e) {
        response = INTERNAL_SERVER_ERROR_API_RESPONSE
        response.data = null
    } finally {
        return res.status(response.status_code).json(response)
    }
})

router.post("/", auth(), classifyRateLimiter, async(req , res) => {
    let response = DEFAULT_API_RESPONSE
    try {
        
        let { merchant, date, total_amount, items = [] } = req.body
        console.log("Log Body : ", req.body)

        if(CHECK_EMPTY(merchant)) {
            response = BAD_REQUEST_API_RESPONSE
            response.message = "Field merchant is empty."
            return res.status(response.status_code).json(response)
        }

        if(CHECK_EMPTY(date)) {
            response = BAD_REQUEST_API_RESPONSE
            response.message = "Field date is empty."
            return res.status(response.status_code).json(response)
        }

        if(CHECK_EMPTY(total_amount)) {
            response = BAD_REQUEST_API_RESPONSE
            response.message = "Field total_amount is empty."
            return res.status(response.status_code).json(response)
        }

        if(CHECK_EMPTY(items)) {
            response = BAD_REQUEST_API_RESPONSE
            response.message = "Field items is empty."
            return res.status(response.status_code).json(response)
        }

        let check_tax = await classifyTaxEligibility(req.body)
        console.log("Log Check Tax Identification : ", check_tax)

        response            = SUCCESS_API_RESPONSE
        response.message    = "Tax identification has finish process."
        response.data = check_tax

    } catch (e) {
        console.log("[ERROR-API-IDENTIFY-TAX-CATEGORY] : ", e)
        response = INTERNAL_SERVER_ERROR_API_RESPONSE
    }

    return res.status(response.status_code).json(response)
})
module.exports = router