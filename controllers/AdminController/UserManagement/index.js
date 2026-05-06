const express = require('express')
const router  = express.Router()
const bcrypt  = require('bcrypt')

const {
    DEFAULT_API_RESPONSE, INTERNAL_SERVER_ERROR_API_RESPONSE,
    SUCCESS_API_RESPONSE, BAD_REQUEST_API_RESPONSE,
    NOT_FOUND_API_RESPONSE, CHECK_EMPTY, sanitize
} = require('../../../configs/helper')

const { superauth } = require('../../../configs/auth')

const {
    AdminGetUsersList, AdminGetUserDetails, AdminUpdateUserStatus,
    AdminUpdateUserProfile, AdminDeleteUser, AdminGetUserStats, AdminGetUserActivityLogs,
    AdminGetUserSubscriptionPayments, AdminGetUserApprovalList
} = require('../../../models/AdminModel/UserManagement')

const {
    AdminGetDependantsList, AdminGetDependantDetails,
    AdminCreateDependant, AdminUpdateDependant, AdminDeleteDependant
} = require('../../../models/AdminModel/Dependant')

const db = require('../../../utils/sqlbuilder')

/* ─── GET /superadmin/users ─── */
router.get('/', superauth(), async (req, res) => {
    let response = DEFAULT_API_RESPONSE
    try {
        const result = await AdminGetUsersList(req.query)
        response = result.status
            ? { ...SUCCESS_API_RESPONSE, data: result.data }
            : INTERNAL_SERVER_ERROR_API_RESPONSE
    } catch (e) {
        console.error('[AdminController/UserManagement] List:', e)
        response = INTERNAL_SERVER_ERROR_API_RESPONSE
    }
    return res.status(response.status_code).json(response)
})

/* ─── GET /superadmin/users/stats ─── */
router.get('/stats', superauth(), async (req, res) => {
    let response = DEFAULT_API_RESPONSE
    try {
        const result = await AdminGetUserStats()
        response = result.status
            ? { ...SUCCESS_API_RESPONSE, data: result.data }
            : INTERNAL_SERVER_ERROR_API_RESPONSE
    } catch (e) {
        console.error('[AdminController/UserManagement] Stats:', e)
        response = INTERNAL_SERVER_ERROR_API_RESPONSE
    }
    return res.status(response.status_code).json(response)
})

/* ─── GET /superadmin/users/:account_id ─── */
router.get('/:account_id', superauth(), async (req, res) => {
    let response = DEFAULT_API_RESPONSE
    try {
        const result = await AdminGetUserDetails(req.params.account_id)
        response = result.status
            ? { ...SUCCESS_API_RESPONSE, data: result.data }
            : { ...NOT_FOUND_API_RESPONSE, message: 'User not found.' }
    } catch (e) {
        console.error('[AdminController/UserManagement] View:', e)
        response = INTERNAL_SERVER_ERROR_API_RESPONSE
    }
    return res.status(response.status_code).json(response)
})

/* ─── POST /superadmin/users ─── */
router.post('/', superauth(), async (req, res) => {
    let response = DEFAULT_API_RESPONSE
    try {
        const {
            account_name, account_fullname, account_email, account_contact,
            account_password, account_status = 'Active'
        } = req.body

        if (CHECK_EMPTY(account_name) || CHECK_EMPTY(account_email) || CHECK_EMPTY(account_password)) {
            response = { ...BAD_REQUEST_API_RESPONSE, message: 'account_name, account_email, and account_password are required.' }
            return res.status(response.status_code).json(response)
        }

        // Check email uniqueness
        const [existing] = await db.raw(`SELECT account_id FROM account WHERE account_email = ? LIMIT 1`, [sanitize(account_email)])
        if (existing) {
            response = { ...BAD_REQUEST_API_RESPONSE, message: 'Email already registered.' }
            return res.status(response.status_code).json(response)
        }

        const hashed      = await bcrypt.hash(account_password, 12)
        const secret_key  = require('crypto').randomBytes(16).toString('hex')

        const insertResult = await db.insert('account', {
            account_name:     sanitize(account_name),
            account_fullname: account_fullname ? sanitize(account_fullname) : null,
            account_email:    sanitize(account_email),
            account_contact:  account_contact || null,
            account_status,
            account_secret_key: secret_key,
            created_date: new Date()
        })

        if (!insertResult.insertId) {
            response = INTERNAL_SERVER_ERROR_API_RESPONSE
            return res.status(response.status_code).json(response)
        }

        // Create auth_access
        await db.insert('auth_access', {
            account_id:   insertResult.insertId,
            auth_username: sanitize(account_email),
            auth_usermail: sanitize(account_email),
            auth_password: hashed,
            auth_role:     'User',
            auth_status:   'Active',
            auth_is_verified: 'No',
            created_date: new Date()
        })

        response = { ...SUCCESS_API_RESPONSE, message: 'User created.', data: { account_id: insertResult.insertId } }
    } catch (e) {
        console.error('[AdminController/UserManagement] Create:', e)
        response = INTERNAL_SERVER_ERROR_API_RESPONSE
    }
    return res.status(response.status_code).json(response)
})

