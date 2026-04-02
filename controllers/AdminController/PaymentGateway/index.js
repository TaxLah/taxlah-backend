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
    AdminGetPaymentGatewaysList,
    AdminGetPaymentGatewayDetails,
    AdminCreatePaymentGateway,
    AdminUpdatePaymentGateway,
    AdminUpdatePaymentGatewayStatus,
    AdminSetPaymentGatewayDefault,
    AdminDeletePaymentGateway,
    AdminCheckPaymentGatewayDuplicate,
} = require('../../../models/AdminModel/PaymentGateway')

const VALID_PROVIDERS    = ['ToyyibPay', 'Chip', 'Stripe', 'Manual']
const VALID_ENVIRONMENTS = ['Production', 'Sandbox']
const VALID_STATUSES     = ['Active', 'Inactive']

/* ─────────────────────────────────────────────────────────────
   GET /superadmin/payment-gateways
   Query: page, limit, provider, environment, status
──────────────────────────────────────────────────────────────── */
router.get('/', superauth(), async (req, res) => {
    let response = DEFAULT_API_RESPONSE
    try {
        const result = await AdminGetPaymentGatewaysList(req.query)
        response = result.status
            ? { ...SUCCESS_API_RESPONSE, ...result.data }
            : INTERNAL_SERVER_ERROR_API_RESPONSE
    } catch (e) {
        console.error('[AdminController/PaymentGateway] List:', e)
        response = INTERNAL_SERVER_ERROR_API_RESPONSE
    }
    return res.status(response.status_code).json(response)
})

/* ─────────────────────────────────────────────────────────────
   GET /superadmin/payment-gateways/:id
──────────────────────────────────────────────────────────────── */
router.get('/:id', superauth(), async (req, res) => {
    let response = DEFAULT_API_RESPONSE
    try {
        const { id } = req.params
        if (!id || isNaN(id)) {
            response = { ...BAD_REQUEST_API_RESPONSE, message: 'Invalid gateway ID.' }
            return res.status(response.status_code).json(response)
        }
        const result = await AdminGetPaymentGatewayDetails(id)
        response = result.status
            ? { ...SUCCESS_API_RESPONSE, data: result.data }
            : { ...NOT_FOUND_API_RESPONSE, message: 'Payment gateway not found.' }
    } catch (e) {
        console.error('[AdminController/PaymentGateway] Details:', e)
        response = INTERNAL_SERVER_ERROR_API_RESPONSE
    }
    return res.status(response.status_code).json(response)
})

/* ─────────────────────────────────────────────────────────────
   POST /superadmin/payment-gateways
   Body: pg_name*, pg_provider*, pg_environment*, pg_apikey,
         pg_secretkey, pg_baseurl, pg_config, pg_payment_methods,
         pg_is_default, status
──────────────────────────────────────────────────────────────── */
router.post('/', superauth(), async (req, res) => {
    let response = DEFAULT_API_RESPONSE
    try {
        const {
            pg_name, pg_provider, pg_environment,
            pg_apikey, pg_secretkey, pg_baseurl,
            pg_config, pg_payment_methods,
            pg_is_default = 0, status = 'Active',
        } = req.body

        if (CHECK_EMPTY([pg_name, pg_provider, pg_environment])) {
            response = { ...BAD_REQUEST_API_RESPONSE, message: 'pg_name, pg_provider and pg_environment are required.' }
            return res.status(response.status_code).json(response)
        }

        if (!VALID_PROVIDERS.includes(pg_provider)) {
            response = { ...BAD_REQUEST_API_RESPONSE, message: `pg_provider must be one of: ${VALID_PROVIDERS.join(', ')}.` }
            return res.status(response.status_code).json(response)
        }

        if (!VALID_ENVIRONMENTS.includes(pg_environment)) {
            response = { ...BAD_REQUEST_API_RESPONSE, message: `pg_environment must be one of: ${VALID_ENVIRONMENTS.join(', ')}.` }
            return res.status(response.status_code).json(response)
        }

        if (!VALID_STATUSES.includes(status)) {
            response = { ...BAD_REQUEST_API_RESPONSE, message: `status must be one of: ${VALID_STATUSES.join(', ')}.` }
            return res.status(response.status_code).json(response)
        }

        // Duplicate check: same name + provider + environment
        const dup = await AdminCheckPaymentGatewayDuplicate(pg_name, pg_provider, pg_environment)
        if (dup.data) {
            response = { ...BAD_REQUEST_API_RESPONSE, message: `A "${pg_provider} ${pg_environment}" gateway named "${pg_name}" already exists.` }
            return res.status(response.status_code).json(response)
        }

        const payload = {
            pg_name:           sanitize(pg_name),
            pg_provider,
            pg_environment,
            pg_is_default:     pg_is_default ? 1 : 0,
            status,
        }
        if (pg_apikey)          payload.pg_apikey          = pg_apikey
        if (pg_secretkey)       payload.pg_secretkey       = pg_secretkey
        if (pg_baseurl)         payload.pg_baseurl         = sanitize(pg_baseurl)
        if (pg_config)          payload.pg_config          = typeof pg_config === 'string' ? pg_config : JSON.stringify(pg_config)
        if (pg_payment_methods) payload.pg_payment_methods = typeof pg_payment_methods === 'string' ? pg_payment_methods : JSON.stringify(pg_payment_methods)

        // If setting as default, clear all others first
        if (payload.pg_is_default) {
            await require('../../../utils/sqlbuilder').raw(
                `UPDATE payment_gateway_conf SET pg_is_default = 0`
            )
        }

        const result = await AdminCreatePaymentGateway(payload)
        response = result.status
            ? { ...SUCCESS_API_RESPONSE, message: 'Payment gateway created successfully.', data: { pg_id: result.data } }
            : INTERNAL_SERVER_ERROR_API_RESPONSE
    } catch (e) {
        console.error('[AdminController/PaymentGateway] Create:', e)
        response = INTERNAL_SERVER_ERROR_API_RESPONSE
    }
    return res.status(response.status_code).json(response)
})

