/**
 * Admin management of the adverts shown in the app.
 *
 * Every route is behind superauth(); the SuperAdminRouter additionally applies CSRF
 * protection to the mutating verbs.
 */

const express = require('express')
const router = express.Router()

const {
    DEFAULT_API_RESPONSE,
    SUCCESS_API_RESPONSE,
    BAD_REQUEST_API_RESPONSE,
    NOT_FOUND_API_RESPONSE,
    INTERNAL_SERVER_ERROR_API_RESPONSE,
    sanitize,
} = require('../../../configs/helper')

const { superauth } = require('../../../configs/auth')
const Advertisement = require('../../../models/AppModel/AdvertisementService')

const ACTION_TYPES = ['None', 'Screen', 'Url']
const STATUSES = ['Active', 'Inactive']

const HEX_RE = /^#[0-9A-Fa-f]{6}$/
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * Validates and normalises an advert payload.
 *
 * Returns { data, errors }. Callers apply `data` only when `errors` is empty.
 *
 * `partial` skips required-field checks so the same rules serve both create and update
 * without the update path silently wiping fields the caller did not send.
 */
function buildPayload(body, { partial = false } = {}) {
    const errors = []
    const data = {}

    const has = (k) => Object.prototype.hasOwnProperty.call(body, k)

    // ── Title ──
    if (has('ad_title') || !partial) {
        const title = body.ad_title ? sanitize(String(body.ad_title).trim()) : ''
        if (!title) errors.push('ad_title is required.')
        else if (title.length > 120) errors.push('ad_title must be 120 characters or fewer.')
        else data.ad_title = title
    }

    // ── Optional text ──
    if (has('ad_description')) {
        const v = body.ad_description ? sanitize(String(body.ad_description).trim()) : null
        if (v && v.length > 500) errors.push('ad_description must be 500 characters or fewer.')
        else data.ad_description = v || null
    }

    if (has('ad_cta_label')) {
        const v = body.ad_cta_label ? sanitize(String(body.ad_cta_label).trim()) : null
        if (v && v.length > 60) errors.push('ad_cta_label must be 60 characters or fewer.')
        else data.ad_cta_label = v || null
    }

    if (has('ad_icon')) {
        const v = body.ad_icon ? String(body.ad_icon).trim() : null
        // Icon names are resolved against lucide at render time; keep it to a plain
        // identifier so nothing odd reaches the component lookup.
        if (v && !/^[A-Za-z0-9]{1,60}$/.test(v)) errors.push('ad_icon must be a lucide icon name.')
        else data.ad_icon = v || null
    }

    // ── Image ──
    if (has('ad_image_url')) {
        const v = body.ad_image_url ? String(body.ad_image_url).trim() : null
        if (v && !/^https:\/\//i.test(v)) {
            // http:// images are blocked by App Transport Security on iOS and would
            // simply render blank, so reject them here rather than in the field.
            errors.push('ad_image_url must be an https URL.')
        } else if (v && v.length > 500) {
            errors.push('ad_image_url must be 500 characters or fewer.')
        } else {
            data.ad_image_url = v || null
        }
    }

    // ── Accent colour ──
    if (has('ad_accent_color')) {
        const v = body.ad_accent_color ? String(body.ad_accent_color).trim() : null
        if (v && !HEX_RE.test(v)) errors.push('ad_accent_color must be a hex colour such as #17739B.')
        else data.ad_accent_color = v || null
    }

    // ── Action ──
    if (has('ad_action_type') || has('ad_action_value')) {
        const type = body.ad_action_type ? String(body.ad_action_type).trim() : 'None'
        if (!ACTION_TYPES.includes(type)) {
            errors.push(`ad_action_type must be one of ${ACTION_TYPES.join(', ')}.`)
        } else {
            data.ad_action_type = type
            const value = body.ad_action_value ? String(body.ad_action_value).trim() : null

            if (type === 'None') {
                data.ad_action_value = null
            } else if (!value) {
                errors.push(`ad_action_value is required when ad_action_type is ${type}.`)
            } else if (type === 'Url' && !/^https:\/\//i.test(value)) {
                errors.push('ad_action_value must be an https URL when ad_action_type is Url.')
            } else if (type === 'Screen' && !/^[A-Za-z][A-Za-z0-9]{0,60}$/.test(value)) {
                errors.push('ad_action_value must be a screen name when ad_action_type is Screen.')
            } else {
                data.ad_action_value = value
            }
        }
    }

    // ── Ordering ──
    if (has('sort_order')) {
        const n = parseInt(body.sort_order, 10)
        if (!Number.isFinite(n) || n < 0) errors.push('sort_order must be a non-negative number.')
        else data.sort_order = n
    }

    // ── Scheduling ──
    for (const field of ['start_date', 'end_date']) {
        if (!has(field)) continue
        const v = body[field] ? String(body[field]).trim() : null
        if (v && !DATE_RE.test(v)) errors.push(`${field} must be YYYY-MM-DD.`)
        else data[field] = v || null
    }

    if (data.start_date && data.end_date && data.start_date > data.end_date) {
        errors.push('start_date must not be after end_date.')
    }

    // ── Status ──
    if (has('status')) {
        const v = String(body.status).trim()
        if (!STATUSES.includes(v)) errors.push(`status must be one of ${STATUSES.join(', ')}.`)
        else data.status = v
    }

    return { data, errors }
}

