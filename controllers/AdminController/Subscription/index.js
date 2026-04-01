const express = require('express')
const router  = express.Router()

const {
    DEFAULT_API_RESPONSE, INTERNAL_SERVER_ERROR_API_RESPONSE,
    SUCCESS_API_RESPONSE, BAD_REQUEST_API_RESPONSE, NOT_FOUND_API_RESPONSE
} = require('../../../configs/helper')

const { superauth } = require('../../../configs/auth')

const {
    AdminGetSubscriptionsList, AdminGetSubscriptionDetails,
    AdminGetUserSubscription, AdminUpdateSubscription, AdminRemoveSubscription
} = require('../../../models/AdminModel/Subscription')

/* ─── GET /superadmin/subscriptions ─── */
router.get('/', superauth(), async (req, res) => {
    let response = DEFAULT_API_RESPONSE
    try {
        const result = await AdminGetSubscriptionsList(req.query)
        response = result.status
            ? { ...SUCCESS_API_RESPONSE, data: result.data }
            : INTERNAL_SERVER_ERROR_API_RESPONSE
    } catch (e) {
        console.error('[AdminController/Subscription] List:', e)
        response = INTERNAL_SERVER_ERROR_API_RESPONSE
    }
    return res.status(response.status_code).json(response)
})

/* ─── GET /superadmin/subscriptions/user/:account_id ─── */
router.get('/user/:account_id', superauth(), async (req, res) => {
    let response = DEFAULT_API_RESPONSE
    try {
        const result = await AdminGetUserSubscription(req.params.account_id)
        response = result.status
            ? { ...SUCCESS_API_RESPONSE, data: result.data }
            : { ...NOT_FOUND_API_RESPONSE, message: 'No subscription found for this user.' }
    } catch (e) {
        console.error('[AdminController/Subscription] UserSub:', e)
        response = INTERNAL_SERVER_ERROR_API_RESPONSE
    }
    return res.status(response.status_code).json(response)
})

/* ─── GET /superadmin/subscriptions/:subscription_id ─── */
router.get('/:subscription_id', superauth(), async (req, res) => {
    let response = DEFAULT_API_RESPONSE
    try {
        const result = await AdminGetSubscriptionDetails(req.params.subscription_id)
        response = result.status
            ? { ...SUCCESS_API_RESPONSE, data: result.data }
            : { ...NOT_FOUND_API_RESPONSE, message: 'Subscription not found.' }
    } catch (e) {
        console.error('[AdminController/Subscription] View:', e)
        response = INTERNAL_SERVER_ERROR_API_RESPONSE
    }
    return res.status(response.status_code).json(response)
})

/* ─── PUT /superadmin/subscriptions/:subscription_id ─── */
router.put('/:subscription_id', superauth(), async (req, res) => {
    let response = DEFAULT_API_RESPONSE
    try {
        const allowed = [
            'sub_package_id','billing_period','price_amount',
            'start_date','current_period_start','current_period_end',
            'status','auto_renew','ended_at'
        ]
        const update = {}
        allowed.forEach(k => { if (req.body[k] !== undefined) update[k] = req.body[k] })

        if (!Object.keys(update).length) {
            response = { ...BAD_REQUEST_API_RESPONSE, message: 'No updatable fields provided.' }
            return res.status(response.status_code).json(response)
        }

        const result = await AdminUpdateSubscription(req.params.subscription_id, update)
        response = result.status
            ? { ...SUCCESS_API_RESPONSE, message: 'Subscription updated.' }
            : { ...NOT_FOUND_API_RESPONSE, message: 'Subscription not found.' }
    } catch (e) {
        console.error('[AdminController/Subscription] Update:', e)
        response = INTERNAL_SERVER_ERROR_API_RESPONSE
    }
    return res.status(response.status_code).json(response)
})

/* ─── DELETE /superadmin/subscriptions/:subscription_id ─── */
router.delete('/:subscription_id', superauth(), async (req, res) => {
    let response = DEFAULT_API_RESPONSE
    try {
        const result = await AdminRemoveSubscription(req.params.subscription_id)
        response = result.status
            ? { ...SUCCESS_API_RESPONSE, message: 'Subscription removed.' }
            : { ...NOT_FOUND_API_RESPONSE, message: 'Subscription not found.' }
    } catch (e) {
        console.error('[AdminController/Subscription] Remove:', e)
        response = INTERNAL_SERVER_ERROR_API_RESPONSE
    }
    return res.status(response.status_code).json(response)
})

module.exports = router
