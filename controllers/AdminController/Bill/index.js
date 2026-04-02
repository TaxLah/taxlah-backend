const express = require('express')
const router  = express.Router()

const {
    DEFAULT_API_RESPONSE,
    INTERNAL_SERVER_ERROR_API_RESPONSE,
    SUCCESS_API_RESPONSE,
    BAD_REQUEST_API_RESPONSE,
    NOT_FOUND_API_RESPONSE,
    sanitize,
    CHECK_EMPTY,
} = require('../../../configs/helper')

const { superauth } = require('../../../configs/auth')

const {
    AdminGetBillsList,
    AdminGetBillDetails,
    AdminCreateBill,
    AdminUpdateBill,
    AdminUpdateBillStatus,
    AdminRecordReminderSent,
} = require('../../../models/AdminModel/Bill')

const NotificationService = require('../../../services/NotificationService')

const VALID_STATUSES   = ['Draft', 'Pending', 'Paid', 'Overdue', 'Cancelled', 'Refunded']
const VALID_BILL_TYPES = ['Subscription', 'Renewal', 'TaxReliefReport', 'StorageAddon', 'UserSeatsAddon', 'EnterpriseLicense']

/* ─────────────────────────────────────────────────────────────
   GET /superadmin/bills
   Query: page, limit, search, status, bill_type, year, month, account_id
──────────────────────────────────────────────────────────────── */
router.get('/', superauth(), async (req, res) => {
    let response = DEFAULT_API_RESPONSE
    try {
        const result = await AdminGetBillsList(req.query)
        response = result.status
            ? { ...SUCCESS_API_RESPONSE, ...result.data }
            : INTERNAL_SERVER_ERROR_API_RESPONSE
    } catch (e) {
        console.error('[AdminController/Bill] List:', e)
        response = INTERNAL_SERVER_ERROR_API_RESPONSE
    }
    return res.status(response.status_code).json(response)
})

/* ─────────────────────────────────────────────────────────────
   GET /superadmin/bills/:id
──────────────────────────────────────────────────────────────── */
router.get('/:id', superauth(), async (req, res) => {
    let response = DEFAULT_API_RESPONSE
    try {
        const { id } = req.params
        if (!id || isNaN(id)) {
            response = { ...BAD_REQUEST_API_RESPONSE, message: 'Invalid bill ID.' }
            return res.status(response.status_code).json(response)
        }
        const result = await AdminGetBillDetails(id)
        response = result.status
            ? { ...SUCCESS_API_RESPONSE, data: result.data }
            : { ...NOT_FOUND_API_RESPONSE, message: 'Bill not found.' }
    } catch (e) {
        console.error('[AdminController/Bill] Details:', e)
        response = INTERNAL_SERVER_ERROR_API_RESPONSE
    }
    return res.status(response.status_code).json(response)
})

/* ─────────────────────────────────────────────────────────────
   POST /superadmin/bills
   Body: account_id*, bill_type*, bill_description*, billing_year*,
         billing_month*, subtotal*, due_date*, subscription_id,
         billing_period_start, billing_period_end, sst_rate, notes
──────────────────────────────────────────────────────────────── */
router.post('/', superauth(), async (req, res) => {
    let response = DEFAULT_API_RESPONSE
    try {
        const {
            account_id, subscription_id = null,
            bill_type, bill_description,
            billing_year, billing_month,
            billing_period_start = null, billing_period_end = null,
            subtotal, sst_rate = 0.06,
            due_date, notes = null,
        } = req.body

        console.log("Log Request Body : ", req.body)

        if (CHECK_EMPTY([account_id, bill_type, bill_description, billing_year, billing_month, subtotal, due_date])) {
            response = { ...BAD_REQUEST_API_RESPONSE, message: 'account_id, bill_type, bill_description, billing_year, billing_month, subtotal and due_date are required.' }
            return res.status(response.status_code).json(response)
        }

        if (!VALID_BILL_TYPES.includes(bill_type)) {
            response = { ...BAD_REQUEST_API_RESPONSE, message: `bill_type must be one of: ${VALID_BILL_TYPES.join(', ')}.` }
            return res.status(response.status_code).json(response)
        }

        const month = parseInt(billing_month)
        if (isNaN(month) || month < 1 || month > 12) {
            response = { ...BAD_REQUEST_API_RESPONSE, message: 'billing_month must be a number between 1 and 12.' }
            return res.status(response.status_code).json(response)
        }

        const result = await AdminCreateBill({
            accountId:          parseInt(account_id),
            subscriptionId:     subscription_id ? parseInt(subscription_id) : null,
            billType:           bill_type,
            billDescription:    sanitize(bill_description),
            billingYear:        parseInt(billing_year),
            billingMonth:       month,
            billingPeriodStart: billing_period_start || null,
            billingPeriodEnd:   billing_period_end   || null,
            subtotal:           parseFloat(subtotal),
            sstRate:            parseFloat(sst_rate),
            dueDate:            due_date,
            notes:              notes ? sanitize(notes) : null,
        })

        response = result.success
            ? { ...SUCCESS_API_RESPONSE, message: 'Bill created successfully.', data: result.data }
            : { ...INTERNAL_SERVER_ERROR_API_RESPONSE, message: result.error }
    } catch (e) {
        console.error('[AdminController/Bill] Create:', e)
        response = INTERNAL_SERVER_ERROR_API_RESPONSE
    }
    return res.status(response.status_code).json(response)
})

