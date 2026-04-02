const express = require('express')
const router  = express.Router()

const {
    DEFAULT_API_RESPONSE,
    INTERNAL_SERVER_ERROR_API_RESPONSE,
    SUCCESS_API_RESPONSE,
    BAD_REQUEST_API_RESPONSE,
    NOT_FOUND_API_RESPONSE,
} = require('../../../configs/helper')

const { superauth } = require('../../../configs/auth')

const {
    AdminGetBillingTransactionsList,
    AdminGetBillingTransactionDetails,
} = require('../../../models/AdminModel/BillingTransaction')

/* ─────────────────────────────────────────────────────────────
   GET /superadmin/billing-transactions
   Query: page, limit, search, status, payment_gateway,
          payment_method, year, month, account_id, bill_id
──────────────────────────────────────────────────────────────── */
router.get('/', superauth(), async (req, res) => {
    let response = DEFAULT_API_RESPONSE
    try {
        const result = await AdminGetBillingTransactionsList(req.query)
        response = result.status ? { ...SUCCESS_API_RESPONSE, ...result.data } : INTERNAL_SERVER_ERROR_API_RESPONSE
    } catch (e) {
        console.error('[AdminController/BillingTransaction] List:', e)
        response = INTERNAL_SERVER_ERROR_API_RESPONSE
    }
    return res.status(response.status_code).json(response)
})

/* ─────────────────────────────────────────────────────────────
   GET /superadmin/billing-transactions/:id
   Returns full record including chip_payload and chip_callback JSON
──────────────────────────────────────────────────────────────── */
router.get('/:id', superauth(), async (req, res) => {
    let response = DEFAULT_API_RESPONSE
    try {
        const { id } = req.params
        if (!id || isNaN(id)) {
            response = { ...BAD_REQUEST_API_RESPONSE, message: 'Invalid transaction ID.' }
            return res.status(response.status_code).json(response)
        }
        const result = await AdminGetBillingTransactionDetails(id)
        response = result.status
            ? { ...SUCCESS_API_RESPONSE, data: result.data }
            : { ...NOT_FOUND_API_RESPONSE, message: 'Transaction not found.' }
    } catch (e) {
        console.error('[AdminController/BillingTransaction] Details:', e)
        response = INTERNAL_SERVER_ERROR_API_RESPONSE
    }
    return res.status(response.status_code).json(response)
})

module.exports = router