// ── List ────────────────────────────────────────────────────────────────────

router.get('/', superauth(), async (req, res) => {
    let response = { ...DEFAULT_API_RESPONSE }
    try {
        const rows = await Advertisement.listForAdmin()
        response = { ...SUCCESS_API_RESPONSE }
        response.message = 'Advertisements retrieved.'
        response.data = rows
        return res.status(response.status_code).json(response)
    } catch (e) {
        console.error('[Admin/Advertisement] list error:', e)
        response = { ...INTERNAL_SERVER_ERROR_API_RESPONSE }
        return res.status(response.status_code).json(response)
    }
})

// ── Create ──────────────────────────────────────────────────────────────────

router.post('/', superauth(), async (req, res) => {
    let response = { ...DEFAULT_API_RESPONSE }
    try {
        const { data, errors } = buildPayload(req.body || {})
        if (errors.length) {
            response = { ...BAD_REQUEST_API_RESPONSE, message: errors.join(' ') }
            return res.status(response.status_code).json(response)
        }

        data.created_by = req.payload?.admin_id ?? null
        if (data.sort_order === undefined) {
            // New adverts land at the end rather than silently jumping to position 0
            // and displacing whatever the admin had at the top.
            const existing = await Advertisement.listForAdmin()
            data.sort_order = existing.length
        }

        const created = await Advertisement.create(data)

        response = { ...SUCCESS_API_RESPONSE }
        response.message = 'Advertisement created.'
        response.data = created
        return res.status(response.status_code).json(response)
    } catch (e) {
        console.error('[Admin/Advertisement] create error:', e)
        response = { ...INTERNAL_SERVER_ERROR_API_RESPONSE }
        return res.status(response.status_code).json(response)
    }
})

// ── Reorder ─────────────────────────────────────────────────────────────────
// Declared before /:ad_id so "reorder" is not captured as an id.

router.put('/reorder', superauth(), async (req, res) => {
    let response = { ...DEFAULT_API_RESPONSE }
    try {
        const ids = req.body?.ordered_ids
        if (!Array.isArray(ids) || ids.some((id) => !Number.isFinite(Number(id)))) {
            response = { ...BAD_REQUEST_API_RESPONSE, message: 'Body must contain ordered_ids: number[].' }
            return res.status(response.status_code).json(response)
        }

        await Advertisement.reorder(ids.map(Number))

        response = { ...SUCCESS_API_RESPONSE }
        response.message = 'Order updated.'
        response.data = await Advertisement.listForAdmin()
        return res.status(response.status_code).json(response)
    } catch (e) {
        console.error('[Admin/Advertisement] reorder error:', e)
        response = { ...INTERNAL_SERVER_ERROR_API_RESPONSE }
        return res.status(response.status_code).json(response)
    }
})

