const express = require('express')
const router  = express.Router()

const {
    DEFAULT_API_RESPONSE, INTERNAL_SERVER_ERROR_API_RESPONSE,
    SUCCESS_API_RESPONSE, BAD_REQUEST_API_RESPONSE, NOT_FOUND_API_RESPONSE
} = require('../../../configs/helper')

const { superauth } = require('../../../configs/auth')

const {
    AdminGetExpensesList, AdminGetExpenseDetails,
    AdminUpdateExpense, AdminUpdateExpenseStatus,
    AdminDeleteExpense, AdminGetExpenseStats
} = require('../../../models/AdminModel/Expense')

/* ─── GET /superadmin/expenses ─── */
router.get('/', superauth(), async (req, res) => {
    let response = DEFAULT_API_RESPONSE
    try {
        const result = await AdminGetExpensesList(req.query)
        response = result.status
            ? { ...SUCCESS_API_RESPONSE, data: result.data }
            : INTERNAL_SERVER_ERROR_API_RESPONSE
    } catch (e) {
        console.error('[AdminController/Expenses] List:', e)
        response = INTERNAL_SERVER_ERROR_API_RESPONSE
    }
    return res.status(response.status_code).json(response)
})

/* ─── GET /superadmin/expenses/stats ─── */
router.get('/stats', superauth(), async (req, res) => {
    let response = DEFAULT_API_RESPONSE
    try {
        const result = await AdminGetExpenseStats()
        response = result.status
            ? { ...SUCCESS_API_RESPONSE, data: result.data }
            : INTERNAL_SERVER_ERROR_API_RESPONSE
    } catch (e) {
        console.error('[AdminController/Expenses] Stats:', e)
        response = INTERNAL_SERVER_ERROR_API_RESPONSE
    }
    return res.status(response.status_code).json(response)
})

/* ─── GET /superadmin/expenses/:expenses_id ─── */
router.get('/:expenses_id', superauth(), async (req, res) => {
    let response = DEFAULT_API_RESPONSE
    try {
        const result = await AdminGetExpenseDetails(req.params.expenses_id)
        response = result.status
            ? { ...SUCCESS_API_RESPONSE, data: result.data }
            : { ...NOT_FOUND_API_RESPONSE, message: 'Expense not found.' }
    } catch (e) {
        console.error('[AdminController/Expenses] View:', e)
        response = INTERNAL_SERVER_ERROR_API_RESPONSE
    }
    return res.status(response.status_code).json(response)
})

/* ─── PUT /superadmin/expenses/:expenses_id ─── */
router.put('/:expenses_id', superauth(), async (req, res) => {
    let response = DEFAULT_API_RESPONSE
    try {
        const allowed = [
            'expenses_name','expenses_description','expense_date',
            'expenses_total_amount','expenses_currency','tax_year'
        ]
        const update = {}
        allowed.forEach(k => { if (req.body[k] !== undefined) update[k] = req.body[k] })

        if (!Object.keys(update).length) {
            response = { ...BAD_REQUEST_API_RESPONSE, message: 'No updatable fields provided.' }
            return res.status(response.status_code).json(response)
        }

        const result = await AdminUpdateExpense(req.params.expenses_id, update)
        response = result.status
            ? { ...SUCCESS_API_RESPONSE, message: 'Expense updated.' }
            : { ...NOT_FOUND_API_RESPONSE, message: 'Expense not found.' }
    } catch (e) {
        console.error('[AdminController/Expenses] Update:', e)
        response = INTERNAL_SERVER_ERROR_API_RESPONSE
    }
    return res.status(response.status_code).json(response)
})

/* ─── PUT /superadmin/expenses/:expenses_id/status ─── */
router.put('/:expenses_id/status', superauth(), async (req, res) => {
    let response = DEFAULT_API_RESPONSE
    try {
        const { status } = req.body
        const VALID = ['Active','Inactive','Deleted']
        if (!status || !VALID.includes(status)) {
            response = { ...BAD_REQUEST_API_RESPONSE, message: `status must be one of: ${VALID.join(', ')}.` }
            return res.status(response.status_code).json(response)
        }

        const result = await AdminUpdateExpenseStatus(req.params.expenses_id, status)
        response = result.status
            ? { ...SUCCESS_API_RESPONSE, message: `Expense status updated to ${status}.` }
            : { ...NOT_FOUND_API_RESPONSE, message: 'Expense not found.' }
    } catch (e) {
        console.error('[AdminController/Expenses] UpdateStatus:', e)
        response = INTERNAL_SERVER_ERROR_API_RESPONSE
    }
    return res.status(response.status_code).json(response)
})

/* ─── DELETE /superadmin/expenses/:expenses_id ─── */
router.delete('/:expenses_id', superauth(), async (req, res) => {
    let response = DEFAULT_API_RESPONSE
    try {
        const result = await AdminDeleteExpense(req.params.expenses_id)
        response = result.status
            ? { ...SUCCESS_API_RESPONSE, message: 'Expense deleted.' }
            : { ...NOT_FOUND_API_RESPONSE, message: 'Expense not found.' }
    } catch (e) {
        console.error('[AdminController/Expenses] Delete:', e)
        response = INTERNAL_SERVER_ERROR_API_RESPONSE
    }
    return res.status(response.status_code).json(response)
})

module.exports = router