/* ─── PUT /superadmin/users/:account_id ─── */
router.put('/:account_id', superauth(), async (req, res) => {
    let response = DEFAULT_API_RESPONSE
    console.log("Log Params : ", req.body)

    try {
        const allowed = [
            'account_fullname',
            'account_name',
            'account_email',
            'account_contact',
            'account_gender',
            'account_ic',
            'accocunt_dob',
            'account_is_employed',
            'account_is_tax_declared',
            'account_salary_range',
            'account_address_1',
            'account_address_2',
            'account_address_3',
            'account_address_postcode',
            'account_address_city',
            'account_address_state',
            'account_status',
            'account_verified'
        ]
        const update = {}
        allowed.forEach(k => { if (req.body[k] !== undefined) update[k] = req.body[k] })

        if (!Object.keys(update).length) {
            response = { ...BAD_REQUEST_API_RESPONSE, message: 'No updatable fields provided.' }
            return res.status(response.status_code).json(response)
        }

        update.last_modified = new Date()
        const result = await AdminUpdateUserProfile(req.params.account_id, update)
        response = result.status
            ? { ...SUCCESS_API_RESPONSE, message: 'User updated.' }
            : { ...NOT_FOUND_API_RESPONSE, message: 'User not found or no changes.' }
    } catch (e) {
        console.error('[AdminController/UserManagement] Update:', e)
        response = INTERNAL_SERVER_ERROR_API_RESPONSE
    }
    return res.status(response.status_code).json(response)
})

/* ─── PUT /superadmin/users/:account_id/status ─── */
router.put('/:account_id/status', superauth(), async (req, res) => {
    let response = DEFAULT_API_RESPONSE
    try {
        const { status } = req.body
        const VALID = ['Active','Suspended','Pending','Others']

        if (!status || !VALID.includes(status)) {
            response = { ...BAD_REQUEST_API_RESPONSE, message: `status must be one of: ${VALID.join(', ')}.` }
            return res.status(response.status_code).json(response)
        }

        const result = await AdminUpdateUserStatus(req.params.account_id, status)
        response = result.status
            ? { ...SUCCESS_API_RESPONSE, message: `User status updated to ${status}.` }
            : { ...NOT_FOUND_API_RESPONSE, message: 'User not found.' }
    } catch (e) {
        console.error('[AdminController/UserManagement] UpdateStatus:', e)
        response = INTERNAL_SERVER_ERROR_API_RESPONSE
    }
    return res.status(response.status_code).json(response)
})

/* ─── PUT /superadmin/users/:account_id/credentials ─── */
router.put('/:account_id/credentials', superauth(), async (req, res) => {
    let response = DEFAULT_API_RESPONSE
    try {
        const { account_id } = req.params
        const { new_email, new_password } = req.body

        if (CHECK_EMPTY(new_email) && CHECK_EMPTY(new_password)) {
            response = { ...BAD_REQUEST_API_RESPONSE, message: 'Provide new_email or new_password.' }
            return res.status(response.status_code).json(response)
        }

        const update = {}
        const accountUpdate = {}

        if (!CHECK_EMPTY(new_email)) {
            update.auth_usermail  = sanitize(new_email)
            update.auth_username  = sanitize(new_email)
            accountUpdate.account_email = sanitize(new_email)
        }
        if (!CHECK_EMPTY(new_password)) {
            if (new_password.length < 8) {
                response = { ...BAD_REQUEST_API_RESPONSE, message: 'Password must be at least 8 characters.' }
                return res.status(response.status_code).json(response)
            }
            update.auth_password = await bcrypt.hash(new_password, 12)
        }

        await db.update('auth_access', update, { account_id })
        if (Object.keys(accountUpdate).length) {
            await db.update('account', accountUpdate, { account_id })
        }

        response = { ...SUCCESS_API_RESPONSE, message: 'Credentials updated.' }
    } catch (e) {
        console.error('[AdminController/UserManagement] UpdateCredentials:', e)
        response = INTERNAL_SERVER_ERROR_API_RESPONSE
    }
    return res.status(response.status_code).json(response)
})

