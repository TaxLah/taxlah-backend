const express = require('express')
const router  = express.Router()

const {
    DEFAULT_API_RESPONSE, INTERNAL_SERVER_ERROR_API_RESPONSE,
    SUCCESS_API_RESPONSE, BAD_REQUEST_API_RESPONSE, NOT_FOUND_API_RESPONSE, CHECK_EMPTY
} = require('../../../configs/helper')

const { superauth } = require('../../../configs/auth')

const {
    AdminGetPackagesList, AdminGetPackageDetails,
    AdminCreatePackage, AdminUpdatePackage, AdminDeletePackage,
    AdminAssignSubscription
} = require('../../../models/AdminModel/Package')

const { AdminRemoveSubscription } = require('../../../models/AdminModel/Subscription')

/* ─── GET /superadmin/packages ─── */
router.get('/', superauth(), async (req, res) => {
    let response = DEFAULT_API_RESPONSE
    try {
        const result = await AdminGetPackagesList(req.query)
        response = result.status
            ? { ...SUCCESS_API_RESPONSE, data: result.data }
            : INTERNAL_SERVER_ERROR_API_RESPONSE
    } catch (e) {
        console.error('[AdminController/Package] List:', e)
        response = INTERNAL_SERVER_ERROR_API_RESPONSE
    }
    return res.status(response.status_code).json(response)
})

/* ─── GET /superadmin/packages/:package_id ─── */
router.get('/:package_id', superauth(), async (req, res) => {
    let response = DEFAULT_API_RESPONSE
    try {
        const result = await AdminGetPackageDetails(req.params.package_id)
        response = result.status
            ? { ...SUCCESS_API_RESPONSE, data: result.data }
            : { ...NOT_FOUND_API_RESPONSE, message: 'Package not found.' }
    } catch (e) {
        console.error('[AdminController/Package] View:', e)
        response = INTERNAL_SERVER_ERROR_API_RESPONSE
    }
    return res.status(response.status_code).json(response)
})

/* ─── POST /superadmin/packages ─── */
router.post('/', superauth(), async (req, res) => {
    let response = DEFAULT_API_RESPONSE
    try {
        const {
            package_code, package_name, billing_period, price_amount,
            features, max_receipts, max_reports, storage_limit_mb,
            sort_order = 0, status = 'Active', package_description
        } = req.body

        if (CHECK_EMPTY(package_code) || CHECK_EMPTY(package_name) || CHECK_EMPTY(billing_period) || price_amount === undefined) {
            response = { ...BAD_REQUEST_API_RESPONSE, message: 'package_code, package_name, billing_period, and price_amount are required.' }
            return res.status(response.status_code).json(response)
        }

        const VALID_BILLING = ['Monthly','Yearly','Lifetime']
        if (!VALID_BILLING.includes(billing_period)) {
            response = { ...BAD_REQUEST_API_RESPONSE, message: `billing_period must be one of: ${VALID_BILLING.join(', ')}.` }
            return res.status(response.status_code).json(response)
        }

        const result = await AdminCreatePackage({
            package_code, package_name, billing_period,
            price_amount: parseFloat(price_amount),
            package_description:  package_description || null,
            features:             features ? JSON.stringify(features) : null,
            max_receipts:         max_receipts   || null,
            max_reports:          max_reports    || null,
            storage_limit_mb:     storage_limit_mb || null,
            sort_order,
            status,
            created_date: new Date()
        })

        response = result.status
            ? { ...SUCCESS_API_RESPONSE, message: 'Package created.', data: { sub_package_id: result.data } }
            : INTERNAL_SERVER_ERROR_API_RESPONSE
    } catch (e) {
        console.error('[AdminController/Package] Create:', e)
        response = INTERNAL_SERVER_ERROR_API_RESPONSE
    }
    return res.status(response.status_code).json(response)
})