/* ─────────────────────────────────────────────────────────────
   PUT /superadmin/bills/:id
   Editable fields: due_date, bill_description, notes
──────────────────────────────────────────────────────────────── */
router.put('/:id', superauth(), async (req, res) => {
    let response = DEFAULT_API_RESPONSE
    try {
        const { id } = req.params
        if (!id || isNaN(id)) {
            response = { ...BAD_REQUEST_API_RESPONSE, message: 'Invalid bill ID.' }
            return res.status(response.status_code).json(response)
        }

        const existing = await AdminGetBillDetails(id)
        if (!existing.status) {
            response = { ...NOT_FOUND_API_RESPONSE, message: 'Bill not found.' }
            return res.status(response.status_code).json(response)
        }

        const { due_date, bill_description, notes } = req.body
        const payload = {}
        if (due_date)         payload.due_date         = due_date
        if (bill_description) payload.bill_description = sanitize(bill_description)
        if (notes !== undefined) payload.notes         = notes ? sanitize(notes) : null

        if (!Object.keys(payload).length) {
            response = { ...BAD_REQUEST_API_RESPONSE, message: 'No valid fields provided.' }
            return res.status(response.status_code).json(response)
        }

        const result = await AdminUpdateBill(id, payload)
        response = result.status
            ? { ...SUCCESS_API_RESPONSE, message: 'Bill updated successfully.' }
            : INTERNAL_SERVER_ERROR_API_RESPONSE
    } catch (e) {
        console.error('[AdminController/Bill] Update:', e)
        response = INTERNAL_SERVER_ERROR_API_RESPONSE
    }
    return res.status(response.status_code).json(response)
})

/* ─────────────────────────────────────────────────────────────
   PATCH /superadmin/bills/:id/status
   Body: { status: "Paid" | "Cancelled" | "Overdue" | "Refunded" }
──────────────────────────────────────────────────────────────── */
router.patch('/:id/status', superauth(), async (req, res) => {
    let response = DEFAULT_API_RESPONSE
    try {
        const { id } = req.params
        const { status } = req.body

        if (!id || isNaN(id)) {
            response = { ...BAD_REQUEST_API_RESPONSE, message: 'Invalid bill ID.' }
            return res.status(response.status_code).json(response)
        }

        if (!status || !VALID_STATUSES.includes(status)) {
            response = { ...BAD_REQUEST_API_RESPONSE, message: `status must be one of: ${VALID_STATUSES.join(', ')}.` }
            return res.status(response.status_code).json(response)
        }

        const existing = await AdminGetBillDetails(id)
        if (!existing.status) {
            response = { ...NOT_FOUND_API_RESPONSE, message: 'Bill not found.' }
            return res.status(response.status_code).json(response)
        }

        const result = await AdminUpdateBillStatus(id, status)
        response = result.success || result.status
            ? { ...SUCCESS_API_RESPONSE, message: `Bill marked as ${status}.` }
            : INTERNAL_SERVER_ERROR_API_RESPONSE
    } catch (e) {
        console.error('[AdminController/Bill] UpdateStatus:', e)
        response = INTERNAL_SERVER_ERROR_API_RESPONSE
    }
    return res.status(response.status_code).json(response)
})

/* ─────────────────────────────────────────────────────────────
   POST /superadmin/bills/:id/send-reminder
   Sends push notification + email reminder to the customer
   with the checkout_url embedded.
──────────────────────────────────────────────────────────────── */
router.post('/:id/send-reminder', superauth(), async (req, res) => {
    let response = DEFAULT_API_RESPONSE
    try {
        const { id } = req.params
        if (!id || isNaN(id)) {
            response = { ...BAD_REQUEST_API_RESPONSE, message: 'Invalid bill ID.' }
            return res.status(response.status_code).json(response)
        }

        const billResult = await AdminGetBillDetails(id)
        if (!billResult.status) {
            response = { ...NOT_FOUND_API_RESPONSE, message: 'Bill not found.' }
            return res.status(response.status_code).json(response)
        }

        const bill = billResult.data
        if (!['Pending', 'Overdue'].includes(bill.status)) {
            response = { ...BAD_REQUEST_API_RESPONSE, message: `Reminders can only be sent for Pending or Overdue bills. Current status: ${bill.status}.` }
            return res.status(response.status_code).json(response)
        }

        if (!bill.checkout_url) {
            response = { ...BAD_REQUEST_API_RESPONSE, message: 'This bill has no checkout URL. Generate a payment link first.' }
            return res.status(response.status_code).json(response)
        }

        const title = bill.status === 'Overdue'
            ? `⚠️ Overdue Bill: ${bill.bill_no}`
            : `📄 Payment Reminder: ${bill.bill_no}`
        const body  = `Your bill of MYR ${parseFloat(bill.total_amount).toFixed(2)} (${bill.bill_description}) is ${bill.status.toLowerCase()}. Please complete your payment.`

        // Push notification
        try {
            await NotificationService.sendUserNotification(
                bill.account_id,
                title,
                body,
                { type: 'BillReminder', bill_id: String(id), checkout_url: bill.checkout_url }
            )
        } catch (notifErr) {
            console.error('[AdminController/Bill] Reminder push failed:', notifErr)
        }

        // Record reminder sent
        await AdminRecordReminderSent(id)

        response = { ...SUCCESS_API_RESPONSE, message: 'Reminder sent successfully.' }
    } catch (e) {
        console.error('[AdminController/Bill] SendReminder:', e)
        response = INTERNAL_SERVER_ERROR_API_RESPONSE
    }
    return res.status(response.status_code).json(response)
})

module.exports = router