/* ─── DELETE /superadmin/users/:account_id ─── */
router.delete('/:account_id', superauth(), async (req, res) => {
    let response = DEFAULT_API_RESPONSE
    try {
        const result = await AdminDeleteUser(req.params.account_id)
        response = result.status
            ? { ...SUCCESS_API_RESPONSE, message: 'User deleted.' }
            : { ...NOT_FOUND_API_RESPONSE, message: 'User not found.' }
    } catch (e) {
        console.error('[AdminController/UserManagement] Delete:', e)
        response = INTERNAL_SERVER_ERROR_API_RESPONSE
    }
    return res.status(response.status_code).json(response)
})

/* ─── GET /superadmin/users/:account_id/activity ─── */
router.get('/:account_id/activity', superauth(), async (req, res) => {
    let response = DEFAULT_API_RESPONSE
    try {
        const result = await AdminGetUserActivityLogs(req.params.account_id, req.query.limit || 50)
        response = result.status
            ? { ...SUCCESS_API_RESPONSE, data: result.data }
            : INTERNAL_SERVER_ERROR_API_RESPONSE
    } catch (e) {
        console.error('[AdminController/UserManagement] Activity:', e)
        response = INTERNAL_SERVER_ERROR_API_RESPONSE
    }
    return res.status(response.status_code).json(response)
})

/* ─── GET /superadmin/users/:account_id/expenses ─── */
router.get('/:account_id/expenses', superauth(), async (req, res) => {
    let response = DEFAULT_API_RESPONSE
    try {
        const { page = 1, limit = 10 } = req.query
        const offset = (parseInt(page) - 1) * parseInt(limit)
        const [{ total }] = await db.raw(`SELECT COUNT(*) as total FROM account_expenses WHERE account_id = ? AND status = 'Active'`, [req.params.account_id])
        const rows = await db.raw(
            `SELECT * FROM account_expenses WHERE account_id = ? AND status = 'Active' ORDER BY expenses_date DESC LIMIT ${parseInt(limit)} OFFSET ${offset}`,
            [req.params.account_id]
        )
        response = {
            ...SUCCESS_API_RESPONSE,
            data: { rows, total, page: parseInt(page), limit: parseInt(limit), totalPages: Math.ceil(total / parseInt(limit)) }
        }
    } catch (e) {
        console.error('[AdminController/UserManagement] UserExpenses:', e)
        response = INTERNAL_SERVER_ERROR_API_RESPONSE
    }
    return res.status(response.status_code).json(response)
})

/* ─── GET /superadmin/users/:account_id/dependants ─── */
router.get('/:account_id/dependants', superauth(), async (req, res) => {
    let response = DEFAULT_API_RESPONSE
    try {
        const result = await AdminGetDependantsList(req.params.account_id, req.query)
        response = result.status
            ? { ...SUCCESS_API_RESPONSE, data: result.data }
            : INTERNAL_SERVER_ERROR_API_RESPONSE
    } catch (e) {
        console.error('[AdminController/UserManagement] DependantsList:', e)
        response = INTERNAL_SERVER_ERROR_API_RESPONSE
    }
    return res.status(response.status_code).json(response)
})