/* ─── PUT /superadmin/packages/:package_id ─── */
router.put('/:package_id', superauth(), async (req, res) => {
    let response = DEFAULT_API_RESPONSE
    try {
        const allowed = [
            'package_name','package_description','billing_period','price_amount',
            'features','max_receipts','max_reports','storage_limit_mb','sort_order','status'
        ]
        const update = {}
        allowed.forEach(k => {
            if (req.body[k] !== undefined) {
                update[k] = k === 'features' && typeof req.body[k] === 'object'
                    ? JSON.stringify(req.body[k])
                    : req.body[k]
            }
        })

        if (!Object.keys(update).length) {
            response = { ...BAD_REQUEST_API_RESPONSE, message: 'No updatable fields provided.' }
            return res.status(response.status_code).json(response)
        }

        const result = await AdminUpdatePackage(req.params.package_id, update)
        response = result.status
            ? { ...SUCCESS_API_RESPONSE, message: 'Package updated.' }
            : { ...NOT_FOUND_API_RESPONSE, message: 'Package not found.' }
    } catch (e) {
        console.error('[AdminController/Package] Update:', e)
        response = INTERNAL_SERVER_ERROR_API_RESPONSE
    }
    return res.status(response.status_code).json(response)
})

/* ─── DELETE /superadmin/packages/:package_id ─── */
router.delete('/:package_id', superauth(), async (req, res) => {
    let response = DEFAULT_API_RESPONSE
    try {
        const result = await AdminDeletePackage(req.params.package_id)
        response = result.status
            ? { ...SUCCESS_API_RESPONSE, message: 'Package archived.' }
            : { ...NOT_FOUND_API_RESPONSE, message: 'Package not found.' }
    } catch (e) {
        console.error('[AdminController/Package] Delete:', e)
        response = INTERNAL_SERVER_ERROR_API_RESPONSE
    }
    return res.status(response.status_code).json(response)
})

/* ─── POST /superadmin/packages/assign ─── Assign subscription to a user ─── */
router.post('/assign', superauth(), async (req, res) => {
    let response = DEFAULT_API_RESPONSE
    try {
        const {
            account_id, sub_package_id, billing_period,
            price_amount, start_date, current_period_start, current_period_end,
            status = 'Active', auto_renew = 'No'
        } = req.body

        if (CHECK_EMPTY(account_id) || CHECK_EMPTY(sub_package_id)) {
            response = { ...BAD_REQUEST_API_RESPONSE, message: 'account_id and sub_package_id are required.' }
            return res.status(response.status_code).json(response)
        }

        const subscription_ref = `SUB-${Date.now()}-${account_id}`

        const result = await AdminAssignSubscription({
            account_id, sub_package_id, billing_period, price_amount,
            start_date: start_date || new Date(),
            current_period_start: current_period_start || new Date(),
            current_period_end: current_period_end || null,
            status, auto_renew,
            subscription_ref,
            created_date: new Date()
        })

        response = result.status
            ? { ...SUCCESS_API_RESPONSE, message: 'Subscription assigned.', data: { subscription_id: result.data } }
            : INTERNAL_SERVER_ERROR_API_RESPONSE
    } catch (e) {
        console.error('[AdminController/Package] AssignSubscription:', e)
        response = INTERNAL_SERVER_ERROR_API_RESPONSE
    }
    return res.status(response.status_code).json(response)
})

/* ─── DELETE /superadmin/packages/assign/:subscription_id ─── Remove user subscription ─── */
router.delete('/assign/:subscription_id', superauth(), async (req, res) => {
    let response = DEFAULT_API_RESPONSE
    try {
        const result = await AdminRemoveSubscription(req.params.subscription_id)
        response = result.status
            ? { ...SUCCESS_API_RESPONSE, message: 'Subscription removed.' }
            : { ...NOT_FOUND_API_RESPONSE, message: 'Subscription not found.' }
    } catch (e) {
        console.error('[AdminController/Package] RemoveSubscription:', e)
        response = INTERNAL_SERVER_ERROR_API_RESPONSE
    }
    return res.status(response.status_code).json(response)
})

module.exports = router
