/**
 * System Configuration — superadmin API.
 *
 * Lets an admin read and rotate service credentials without a deploy. Secrets are stored
 * encrypted (utils/secretbox.js) and never leave the server in plaintext: the list
 * endpoints return a masked hint only.
 *
 * Saving publishes a Redis invalidation so every PM2 worker picks the change up
 * immediately, which is what makes rotation take effect with no restart.
 */

const express = require('express')
const axios = require('axios')
const NotificationService = require('../../../services/NotificationService')
const router = express.Router()

const {
    DEFAULT_API_RESPONSE,
    INTERNAL_SERVER_ERROR_API_RESPONSE,
    SUCCESS_API_RESPONSE,
    BAD_REQUEST_API_RESPONSE,
    NOT_FOUND_API_RESPONSE
} = require('../../../configs/helper')

const { superauth } = require('../../../configs/auth')
const db = require('../../../utils/sqlbuilder')
const secretbox = require('../../../utils/secretbox')
const ConfigService = require('../../../services/ConfigService')

const GROUPS = ['app', 'chip', 'gmail', 'openai']

/**
 * Keys whose value must be one of a fixed set.
 *
 * APP_MODE drives whether the beta banner shows and whether switching sends a go-live
 * broadcast, but the row is a free-text string — so "Beta Testing" saved cleanly and the
 * app quietly treated it as Live, hiding the banner with nothing to indicate why.
 * Anything that behaves as a switch has to be validated like one.
 */
const ENUM_KEYS = {
    APP_MODE: ['Beta', 'Live']
}

/** Shapes a row for the client. Secret values are replaced by a masked hint. */
function presentRow(row) {
    let is_set = row.config_value !== null && row.config_value !== ''
    let value = null
    let masked = null

    if (is_set) {
        if (row.is_secret) {
            try {
                masked = secretbox.mask(secretbox.decrypt(row.config_value))
            } catch (e) {
                // Usually a rotated or missing CONFIG_ENCRYPTION_KEY. Say so plainly
                // rather than showing a value we cannot actually read.
                masked = '(cannot decrypt)'
                is_set = false
            }
        } else {
            value = row.config_value
        }
    }

    return {
        config_id: row.config_id,
        config_group: row.config_group,
        config_key: row.config_key,
        label: row.label,
        description: row.description,
        value_type: row.value_type,
        is_secret: !!row.is_secret,
        is_required: !!row.is_required,
        is_set,
        // Non-secret values are returned as-is; secrets only ever as a hint.
        value,
        masked,
        /**
         * The permitted values, when the key is an enum.
         *
         * Sent so the portal can offer a choice instead of a text box. The server has
         * always rejected anything outside this list, but the admin had no way to know
         * what the list was — which is how "Beta Testing" came to be typed into APP_MODE,
         * failing validation-by-eye and reading as Live to the app.
         */
        options: ENUM_KEYS[row.config_key] || null,
        last_modified: row.last_modified
    }
}

async function loadGroupRows(group) {
    return db.raw(
        `SELECT config_id, config_group, config_key, config_value, is_secret, value_type,
                label, description, is_required, sort_order, last_modified
           FROM system_config
          WHERE config_group = ? AND status = 'Active'
          ORDER BY sort_order, config_key`,
        [group]
    )
}

/* ─── GET /superadmin/config/status ───────────────────────────────────────── */
router.get('/status', superauth(), async (req, res) => {
    let response = { ...DEFAULT_API_RESPONSE }
    try {
        response = {
            ...SUCCESS_API_RESPONSE,
            message: 'Configuration runtime status.',
            data: {
                ...ConfigService.status(),
                // Without a key nothing can be read or written — surface it prominently.
                encryption_ready: secretbox.isConfigured()
            }
        }
    } catch (e) {
        console.error('[SystemConfig] status:', e)
        response = { ...INTERNAL_SERVER_ERROR_API_RESPONSE }
    }
    return res.status(response.status_code).json(response)
})

