/**
 * AppController/Bill
 *
 * Mobile app bill endpoints. All routes require JWT auth —
 * account_id is always taken from req.user, never from the
 * request body, so users can only ever see their own bills.
 *
 * Routes (mounted at /api/billing/bills):
 *   GET  /          — paginated bill list + badge counts + year tabs
 *   GET  /:id       — bill detail + attached payment transactions
 *   POST /:id/pay   — get (or create) CHIP checkout URL for a Pending/Overdue bill
 */

const express = require('express')
const router  = express.Router()
const {
    DEFAULT_API_RESPONSE,
    SUCCESS_API_RESPONSE,
    BAD_REQUEST_API_RESPONSE,
    NOT_FOUND_API_RESPONSE,
    INTERNAL_SERVER_ERROR_API_RESPONSE,
} = require('../../../configs/helper')
const { auth } = require('../../../configs/auth')
const { AppGetBillsList, AppGetBillDetails } = require('../../../models/AppModel/Bill')
const ChipPaymentService  = require('../../../services/ChipPaymentService')
const { BillingSetCheckoutUrl } = require('../../../models/AppModel/BillingService')

/**
 * GET /api/billing/bills
 * List the authenticated user's bills.
 *
 * Query params:
 *   status  — Pending | Paid | Overdue | Cancelled | Refunded | All (default: All)
 *   year    — 4-digit billing year filter
 *   page    — default 1
 *   limit   — default 10, max 50
 */
router.get('/', auth(), async (req, res) => {
    let response = DEFAULT_API_RESPONSE
    try {
        const accountId = req.user.account_id
        const result    = await AppGetBillsList(accountId, req.query)

        if (!result.status) {
            response = INTERNAL_SERVER_ERROR_API_RESPONSE
            response.message = 'Failed to retrieve bills.'
            return res.status(response.status_code).json(response)
        }

        response = { ...SUCCESS_API_RESPONSE }
        response.message = 'Bills retrieved successfully.'
        response.data    = result.data
        return res.status(response.status_code).json(response)
    } catch (e) {
        console.error('[AppController/Bill] List:', e)
        response = { ...INTERNAL_SERVER_ERROR_API_RESPONSE }
        return res.status(response.status_code).json(response)
    }
})

/**
 * GET /api/billing/bills/:id
 * Get a single bill detail including all payment attempt transactions.
 */
router.get('/:id', auth(), async (req, res) => {
    let response = DEFAULT_API_RESPONSE
    try {
        const accountId = req.user.account_id
        const billId    = parseInt(req.params.id)

        if (!billId) {
            response = { ...INTERNAL_SERVER_ERROR_API_RESPONSE }
            response.message = 'Invalid bill ID.'
            return res.status(response.status_code).json(response)
        }

        const result = await AppGetBillDetails(accountId, billId)

        if (!result.status || !result.data) {
            response = { ...NOT_FOUND_API_RESPONSE }
            response.message = 'Bill not found.'
            return res.status(response.status_code).json(response)
        }

        response = { ...SUCCESS_API_RESPONSE }
        response.message = 'Bill details retrieved successfully.'
        response.data    = result.data
        return res.status(response.status_code).json(response)
    } catch (e) {
        console.error('[AppController/Bill] Details:', e)
        response = { ...INTERNAL_SERVER_ERROR_API_RESPONSE }
        return res.status(response.status_code).json(response)
    }
})

/**
 * POST /api/billing/bills/:id/pay
 *
 * Returns a CHIP checkout URL for the user to pay the bill in-app.
 *
 * Logic:
 *   1. If the bill already has a checkout_url → return it immediately
 *      (covers the case where the user left mid-payment and wants to retry
 *       the same CHIP session).
 *   2. If checkout_url is missing → create a new CHIP purchase, persist the
 *      chip_purchase_id + checkout_url on the bill, then return it.
 *
 * Only bills in Pending or Overdue status can be paid.
 */
