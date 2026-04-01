const express = require('express')
const router  = express.Router()

const {
    DEFAULT_API_RESPONSE, INTERNAL_SERVER_ERROR_API_RESPONSE,
    SUCCESS_API_RESPONSE, BAD_REQUEST_API_RESPONSE, NOT_FOUND_API_RESPONSE, CHECK_EMPTY
} = require('../../../configs/helper')

const { superauth } = require('../../../configs/auth')

const {
    AdminGetTransactionsList, AdminGetTransactionDetails,
    AdminCreateTransaction, AdminUpdateTransactionStatus,
    AdminDeleteTransaction, AdminGetTargetAccounts
} = require('../../../models/AdminModel/Transaction')

const NotificationService = require('../../../services/NotificationService')

/* ─── GET /superadmin/transactions ─── */
router.get('/', superauth(), async (req, res) => {
    let response = DEFAULT_API_RESPONSE
    try {
        const result = await AdminGetTransactionsList(req.query)
        response = result.status
            ? { ...SUCCESS_API_RESPONSE, data: result.data }
            : INTERNAL_SERVER_ERROR_API_RESPONSE
    } catch (e) {
        console.error('[AdminController/Transaction] List:', e)
        response = INTERNAL_SERVER_ERROR_API_RESPONSE
    }
    return res.status(response.status_code).json(response)
})

/* ─── GET /superadmin/transactions/:payment_id ─── */
router.get('/:payment_id', superauth(), async (req, res) => {
    let response = DEFAULT_API_RESPONSE
    try {
        const result = await AdminGetTransactionDetails(req.params.payment_id)
        response = result.status
            ? { ...SUCCESS_API_RESPONSE, data: result.data }
            : { ...NOT_FOUND_API_RESPONSE, message: 'Transaction not found.' }
    } catch (e) {
        console.error('[AdminController/Transaction] View:', e)
        response = INTERNAL_SERVER_ERROR_API_RESPONSE
    }
    return res.status(response.status_code).json(response)
})

/* ─── POST /superadmin/transactions ─── Create manual bill/transaction for user ─── */
router.post('/', superauth(), async (req, res) => {
    let response = DEFAULT_API_RESPONSE
    try {
        const {
            account_id, subscription_id, amount, currency = 'MYR',
            payment_gateway = 'Manual', payment_status = 'Pending',
            period_start, period_end, notes
        } = req.body

        if (CHECK_EMPTY(account_id) || amount === undefined) {
            response = { ...BAD_REQUEST_API_RESPONSE, message: 'account_id and amount are required.' }
            return res.status(response.status_code).json(response)
        }

        const payment_ref = `TXN-${Date.now()}-${account_id}`

        const result = await AdminCreateTransaction({
            account_id, subscription_id: subscription_id || null,
            payment_ref, amount: parseFloat(amount), currency,
            payment_gateway, payment_status,
            period_start: period_start || null,
            period_end:   period_end   || null,
            notes:        notes        || null,
            created_date: new Date()
        })

        response = result.status
            ? { ...SUCCESS_API_RESPONSE, message: 'Transaction created.', data: { payment_id: result.data } }
            : INTERNAL_SERVER_ERROR_API_RESPONSE
    } catch (e) {
        console.error('[AdminController/Transaction] Create:', e)
        response = INTERNAL_SERVER_ERROR_API_RESPONSE
    }
    return res.status(response.status_code).json(response)
})

/* ─── PUT /superadmin/transactions/:payment_id/status ─── */
router.put('/:payment_id/status', superauth(), async (req, res) => {
    let response = DEFAULT_API_RESPONSE
    try {
        const { payment_status, notes } = req.body
        const VALID = ['Pending','Processing','Paid','Failed','Refunded','Cancelled']

        if (!payment_status || !VALID.includes(payment_status)) {
            response = { ...BAD_REQUEST_API_RESPONSE, message: `payment_status must be one of: ${VALID.join(', ')}.` }
            return res.status(response.status_code).json(response)
        }

        const result = await AdminUpdateTransactionStatus(req.params.payment_id, payment_status, notes ? { notes } : {})
        response = result.status
            ? { ...SUCCESS_API_RESPONSE, message: `Transaction status updated to ${payment_status}.` }
            : { ...NOT_FOUND_API_RESPONSE, message: 'Transaction not found.' }
    } catch (e) {
        console.error('[AdminController/Transaction] UpdateStatus:', e)
        response = INTERNAL_SERVER_ERROR_API_RESPONSE
    }
    return res.status(response.status_code).json(response)
})

/* ─── DELETE /superadmin/transactions/:payment_id ─── */
router.delete('/:payment_id', superauth(), async (req, res) => {
    let response = DEFAULT_API_RESPONSE
    try {
        const result = await AdminDeleteTransaction(req.params.payment_id)
        response = result.status
            ? { ...SUCCESS_API_RESPONSE, message: 'Transaction deleted.' }
            : { ...NOT_FOUND_API_RESPONSE, message: 'Transaction not found.' }
    } catch (e) {
        console.error('[AdminController/Transaction] Delete:', e)
        response = INTERNAL_SERVER_ERROR_API_RESPONSE
    }
    return res.status(response.status_code).json(response)
})

/* ─── POST /superadmin/transactions/notify ─── Send notification to user(s) ─── */
router.post('/notify', superauth(), async (req, res) => {
    let response = DEFAULT_API_RESPONSE
    try {
        const { title, body, account_ids = [], broadcast = false } = req.body

        if (CHECK_EMPTY(title) || CHECK_EMPTY(body)) {
            response = { ...BAD_REQUEST_API_RESPONSE, message: 'title and body are required.' }
            return res.status(response.status_code).json(response)
        }

        if (broadcast) {
            // Broadcast to all active users
            NotificationService.broadcastNotification(title, body, { type: 'AdminBroadcast' })
                .catch(err => console.error('[AdminController/Transaction] Broadcast failed:', err))
            response = { ...SUCCESS_API_RESPONSE, message: 'Broadcast notification queued.' }
        } else if (account_ids.length > 0) {
            // Notify specific users
            for (const account_id of account_ids) {
                NotificationService.sendUserNotification(account_id, title, body, { type: 'AdminMessage' })
                    .catch(err => console.error(`[AdminController/Transaction] Notify ${account_id} failed:`, err))
            }
            response = { ...SUCCESS_API_RESPONSE, message: `Notification queued for ${account_ids.length} user(s).` }
        } else {
            response = { ...BAD_REQUEST_API_RESPONSE, message: 'Provide account_ids array or set broadcast=true.' }
        }
    } catch (e) {
        console.error('[AdminController/Transaction] Notify:', e)
        response = INTERNAL_SERVER_ERROR_API_RESPONSE
    }
    return res.status(response.status_code).json(response)
})

module.exports = router