/* ─── GET /superadmin/config ──────────────────────────────────────────────── */
router.get('/', superauth(), async (req, res) => {
    let response = { ...DEFAULT_API_RESPONSE }
    try {
        const rows = await db.raw(
            `SELECT config_id, config_group, config_key, config_value, is_secret, value_type,
                    label, description, is_required, sort_order, last_modified
               FROM system_config
              WHERE status = 'Active'
              ORDER BY config_group, sort_order, config_key`
        )

        const groups = {}
        for (const row of rows) {
            groups[row.config_group] = groups[row.config_group] || []
            groups[row.config_group].push(presentRow(row))
        }

        response = {
            ...SUCCESS_API_RESPONSE,
            message: 'Configuration retrieved.',
            data: {
                groups: Object.entries(groups).map(([name, items]) => ({
                    group: name,
                    items,
                    complete: items.filter(i => i.is_required).every(i => i.is_set)
                }))
            }
        }
    } catch (e) {
        console.error('[SystemConfig] list:', e)
        response = { ...INTERNAL_SERVER_ERROR_API_RESPONSE }
    }
    return res.status(response.status_code).json(response)
})

/* ─── GET /superadmin/config/:group ───────────────────────────────────────── */
router.get('/:group', superauth(), async (req, res) => {
    let response = { ...DEFAULT_API_RESPONSE }
    try {
        const rows = await loadGroupRows(req.params.group)
        if (!rows.length) {
            response = { ...NOT_FOUND_API_RESPONSE, message: `No configuration group '${req.params.group}'.` }
            return res.status(response.status_code).json(response)
        }

        response = {
            ...SUCCESS_API_RESPONSE,
            message: 'Configuration group retrieved.',
            data: { group: req.params.group, items: rows.map(presentRow) }
        }
    } catch (e) {
        console.error('[SystemConfig] get group:', e)
        response = { ...INTERNAL_SERVER_ERROR_API_RESPONSE }
    }
    return res.status(response.status_code).json(response)
})

/* ─── GET /superadmin/config/:group/audit ─────────────────────────────────── */
router.get('/:group/audit', superauth(), async (req, res) => {
    let response = { ...DEFAULT_API_RESPONSE }
    try {
        const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 25, 1), 100)
        const rows = await db.raw(
            `SELECT audit_id, config_key, action, old_value_masked, new_value_masked,
                    changed_by_name, ip_address, notes, created_at
               FROM system_config_audit
              WHERE config_group = ?
              ORDER BY created_at DESC
              LIMIT ${limit}`,
            [req.params.group]
        )

        response = { ...SUCCESS_API_RESPONSE, message: 'Audit trail retrieved.', data: { entries: rows } }
    } catch (e) {
        console.error('[SystemConfig] audit:', e)
        response = { ...INTERNAL_SERVER_ERROR_API_RESPONSE }
    }
    return res.status(response.status_code).json(response)
})