// ── Read one ────────────────────────────────────────────────────────────────

router.get('/:ad_id', superauth(), async (req, res) => {
    let response = { ...DEFAULT_API_RESPONSE }
    try {
        const row = await Advertisement.getById(req.params.ad_id)
        if (!row) {
            response = { ...NOT_FOUND_API_RESPONSE, message: 'Advertisement not found.' }
            return res.status(response.status_code).json(response)
        }
        response = { ...SUCCESS_API_RESPONSE }
        response.message = 'Advertisement retrieved.'
        response.data = row
        return res.status(response.status_code).json(response)
    } catch (e) {
        console.error('[Admin/Advertisement] get error:', e)
        response = { ...INTERNAL_SERVER_ERROR_API_RESPONSE }
        return res.status(response.status_code).json(response)
    }
})

// ── Update ──────────────────────────────────────────────────────────────────

router.put('/:ad_id', superauth(), async (req, res) => {
    let response = { ...DEFAULT_API_RESPONSE }
    try {
        const existing = await Advertisement.getById(req.params.ad_id)
        if (!existing) {
            response = { ...NOT_FOUND_API_RESPONSE, message: 'Advertisement not found.' }
            return res.status(response.status_code).json(response)
        }

        const { data, errors } = buildPayload(req.body || {}, { partial: true })
        if (errors.length) {
            response = { ...BAD_REQUEST_API_RESPONSE, message: errors.join(' ') }
            return res.status(response.status_code).json(response)
        }
        if (!Object.keys(data).length) {
            response = { ...BAD_REQUEST_API_RESPONSE, message: 'No fields to update.' }
            return res.status(response.status_code).json(response)
        }

        // Cross-field rule has to consider the stored values too, since a partial update
        // can move one end of the window past the other without sending both.
        const start = data.start_date !== undefined ? data.start_date : existing.start_date
        const end = data.end_date !== undefined ? data.end_date : existing.end_date
        if (start && end && String(start).slice(0, 10) > String(end).slice(0, 10)) {
            response = { ...BAD_REQUEST_API_RESPONSE, message: 'start_date must not be after end_date.' }
            return res.status(response.status_code).json(response)
        }

        await Advertisement.update(req.params.ad_id, data)

        response = { ...SUCCESS_API_RESPONSE }
        response.message = 'Advertisement updated.'
        response.data = await Advertisement.getById(req.params.ad_id)
        return res.status(response.status_code).json(response)
    } catch (e) {
        console.error('[Admin/Advertisement] update error:', e)
        response = { ...INTERNAL_SERVER_ERROR_API_RESPONSE }
        return res.status(response.status_code).json(response)
    }
})

// ── Delete (soft) ───────────────────────────────────────────────────────────

router.delete('/:ad_id', superauth(), async (req, res) => {
    let response = { ...DEFAULT_API_RESPONSE }
    try {
        const existing = await Advertisement.getById(req.params.ad_id)
        if (!existing) {
            response = { ...NOT_FOUND_API_RESPONSE, message: 'Advertisement not found.' }
            return res.status(response.status_code).json(response)
        }

        await Advertisement.softDelete(req.params.ad_id)

        response = { ...SUCCESS_API_RESPONSE }
        response.message = 'Advertisement removed.'
        response.data = null
        return res.status(response.status_code).json(response)
    } catch (e) {
        console.error('[Admin/Advertisement] delete error:', e)
        response = { ...INTERNAL_SERVER_ERROR_API_RESPONSE }
        return res.status(response.status_code).json(response)
    }
})

module.exports = router
