/**
 * AppController/BillingTransaction
 *
 * Mobile app billing transaction endpoints. All routes require
 * JWT auth — account_id is taken from req.user only.
 *
 * Routes (mounted at /api/billing/transactions):
 *   GET  /        — paginated transaction list + year tabs
 *   GET  /:ref    — single transaction detail by txn_ref
 */

const express = require('express')
const router  = express.Router()
const {
    DEFAULT_API_RESPONSE,
    SUCCESS_API_RESPONSE,
    NOT_FOUND_API_RESPONSE,
    INTERNAL_SERVER_ERROR_API_RESPONSE,
} = require('../../../configs/helper')
const { auth } = require('../../../configs/auth')
const {
    AppGetTransactionsList,
    AppGetTransactionDetails,
} = require('../../../models/AppModel/BillingTransaction')

/**
 * GET /api/billing/transactions
 * List the authenticated user's billing transactions.
 *
 * Query params:
 *   status  — Pending | Success | Failed | Refunded | Cancelled | All
 *   year    — 4-digit year filter
 *   bill_id — filter by specific bill
 *   page    — default 1
 *   limit   — default 10, max 50
 */
router.get('/', auth(), async (req, res) => {
    let response = DEFAULT_API_RESPONSE
    try {
        const accountId = req.user.account_id
        const result    = await AppGetTransactionsList(accountId, req.query)

        if (!result.status) {
            response = { ...INTERNAL_SERVER_ERROR_API_RESPONSE }
            response.message = 'Failed to retrieve transactions.'
            return res.status(response.status_code).json(response)
        }

        response = { ...SUCCESS_API_RESPONSE }
        response.message = 'Transactions retrieved successfully.'
        response.data    = result.data
        return res.status(response.status_code).json(response)
    } catch (e) {
        console.error('[AppController/BillingTransaction] List:', e)
        response = { ...INTERNAL_SERVER_ERROR_API_RESPONSE }
        return res.status(response.status_code).json(response)
    }
})

/**
 * GET /api/billing/transactions/:ref
 * Get a single transaction detail by txn_ref (e.g. TXN-202501-00271).
 */
router.get('/:ref', auth(), async (req, res) => {
    let response = DEFAULT_API_RESPONSE
    try {
        const accountId = req.user.account_id
        const txnRef    = req.params.ref

        const result = await AppGetTransactionDetails(accountId, txnRef)

        if (!result.status || !result.data) {
            response = { ...NOT_FOUND_API_RESPONSE }
            response.message = 'Transaction not found.'
            return res.status(response.status_code).json(response)
        }

        response = { ...SUCCESS_API_RESPONSE }
        response.message = 'Transaction details retrieved successfully.'
        response.data    = result.data
        return res.status(response.status_code).json(response)
    } catch (e) {
        console.error('[AppController/BillingTransaction] Details:', e)
        response = { ...INTERNAL_SERVER_ERROR_API_RESPONSE }
        return res.status(response.status_code).json(response)
    }
})

module.exports = router