/* ─── PUT /superadmin/config/:group ───────────────────────────────────────── */
router.put('/:group', superauth(), async (req, res) => {
    let response = { ...DEFAULT_API_RESPONSE }

    try {
        const group = req.params.group
        const incoming = req.body?.values

        if (!incoming || typeof incoming !== 'object') {
            response = { ...BAD_REQUEST_API_RESPONSE, message: 'Body must contain a `values` object.' }
            return res.status(response.status_code).json(response)
        }

        const rows = await loadGroupRows(group)
        if (!rows.length) {
            response = { ...NOT_FOUND_API_RESPONSE, message: `No configuration group '${group}'.` }
            return res.status(response.status_code).json(response)
        }

        // The encryption key is only needed when this update actually touches a secret.
        // Gating every group on it meant a missing key blocked non-sensitive settings
        // like APP_MODE, which are stored as plain text and need no key at all.
        const touchesSecret = rows.some(
            (r) => r.is_secret && Object.prototype.hasOwnProperty.call(incoming, r.config_key)
        )
        if (touchesSecret && !secretbox.isConfigured()) {
            response = {
                ...INTERNAL_SERVER_ERROR_API_RESPONSE,
                message: 'CONFIG_ENCRYPTION_KEY is not set on the server, so credentials cannot be stored.'
            }
            return res.status(response.status_code).json(response)
        }

        const admin = req.payload || {}
        const ip = req.ip
        const changed = []

        // Read before the loop rewrites it: the Beta -> Live announcement below needs
        // to know which direction the switch went, and by then the row holds the new
        // value. APP_MODE is not a secret, so config_value is already plaintext.
        const previousModeBeforeUpdate =
            group === 'app'
                ? (rows.find((r) => r.config_key === 'APP_MODE')?.config_value ?? null)
                : null

        for (const row of rows) {
            if (!Object.prototype.hasOwnProperty.call(incoming, row.config_key)) continue

            const raw = incoming[row.config_key]

            // The form renders secrets as a mask. An unchanged field comes back as that
            // mask or as an empty string — writing either would destroy the credential,
            // so both mean "leave it alone".
            if (raw === null || raw === undefined || raw === '' || String(raw).startsWith('••••')) continue

            const next = String(raw).trim()

            const allowed = ENUM_KEYS[row.config_key]
            if (allowed && !allowed.includes(next)) {
                response = {
                    ...BAD_REQUEST_API_RESPONSE,
                    message: `${row.config_key} must be one of: ${allowed.join(', ')}.`
                }
                return res.status(response.status_code).json(response)
            }

            let previousPlain = null
            if (row.config_value) {
                try {
                    previousPlain = row.is_secret ? secretbox.decrypt(row.config_value) : row.config_value
                } catch (e) {
                    previousPlain = null
                }
            }

            if (previousPlain === next) continue // genuinely unchanged

            const stored = row.is_secret ? secretbox.encrypt(next) : next

            await db.raw(
                `UPDATE system_config SET config_value = ?, updated_by = ?, last_modified = NOW() WHERE config_id = ?`,
                [stored, admin.admin_id || null, row.config_id]
            )

            await db.raw(
                `INSERT INTO system_config_audit
                    (config_group, config_key, action, old_value_masked, new_value_masked,
                     changed_by, changed_by_name, ip_address)
                 VALUES (?, ?, 'Update', ?, ?, ?, ?, ?)`,
                [
                    group,
                    row.config_key,
                    // Masked on both sides: an audit table holding plaintext credentials
                    // would defeat encrypting the live ones.
                    row.is_secret ? secretbox.mask(previousPlain) : (previousPlain ? String(previousPlain).slice(0, 120) : null),
                    row.is_secret ? secretbox.mask(next) : next.slice(0, 120),
                    admin.admin_id || null,
                    admin.username || admin.email || null,
                    ip
                ]
            )

            changed.push(row.config_key)
        }

        // Reaches every PM2 worker, so the new credentials are live without a restart.
        const invalidation = await ConfigService.invalidate(group)

        // ── Beta → Live announcement ─────────────────────────────────────────
        //
        // Leaving beta is the one config change users need to hear about, so it is the
        // one that carries a side effect. Guarded tightly: only when APP_MODE actually
        // changed, and only in the Beta → Live direction. Switching back to Beta, or
        // saving Live over Live, must never re-blast 1,400+ people.
        //
        // Deliberately not awaited. broadcastNotification writes an in-app row per
        // account, which for the current user base takes far longer than an admin
        // request should hang for; the FCM sends are queued to Bull either way.
        let announcement = null
        if (group === 'app' && changed.includes('APP_MODE')) {
            const previousMode = String(previousModeBeforeUpdate || '').toLowerCase()
            const nextMode = String(incoming.APP_MODE || '').toLowerCase()

            if (previousMode === 'beta' && nextMode === 'live') {
                const body = await ConfigService.get(
                    'app',
                    'LIVE_ANNOUNCEMENT_TEXT',
                    'Our beta has ended — TaxLah is now live.'
                )

                NotificationService.broadcastNotification('TaxLah is now live', body, {
                    type: 'AppWentLive',
                })
                    .then((r) => console.log(`[SystemConfig] go-live broadcast queued for ${r.total_accounts} accounts.`))
                    .catch((e) => console.error('[SystemConfig] go-live broadcast failed:', e.message))

                announcement = 'Go-live announcement is being sent to all active users.'
            }
        }

        response = {
            ...SUCCESS_API_RESPONSE,
            message: changed.length
                ? `Updated ${changed.length} setting(s). Now live across all workers.`
                : 'No changes to apply.',
            data: {
                changed,
                announcement,
                propagated: invalidation.published,
                // If Redis is down the write still succeeded, it just reaches other
                // workers on their next cache expiry instead of instantly. Say so.
                propagation_note: invalidation.published
                    ? null
                    : `Redis unavailable (${invalidation.reason}); other workers will refresh within the cache TTL.`
            }
        }
    } catch (e) {
        console.error('[SystemConfig] update:', e)
        response = { ...INTERNAL_SERVER_ERROR_API_RESPONSE }
    }

    return res.status(response.status_code).json(response)
})