/* ─────────────────────────────────────────────────────────────
   PUT /superadmin/payment-gateways/:id
   Body: any subset of the fields above (keys are only updated
   when explicitly provided in the request body)
──────────────────────────────────────────────────────────────── */
router.put('/:id', superauth(), async (req, res) => {
    let response = DEFAULT_API_RESPONSE
    try {
        const { id } = req.params
        if (!id || isNaN(id)) {
            response = { ...BAD_REQUEST_API_RESPONSE, message: 'Invalid gateway ID.' }
            return res.status(response.status_code).json(response)
        }

        // Verify exists
        const existing = await AdminGetPaymentGatewayDetails(id)
        if (!existing.status) {
            response = { ...NOT_FOUND_API_RESPONSE, message: 'Payment gateway not found.' }
            return res.status(response.status_code).json(response)
        }

        const {
            pg_name, pg_provider, pg_environment,
            pg_apikey, pg_secretkey, pg_baseurl,
            pg_config, pg_payment_methods, status,
        } = req.body

        if (pg_provider && !VALID_PROVIDERS.includes(pg_provider)) {
            response = { ...BAD_REQUEST_API_RESPONSE, message: `pg_provider must be one of: ${VALID_PROVIDERS.join(', ')}.` }
            return res.status(response.status_code).json(response)
        }

        if (pg_environment && !VALID_ENVIRONMENTS.includes(pg_environment)) {
            response = { ...BAD_REQUEST_API_RESPONSE, message: `pg_environment must be one of: ${VALID_ENVIRONMENTS.join(', ')}.` }
            return res.status(response.status_code).json(response)
        }

        if (status && !VALID_STATUSES.includes(status)) {
            response = { ...BAD_REQUEST_API_RESPONSE, message: `status must be one of: ${VALID_STATUSES.join(', ')}.` }
            return res.status(response.status_code).json(response)
        }

        // Duplicate check only when name/provider/environment changes
        const checkName = pg_name        || existing.data.pg_name
        const checkProv = pg_provider    || existing.data.pg_provider
        const checkEnv  = pg_environment || existing.data.pg_environment
        const dup = await AdminCheckPaymentGatewayDuplicate(checkName, checkProv, checkEnv, id)
        if (dup.data) {
            response = { ...BAD_REQUEST_API_RESPONSE, message: `A "${checkProv} ${checkEnv}" gateway named "${checkName}" already exists.` }
            return res.status(response.status_code).json(response)
        }

        const payload = {}
        if (pg_name)            payload.pg_name            = sanitize(pg_name)
        if (pg_provider)        payload.pg_provider        = pg_provider
        if (pg_environment)     payload.pg_environment     = pg_environment
        if (pg_apikey)          payload.pg_apikey          = pg_apikey
        if (pg_secretkey)       payload.pg_secretkey       = pg_secretkey
        if (pg_baseurl)         payload.pg_baseurl         = sanitize(pg_baseurl)
        if (pg_config)          payload.pg_config          = typeof pg_config === 'string' ? pg_config : JSON.stringify(pg_config)
        if (pg_payment_methods) payload.pg_payment_methods = typeof pg_payment_methods === 'string' ? pg_payment_methods : JSON.stringify(pg_payment_methods)
        if (status)             payload.status             = status

        if (!Object.keys(payload).length) {
            response = { ...BAD_REQUEST_API_RESPONSE, message: 'No valid fields provided for update.' }
            return res.status(response.status_code).json(response)
        }

        const result = await AdminUpdatePaymentGateway(id, payload)
        response = result.status
            ? { ...SUCCESS_API_RESPONSE, message: 'Payment gateway updated successfully.' }
            : INTERNAL_SERVER_ERROR_API_RESPONSE
    } catch (e) {
        console.error('[AdminController/PaymentGateway] Update:', e)
        response = INTERNAL_SERVER_ERROR_API_RESPONSE
    }
    return res.status(response.status_code).json(response)
})