/* ─── POST /superadmin/users/:account_id/dependants ─── */
router.post('/:account_id/dependants', superauth(), async (req, res) => {
    let response = DEFAULT_API_RESPONSE
    try {
        const { account_id } = req.params
        const { dependant_name, dependant_relationship } = req.body

        if (CHECK_EMPTY(dependant_name)) {
            response = { ...BAD_REQUEST_API_RESPONSE, message: 'dependant_name is required.' }
            return res.status(response.status_code).json(response)
        }

        const result = await AdminCreateDependant({
            account_id,
            dependant_name:         sanitize(dependant_name),
            dependant_relationship: dependant_relationship || null,
            ...req.body,
            created_date: new Date()
        })

        response = result.status
            ? { ...SUCCESS_API_RESPONSE, message: 'Dependant created.', data: { dependant_id: result.data } }
            : INTERNAL_SERVER_ERROR_API_RESPONSE
    } catch (e) {
        console.error('[AdminController/UserManagement] CreateDependant:', e)
        response = INTERNAL_SERVER_ERROR_API_RESPONSE
    }
    return res.status(response.status_code).json(response)
})

/* ─── PUT /superadmin/users/:account_id/dependants/:dependant_id ─── */
router.put('/:account_id/dependants/:dependant_id', superauth(), async (req, res) => {
    let response = DEFAULT_API_RESPONSE
    try {
        const allowed = ['dependant_name','dependant_relationship','dependant_nric','dependant_dob','dependant_disability','status']
        const update = {}
        allowed.forEach(k => { if (req.body[k] !== undefined) update[k] = req.body[k] })

        if (!Object.keys(update).length) {
            response = { ...BAD_REQUEST_API_RESPONSE, message: 'No fields to update.' }
            return res.status(response.status_code).json(response)
        }

        const result = await AdminUpdateDependant(req.params.dependant_id, update)
        response = result.status
            ? { ...SUCCESS_API_RESPONSE, message: 'Dependant updated.' }
            : { ...NOT_FOUND_API_RESPONSE, message: 'Dependant not found.' }
    } catch (e) {
        console.error('[AdminController/UserManagement] UpdateDependant:', e)
        response = INTERNAL_SERVER_ERROR_API_RESPONSE
    }
    return res.status(response.status_code).json(response)
})

/* ─── DELETE /superadmin/users/:account_id/dependants/:dependant_id ─── */
router.delete('/:account_id/dependants/:dependant_id', superauth(), async (req, res) => {
    let response = DEFAULT_API_RESPONSE
    try {
        const result = await AdminDeleteDependant(req.params.dependant_id)
        response = result.status
            ? { ...SUCCESS_API_RESPONSE, message: 'Dependant deleted.' }
            : { ...NOT_FOUND_API_RESPONSE, message: 'Dependant not found.' }
    } catch (e) {
        console.error('[AdminController/UserManagement] DeleteDependant:', e)
        response = INTERNAL_SERVER_ERROR_API_RESPONSE
    }
    return res.status(response.status_code).json(response)
})


/* ─── GET /superadmin/users/:account_id/approvals ─── */
router.get('/:account_id/approvals', superauth(), async (req, res) => {
    let response = DEFAULT_API_RESPONSE
    try {
        const account_id = parseInt(req.params.account_id)
        if (!account_id || isNaN(account_id)) {
            return res.status(400).json({ ...BAD_REQUEST_API_RESPONSE, message: 'Invalid account_id' })
        }

        const result = await AdminGetUserApprovalList(account_id, req.query)
        response = result.status
            ? { ...SUCCESS_API_RESPONSE, data: result.data }
            : INTERNAL_SERVER_ERROR_API_RESPONSE
    } catch (e) {
        console.error('[AdminController/UserManagement] ApprovalList:', e)
        response = INTERNAL_SERVER_ERROR_API_RESPONSE
    }
    return res.status(response.status_code).json(response)
})

/* ─── GET /superadmin/users/:account_id/subscription-payments ─── */
router.get('/:account_id/subscription-payments', superauth(), async (req, res) => {
    let response = DEFAULT_API_RESPONSE
    try {
        const account_id = parseInt(req.params.account_id)
        if (!account_id || isNaN(account_id)) {
            return res.status(400).json({ ...BAD_REQUEST_API_RESPONSE, message: 'Invalid account_id' })
        }

        const result = await AdminGetUserSubscriptionPayments(account_id, req.query)
        response = result.status
            ? { ...SUCCESS_API_RESPONSE, data: result.data }
            : INTERNAL_SERVER_ERROR_API_RESPONSE
    } catch (e) {
        console.error('[AdminController/UserManagement] SubscriptionPayments:', e)
        response = INTERNAL_SERVER_ERROR_API_RESPONSE
    }
    return res.status(response.status_code).json(response)
})

module.exports = router