/* ─── POST /superadmin/config/:group/test ─────────────────────────────────── */
/**
 * Tests credentials WITHOUT saving them.
 *
 * Values supplied in the body take priority; anything omitted (or left masked) falls back
 * to what is currently stored. That is what lets an admin verify a new key before it
 * goes anywhere near live traffic.
 */
router.post('/:group/test', superauth(), async (req, res) => {
    let response = { ...DEFAULT_API_RESPONSE }

    try {
        const group = req.params.group
        if (!GROUPS.includes(group)) {
            response = { ...NOT_FOUND_API_RESPONSE, message: `No configuration group '${group}'.` }
            return res.status(response.status_code).json(response)
        }

        const stored = await ConfigService.getGroup(group, { fresh: true })
        const supplied = req.body?.values || {}

        // Merge: a supplied value wins unless it is blank or still the mask.
        const cfg = { ...stored }
        for (const [k, v] of Object.entries(supplied)) {
            if (v === null || v === undefined || v === '' || String(v).startsWith('••••')) continue
            cfg[k] = String(v)
        }

        const started = Date.now()
        let result

        // Dispatched by name rather than falling through to OpenAI. `app` was added to
        // GROUPS later and landed in the else branch, so testing it ran an OpenAI call
        // against config that holds no OpenAI key — reporting a credential failure for
        // a group that has no credentials.
        if (group === 'chip') result = await testChip(cfg)
        else if (group === 'gmail') result = await testGmail(cfg, req.body?.test_recipient)
        else if (group === 'openai') result = await testOpenAI(cfg)
        else {
            result = {
                ok: true,
                message: 'These settings are read by the app directly — there is no service to test.'
            }
        }

        // Record that a test happened, but never what was tested with.
        await db.raw(
            `INSERT INTO system_config_audit (config_group, config_key, action, changed_by, changed_by_name, ip_address, notes)
             VALUES (?, '*', 'Test', ?, ?, ?, ?)`,
            [group, req.payload?.admin_id || null, req.payload?.username || null, req.ip, result.ok ? 'Test passed' : `Test failed: ${result.message}`.slice(0, 500)]
        ).catch(() => {})

        response = {
            ...SUCCESS_API_RESPONSE,
            message: result.ok ? 'Connection test passed.' : 'Connection test failed.',
            data: { ...result, duration_ms: Date.now() - started }
        }
    } catch (e) {
        console.error('[SystemConfig] test:', e)
        response = { ...INTERNAL_SERVER_ERROR_API_RESPONSE }
    }

    return res.status(response.status_code).json(response)
})