router.post('/:id/pay', auth(), async (req, res) => {
    let response = DEFAULT_API_RESPONSE
    try {
        const accountId = req.user.account_id
        const billId    = parseInt(req.params.id)

        if (!billId) {
            response = { ...BAD_REQUEST_API_RESPONSE }
            response.message = 'Invalid bill ID.'
            return res.status(response.status_code).json(response)
        }

        // Fetch bill — scoped to this account
        const detailResult = await AppGetBillDetails(accountId, billId)
        if (!detailResult.status || !detailResult.data) {
            response = { ...NOT_FOUND_API_RESPONSE }
            response.message = 'Bill not found.'
            return res.status(response.status_code).json(response)
        }

        const bill = detailResult.data

        // Guard: only unpaid bills can be paid
        if (!['Pending', 'Overdue'].includes(bill.status)) {
            response = { ...BAD_REQUEST_API_RESPONSE }
            response.message = `This bill cannot be paid (status: ${bill.status}).`
            return res.status(response.status_code).json(response)
        }

        // ── Case 1: checkout URL already exists — return it directly ──
        if (bill.checkout_url) {
            response = { ...SUCCESS_API_RESPONSE }
            response.message = 'Checkout URL retrieved.'
            response.data = {
                bill_id:      bill.bill_id,
                bill_no:      bill.bill_no,
                amount:       parseFloat(bill.total_amount),
                currency:     bill.currency,
                status:       bill.status,
                checkout_url: bill.checkout_url,
            }
            return res.status(response.status_code).json(response)
        }

        // ── Case 2: No checkout URL — create a new CHIP purchase ──
        const baseUrl     = process.env.BASE_URL || 'https://dev.taxlah.com'
        const user        = req.user
        const description = bill.bill_description || `TaxLah ${bill.bill_type}`

        const purchaseResult = await ChipPaymentService.createPurchase({
            orderId:            bill.bill_no,
            amount:             parseFloat(bill.total_amount),
            customerEmail:      user.account_email || '',
            customerName:       user.account_name  || user.account_fullname || '',
            productName:        'TaxLah Bill Payment',
            productDescription: description,
            successUrl:         `${baseUrl}/payment/success?bill_no=${bill.bill_no}`,
            failureUrl:         `${baseUrl}/payment/failed?bill_no=${bill.bill_no}`,
            callbackUrl:        `${baseUrl}/api/billing/webhook`,
            metadata: {
                bill_id:      String(bill.bill_id),
                bill_no:      bill.bill_no,
                account_id:   String(accountId),
                payment_type: 'bill',
            },
        })

        if (!purchaseResult.success) {
            console.error('[AppController/Bill] CHIP createPurchase failed:', purchaseResult.error)
            response = { ...INTERNAL_SERVER_ERROR_API_RESPONSE }
            response.message = 'Failed to create payment session. Please try again.'
            return res.status(response.status_code).json(response)
        }

        // Persist chip_purchase_id + checkout_url onto the bill
        await BillingSetCheckoutUrl(
            bill.bill_id,
            purchaseResult.data.purchaseId,
            purchaseResult.data.checkoutUrl
        ).catch(e => console.error('[AppController/Bill] BillingSetCheckoutUrl failed:', e))

        response = { ...SUCCESS_API_RESPONSE }
        response.message = 'Payment session created. Redirect user to checkout_url to complete payment.'
        response.data = {
            bill_id:      bill.bill_id,
            bill_no:      bill.bill_no,
            amount:       parseFloat(bill.total_amount),
            currency:     bill.currency,
            status:       bill.status,
            checkout_url: purchaseResult.data.checkoutUrl,
        }
        return res.status(response.status_code).json(response)
    } catch (e) {
        console.error('[AppController/Bill] Pay:', e)
        response = { ...INTERNAL_SERVER_ERROR_API_RESPONSE }
        return res.status(response.status_code).json(response)
    }
})

module.exports = router