/* ─────────────────────────────────────────────────────────────
   PATCH /superadmin/payment-gateways/:id/status
   Body: { status: "Active" | "Inactive" }
──────────────────────────────────────────────────────────────── */
router.patch('/:id/status', superauth(), async (req, res) => {
    let response = DEFAULT_API_RESPONSE
    try {
        const { id } = req.params
        const { status } = req.body

        if (!id || isNaN(id)) {
            response = { ...BAD_REQUEST_API_RESPONSE, message: 'Invalid gateway ID.' }
            return res.status(response.status_code).json(response)
        }

        if (!status || !VALID_STATUSES.includes(status)) {
            response = { ...BAD_REQUEST_API_RESPONSE, message: `status must be one of: ${VALID_STATUSES.join(', ')}.` }
            return res.status(response.status_code).json(response)
        }

        const result = await AdminUpdatePaymentGatewayStatus(id, status)
        response = result.status
            ? { ...SUCCESS_API_RESPONSE, message: `Payment gateway ${status === 'Active' ? 'enabled' : 'disabled'} successfully.` }
            : { ...NOT_FOUND_API_RESPONSE, message: 'Payment gateway not found.' }
    } catch (e) {
        console.error('[AdminController/PaymentGateway] UpdateStatus:', e)
        response = INTERNAL_SERVER_ERROR_API_RESPONSE
    }
    return res.status(response.status_code).json(response)
})

/* ─────────────────────────────────────────────────────────────
   PATCH /superadmin/payment-gateways/:id/default
   Sets this gateway as the default; clears all others.
──────────────────────────────────────────────────────────────── */
router.patch('/:id/default', superauth(), async (req, res) => {
    let response = DEFAULT_API_RESPONSE
    try {
        const { id } = req.params
        if (!id || isNaN(id)) {
            response = { ...BAD_REQUEST_API_RESPONSE, message: 'Invalid gateway ID.' }
            return res.status(response.status_code).json(response)
        }

        // Verify exists
        const existing = await AdminGetPaymentGatewayDetails(id)
        if (!existing.status) {
            response = { ...NOT_FOUND_API_RESPONSE, message: 'Payment gateway not found.' }
            return res.status(response.status_code).json(response)
        }

        const result = await AdminSetPaymentGatewayDefault(id)
        response = result.status
            ? { ...SUCCESS_API_RESPONSE, message: `"${existing.data.pg_name}" is now the default payment gateway.` }
            : INTERNAL_SERVER_ERROR_API_RESPONSE
    } catch (e) {
        console.error('[AdminController/PaymentGateway] SetDefault:', e)
        response = INTERNAL_SERVER_ERROR_API_RESPONSE
    }
    return res.status(response.status_code).json(response)
})

/* ─────────────────────────────────────────────────────────────
   DELETE /superadmin/payment-gateways/:id
──────────────────────────────────────────────────────────────── */
router.delete('/:id', superauth(), async (req, res) => {
    let response = DEFAULT_API_RESPONSE
    try {
        const { id } = req.params
        if (!id || isNaN(id)) {
            response = { ...BAD_REQUEST_API_RESPONSE, message: 'Invalid gateway ID.' }
            return res.status(response.status_code).json(response)
        }

        const existing = await AdminGetPaymentGatewayDetails(id)
        if (!existing.status) {
            response = { ...NOT_FOUND_API_RESPONSE, message: 'Payment gateway not found.' }
            return res.status(response.status_code).json(response)
        }

        // Prevent deleting the current default
        if (existing.data.pg_is_default) {
            response = { ...BAD_REQUEST_API_RESPONSE, message: 'Cannot delete the default payment gateway. Set another gateway as default first.' }
            return res.status(response.status_code).json(response)
        }

        const result = await AdminDeletePaymentGateway(id)
        response = result.status
            ? { ...SUCCESS_API_RESPONSE, message: 'Payment gateway deleted successfully.' }
            : INTERNAL_SERVER_ERROR_API_RESPONSE
    } catch (e) {
        console.error('[AdminController/PaymentGateway] Delete:', e)
        response = INTERNAL_SERVER_ERROR_API_RESPONSE
    }
    return res.status(response.status_code).json(response)
})

module.exports = router