/** Real call against the CHIP API using the supplied credentials. */
async function testChip(cfg) {
    if (!cfg.CHIP_API_KEY) return { ok: false, message: 'No API key provided or stored.' }
    if (!cfg.CHIP_BRAND_ID) return { ok: false, message: 'No brand ID provided or stored.' }

    try {
        const client = axios.create({
            baseURL: cfg.CHIP_API_URL || 'https://gate.chip-in.asia/api/v1',
            headers: { Authorization: `Bearer ${cfg.CHIP_API_KEY}`, 'Content-Type': 'application/json' },
            timeout: 15000
        })

        const r = await client.get('/payment_methods/', {
            params: { brand_id: cfg.CHIP_BRAND_ID, currency: 'MYR' }
        })

        const methods = r.data?.available_payment_methods || []
        return {
            ok: true,
            message: `Authenticated against CHIP. ${methods.length} payment method(s) available.`,
            details: { payment_methods: methods.slice(0, 12) }
        }
    } catch (e) {
        const status = e.response?.status
        return {
            ok: false,
            message:
                status === 401 || status === 403
                    ? 'CHIP rejected the API key (unauthorised).'
                    : e.response?.data?.message || e.message,
            details: { http_status: status || null }
        }
    }
}

/** Verifies the Gmail OAuth credentials, and optionally sends a real test email. */
async function testGmail(cfg, recipient) {
    if (!cfg.GMAIL_CLIENT_ID || !cfg.GMAIL_CLIENT_SECRET || !cfg.GMAIL_REFRESH_TOKEN) {
        return { ok: false, message: 'Client ID, client secret and refresh token are all required.' }
    }

    try {
        const { google } = require('googleapis')
        const oauth2Client = new google.auth.OAuth2(cfg.GMAIL_CLIENT_ID, cfg.GMAIL_CLIENT_SECRET)
        oauth2Client.setCredentials({ refresh_token: cfg.GMAIL_REFRESH_TOKEN })

        const gmail = google.gmail({ version: 'v1', auth: oauth2Client })
        const profile = await gmail.users.getProfile({ userId: 'me' })

        if (!recipient) {
            return {
                ok: true,
                message: `Authenticated as ${profile.data.emailAddress}.`,
                details: { authenticated_as: profile.data.emailAddress }
            }
        }

        const from = `"TaxLah" <${cfg.GMAIL_USER || profile.data.emailAddress}>`
        const raw = Buffer.from(
            [
                `From: ${from}`,
                `To: ${recipient}`,
                'Subject: TaxLah configuration test',
                'MIME-Version: 1.0',
                'Content-Type: text/plain; charset="UTF-8"',
                '',
                'This is a test message from the TaxLah admin portal. If you received it, the Gmail credentials are working.'
            ].join('\r\n')
        ).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

        const sent = await gmail.users.messages.send({ userId: 'me', requestBody: { raw } })

        return {
            ok: true,
            message: `Authenticated as ${profile.data.emailAddress} and sent a test email to ${recipient}.`,
            details: { authenticated_as: profile.data.emailAddress, message_id: sent.data.id }
        }
    } catch (e) {
        return { ok: false, message: e.errors?.[0]?.message || e.message }
    }
}

/** Cheapest possible authenticated call — lists models rather than spending tokens. */
async function testOpenAI(cfg) {
    if (!cfg.OPENAI_API_KEY) return { ok: false, message: 'No API key provided or stored.' }

    try {
        const r = await axios.get('https://api.openai.com/v1/models', {
            headers: { Authorization: `Bearer ${cfg.OPENAI_API_KEY}` },
            timeout: 15000
        })

        const models = (r.data?.data || []).map(m => m.id)
        const needed = ['gpt-5-mini']
        const missing = needed.filter(m => !models.includes(m))

        return {
            ok: missing.length === 0,
            message: missing.length
                ? `Key is valid, but these models are not available to it: ${missing.join(', ')}`
                : `Key is valid. ${models.length} model(s) available, including the ones receipt processing uses.`,
            details: { model_count: models.length, missing_models: missing }
        }
    } catch (e) {
        const status = e.response?.status
        return {
            ok: false,
            message: status === 401 ? 'OpenAI rejected the API key.' : e.response?.data?.error?.message || e.message,
            details: { http_status: status || null }
        }
    }
}

module.exports = router
