const express = require('express')
const router  = express.Router()

const {
    DEFAULT_API_RESPONSE, INTERNAL_SERVER_ERROR_API_RESPONSE,
    SUCCESS_API_RESPONSE, BAD_REQUEST_API_RESPONSE, NOT_FOUND_API_RESPONSE
} = require('../../../configs/helper')

const { superauth } = require('../../../configs/auth')

const {
    AdminGetReceiptsList, AdminGetReceiptDetails,
    AdminUpdateReceipt, AdminUpdateReceiptStatus,
    AdminDeleteReceipt, AdminGetReceiptStats
} = require('../../../models/AdminModel/Receipt')

/* ─── GET /superadmin/receipts ─── */
router.get('/', superauth(), async (req, res) => {
    let response = DEFAULT_API_RESPONSE
    try {
        const result = await AdminGetReceiptsList(req.query)
        response = result.status
            ? { ...SUCCESS_API_RESPONSE, data: result.data }
            : INTERNAL_SERVER_ERROR_API_RESPONSE
    } catch (e) {
        console.error('[AdminController/Receipt] List:', e)
        response = INTERNAL_SERVER_ERROR_API_RESPONSE
    }
    return res.status(response.status_code).json(response)
})

/* ─── GET /superadmin/receipts/stats ─── */
router.get('/stats', superauth(), async (req, res) => {
    let response = DEFAULT_API_RESPONSE
    try {
        const result = await AdminGetReceiptStats()
        response = result.status
            ? { ...SUCCESS_API_RESPONSE, data: result.data }
            : INTERNAL_SERVER_ERROR_API_RESPONSE
    } catch (e) {
        console.error('[AdminController/Receipt] Stats:', e)
        response = INTERNAL_SERVER_ERROR_API_RESPONSE
    }
    return res.status(response.status_code).json(response)
})

/* ─── GET /superadmin/receipts/:receipt_id ─── */
router.get('/:receipt_id', superauth(), async (req, res) => {
    let response = DEFAULT_API_RESPONSE
    try {
        const result = await AdminGetReceiptDetails(req.params.receipt_id)
        response = result.status
            ? { ...SUCCESS_API_RESPONSE, data: result.data }
            : { ...NOT_FOUND_API_RESPONSE, message: 'Receipt not found.' }
    } catch (e) {
        console.error('[AdminController/Receipt] View:', e)
        response = INTERNAL_SERVER_ERROR_API_RESPONSE
    }
    return res.status(response.status_code).json(response)
})

/* ─── PUT /superadmin/receipts/:receipt_id ─── */
router.put('/:receipt_id', superauth(), async (req, res) => {
    let response = DEFAULT_API_RESPONSE
    try {
        const allowed = [
            'receipt_name','receipt_description','receipt_date','receipt_total_amount',
            'receipt_currency','merchant_id','receipt_category_id','tax_year'
        ]
        const update = {}
        allowed.forEach(k => { if (req.body[k] !== undefined) update[k] = req.body[k] })

        if (!Object.keys(update).length) {
            response = { ...BAD_REQUEST_API_RESPONSE, message: 'No updatable fields provided.' }
            return res.status(response.status_code).json(response)
        }

        const result = await AdminUpdateReceipt(req.params.receipt_id, update)
        response = result.status
            ? { ...SUCCESS_API_RESPONSE, message: 'Receipt updated.' }
            : { ...NOT_FOUND_API_RESPONSE, message: 'Receipt not found.' }
    } catch (e) {
        console.error('[AdminController/Receipt] Update:', e)
        response = INTERNAL_SERVER_ERROR_API_RESPONSE
    }
    return res.status(response.status_code).json(response)
})

/* ─── PUT /superadmin/receipts/:receipt_id/status ─── */
router.put('/:receipt_id/status', superauth(), async (req, res) => {
    let response = DEFAULT_API_RESPONSE
    try {
        const { status } = req.body
        const VALID = ['Active','Inactive','Deleted','Rejected']
        if (!status || !VALID.includes(status)) {
            response = { ...BAD_REQUEST_API_RESPONSE, message: `status must be one of: ${VALID.join(', ')}.` }
            return res.status(response.status_code).json(response)
        }

        const result = await AdminUpdateReceiptStatus(req.params.receipt_id, status)
        response = result.status
            ? { ...SUCCESS_API_RESPONSE, message: `Receipt status updated to ${status}.` }
            : { ...NOT_FOUND_API_RESPONSE, message: 'Receipt not found.' }
    } catch (e) {
        console.error('[AdminController/Receipt] UpdateStatus:', e)
        response = INTERNAL_SERVER_ERROR_API_RESPONSE
    }
    return res.status(response.status_code).json(response)
})

/* ─── DELETE /superadmin/receipts/:receipt_id ─── */
router.delete('/:receipt_id', superauth(), async (req, res) => {
    let response = DEFAULT_API_RESPONSE
    try {
        const result = await AdminDeleteReceipt(req.params.receipt_id)
        response = result.status
            ? { ...SUCCESS_API_RESPONSE, message: 'Receipt deleted.' }
            : { ...NOT_FOUND_API_RESPONSE, message: 'Receipt not found.' }
    } catch (e) {
        console.error('[AdminController/Receipt] Delete:', e)
        response = INTERNAL_SERVER_ERROR_API_RESPONSE
    }
    return res.status(response.status_code).json(response)
})

module.exports = router
