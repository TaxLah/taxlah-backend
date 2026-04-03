/**
 * AdminController/Blaster/index.js
 *
 * Message Blaster API — allows super-admins to send targeted
 * push notifications and emails to groups or individual users.
 *
 * Endpoints:
 *   GET  /superadmin/blaster/templates          — list quick templates
 *   POST /superadmin/blaster/templates          — create new template
 *   PUT  /superadmin/blaster/templates/:id      — edit a template
 *   GET  /superadmin/blaster/groups             — recipient groups with counts
 *   GET  /superadmin/blaster/users              — paginated individual user list
 *   POST /superadmin/blaster/send               — compose & send blast now
 *   POST /superadmin/blaster/draft              — save blast as draft
 *   POST /superadmin/blaster/draft/:id/send     — send a saved draft
 *   GET  /superadmin/blaster/history            — recent blasts list
 *   GET  /superadmin/blaster/history/:id        — blast detail
 */

const express = require('express')
const router  = express.Router()

const {
    DEFAULT_API_RESPONSE, INTERNAL_SERVER_ERROR_API_RESPONSE,
    SUCCESS_API_RESPONSE, BAD_REQUEST_API_RESPONSE,
    NOT_FOUND_API_RESPONSE, CHECK_EMPTY, sanitize
} = require('../../../configs/helper')

const { superauth }          = require('../../../configs/auth')
const NotificationService    = require('../../../services/NotificationService')
const MailService             = require('../../../services/MailService')
const {
    GetBlastTemplates,
    GetBlastTemplateById,
    CreateBlastTemplate,
    UpdateBlastTemplate,
    GetRecipientGroups,
    GetRecipientsByGroup,
    GetRecipientsByIds,
    GetIndividualUsers,
    CreateBlast,
    UpdateBlastAfterSend,
    GetBlastHistory,
    GetBlastDetail
} = require('../../../models/AdminModel/Blaster')

// ──────────────────────────────────────────────────────────────────────────────
// HELPERS
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Replace {{variable}} placeholders in a string using a key-value map.
 * Unresolved variables are left unchanged.
 */
function resolveVariables(text, vars = {}) {
    if (!text || !vars || !Object.keys(vars).length) return text
    return text.replace(/\{\{(\w+)\}\}/g, (match, key) =>
        vars[key] !== undefined ? vars[key] : match
    )
}

/**
 * Resolve a blast's recipients from either a group key or an array of IDs.
 * Returns an array of { account_id, account_fullname, auth_usermail }
 */
async function resolveRecipients(recipient_type, recipient_group, recipient_ids) {
    if (recipient_type === 'Individual') {
        if (!recipient_ids || !recipient_ids.length) return { status: false, message: 'recipient_ids required for Individual type' }
        return await GetRecipientsByIds(recipient_ids)
    }
    // Group
    if (!recipient_group) return { status: false, message: 'recipient_group required for Group type' }
    return await GetRecipientsByGroup(recipient_group)
}

/**
 * Deliver a single blast to all resolved recipients.
 * Returns { sent_count, failed_count }
 */
async function deliverBlast({ channel, title, body, recipients, global_vars }) {
    let sent_count    = 0
    let failed_count  = 0

    for (const recipient of recipients) {
        // Per-recipient variable substitution
        const perVars = {
            ...global_vars,
            name:  recipient.account_fullname || '',
            email: recipient.auth_usermail    || ''
        }
        const resolvedTitle = resolveVariables(title, perVars)
        const resolvedBody  = resolveVariables(body,  perVars)

        try {
            if (channel === 'Push') {
                await NotificationService.sendUserNotification(
                    recipient.account_id,
                    resolvedTitle,
                    resolvedBody,
                    { blast: 'true' }
                )
                sent_count++
            } else if (channel === 'Email') {
                await MailService.sendMail({
                    to:      recipient.auth_usermail,
                    subject: resolvedTitle,
                    text:    resolvedBody,
                    html:    `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
                                <div style="background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);color:white;padding:25px 20px;text-align:center;border-radius:10px 10px 0 0;">
                                  <h2 style="margin:0">${resolvedTitle}</h2>
                                </div>
                                <div style="background:#f9f9f9;padding:30px;border-radius:0 0 10px 10px;">
                                  <p style="font-size:15px;line-height:1.7;white-space:pre-wrap">${resolvedBody}</p>
                                  <hr style="border:none;border-top:1px solid #eee;margin:25px 0">
                                  <p style="font-size:13px;color:#888;text-align:center">
                                    Sent via TaxLah Admin&nbsp;&bull;&nbsp;
                                    <a href="mailto:support@taxlah.com" style="color:#667eea">support@taxlah.com</a>
                                  </p>
                                </div>
                              </div>`
                })
                sent_count++
            }
        } catch (err) {
            console.error(`[Blaster] Delivery failed for account ${recipient.account_id}:`, err.message)
            failed_count++
        }
    }

    return { sent_count, failed_count }
}

// ──────────────────────────────────────────────────────────────────────────────
// TEMPLATES
// ──────────────────────────────────────────────────────────────────────────────

/* GET /superadmin/blaster/templates */
router.get('/templates', superauth(), async (req, res) => {
    let response = DEFAULT_API_RESPONSE
    try {
        const { channel } = req.query
        const result = await GetBlastTemplates(channel || null)
        response = { ...SUCCESS_API_RESPONSE, data: result.data }
    } catch (e) {
        console.error('[Blaster] GetTemplates:', e)
        response = INTERNAL_SERVER_ERROR_API_RESPONSE
    }
    return res.status(response.status_code).json(response)
})

/* POST /superadmin/blaster/templates */
router.post('/templates', superauth(), async (req, res) => {
    let response = DEFAULT_API_RESPONSE
    try {
        const { template_name, template_tag, template_channel, template_title, template_body } = req.body

        if (CHECK_EMPTY([template_name, template_channel, template_body])) {
            return res.status(400).json({ ...BAD_REQUEST_API_RESPONSE, message: 'template_name, template_channel, and template_body are required' })
        }

        const validChannels = ['Push', 'Email', 'Both']
        if (!validChannels.includes(template_channel)) {
            return res.status(400).json({ ...BAD_REQUEST_API_RESPONSE, message: 'template_channel must be Push, Email, or Both' })
        }

        const result = await CreateBlastTemplate({
            template_name:    sanitize(template_name),
            template_tag:     template_tag     ? sanitize(template_tag)    : null,
            template_channel,
            template_title:   template_title   ? sanitize(template_title)  : null,
            template_body:    sanitize(template_body)
        })
        response = { ...SUCCESS_API_RESPONSE, data: result.data }
    } catch (e) {
        console.error('[Blaster] CreateTemplate:', e)
        response = INTERNAL_SERVER_ERROR_API_RESPONSE
    }
    return res.status(response.status_code).json(response)
})

/* PUT /superadmin/blaster/templates/:id */
router.put('/templates/:id', superauth(), async (req, res) => {
    let response = DEFAULT_API_RESPONSE
    try {
        const blast_template_id = parseInt(req.params.id)
        if (!blast_template_id) {
            return res.status(400).json({ ...BAD_REQUEST_API_RESPONSE, message: 'Invalid template ID' })
        }

        const existing = await GetBlastTemplateById(blast_template_id)
        if (!existing.status) {
            return res.status(404).json({ ...NOT_FOUND_API_RESPONSE, message: 'Template not found' })
        }

        const updates = {}
        const { template_name, template_tag, template_channel, template_title, template_body, status } = req.body

        if (template_name    !== undefined) updates.template_name    = sanitize(template_name)
        if (template_tag     !== undefined) updates.template_tag     = sanitize(template_tag)
        if (template_channel !== undefined) updates.template_channel = template_channel
        if (template_title   !== undefined) updates.template_title   = sanitize(template_title)
        if (template_body    !== undefined) updates.template_body    = sanitize(template_body)
        if (status           !== undefined) updates.status           = status

        await UpdateBlastTemplate(blast_template_id, updates)
        response = SUCCESS_API_RESPONSE
    } catch (e) {
        console.error('[Blaster] UpdateTemplate:', e)
        response = INTERNAL_SERVER_ERROR_API_RESPONSE
    }
    return res.status(response.status_code).json(response)
})

// ──────────────────────────────────────────────────────────────────────────────
// RECIPIENTS
// ──────────────────────────────────────────────────────────────────────────────

/* GET /superadmin/blaster/groups */
router.get('/groups', superauth(), async (req, res) => {
    let response = DEFAULT_API_RESPONSE
    try {
        const result = await GetRecipientGroups()
        response = { ...SUCCESS_API_RESPONSE, data: result.data }
    } catch (e) {
        console.error('[Blaster] GetGroups:', e)
        response = INTERNAL_SERVER_ERROR_API_RESPONSE
    }
    return res.status(response.status_code).json(response)
})

/* GET /superadmin/blaster/users  ?page=1&limit=20&search= */
router.get('/users', superauth(), async (req, res) => {
    let response = DEFAULT_API_RESPONSE
    try {
        const { page = 1, limit = 20, search = '' } = req.query
        const result = await GetIndividualUsers({
            page:   parseInt(page)  || 1,
            limit:  parseInt(limit) || 20,
            search: sanitize(search)
        })
        response = { ...SUCCESS_API_RESPONSE, data: result.data }
    } catch (e) {
        console.error('[Blaster] GetUsers:', e)
        response = INTERNAL_SERVER_ERROR_API_RESPONSE
    }
    return res.status(response.status_code).json(response)
})

// ──────────────────────────────────────────────────────────────────────────────
// SEND / DRAFT
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Shared validation for blast compose body.
 * Returns validation error message or null.
 */
function validateBlastBody(body) {
    const { channel, title, message, recipient_type, recipient_group, recipient_ids } = body
    const validChannels       = ['Push', 'Email']
    const validRecipientTypes = ['Group', 'Individual']

    if (CHECK_EMPTY([channel, title, message, recipient_type])) {
        return 'channel, title, message, and recipient_type are required'
    }
    if (!validChannels.includes(channel)) {
        return 'channel must be Push or Email'
    }
    if (title.length > 65) {
        return 'title must not exceed 65 characters'
    }
    if (channel === 'Push' && message.length > 178) {
        return 'message must not exceed 178 characters for Push'
    }
    if (!validRecipientTypes.includes(recipient_type)) {
        return 'recipient_type must be Group or Individual'
    }
    if (recipient_type === 'Group' && CHECK_EMPTY([recipient_group])) {
        return 'recipient_group is required when recipient_type is Group'
    }
    if (recipient_type === 'Individual' && (!Array.isArray(recipient_ids) || !recipient_ids.length)) {
        return 'recipient_ids array is required when recipient_type is Individual'
    }
    return null
}

/* POST /superadmin/blaster/send */
router.post('/send', superauth(), async (req, res) => {
    let response = DEFAULT_API_RESPONSE
    try {
        const {
            channel, title, message,
            recipient_type, recipient_group, recipient_ids,
            template_id, variables
        } = req.body

        const validationError = validateBlastBody(req.body)
        if (validationError) {
            return res.status(400).json({ ...BAD_REQUEST_API_RESPONSE, message: validationError })
        }

        // 1. Resolve recipients
        const recipientResult = await resolveRecipients(recipient_type, recipient_group, recipient_ids)
        if (!recipientResult.status) {
            return res.status(400).json({ ...BAD_REQUEST_API_RESPONSE, message: recipientResult.message })
        }
        const recipients = recipientResult.data

        if (!recipients.length) {
            return res.status(400).json({ ...BAD_REQUEST_API_RESPONSE, message: 'No eligible recipients found in the selected group' })
        }

        // 2. Persist blast record (Pending)
        const admin_id   = req.admin?.admin_id || null
        const createResult = await CreateBlast({
            blast_channel:          channel,
            blast_title:            sanitize(title),
            blast_body:             sanitize(message),
            blast_recipient_type:   recipient_type,
            blast_recipient_group:  recipient_type === 'Group'      ? recipient_group : null,
            blast_recipient_ids:    recipient_type === 'Individual' ? recipient_ids   : null,
            blast_recipient_count:  recipients.length,
            blast_template_id:      template_id || null,
            blast_status:           'Pending',
            blast_sent_by:          admin_id
        })

        const { blast_id } = createResult.data

        // 3. Deliver
        const { sent_count, failed_count } = await deliverBlast({
            channel,
            title:       sanitize(title),
            body:        sanitize(message),
            recipients,
            global_vars: variables || {}
        })

        // 4. Update blast record
        const finalStatus = failed_count === recipients.length ? 'Failed' : 'Sent'
        await UpdateBlastAfterSend(blast_id, {
            blast_status:      finalStatus,
            blast_sent_at:     new Date(),
            blast_sent_count:  sent_count,
            blast_failed_count: failed_count
        })

        response = {
            ...SUCCESS_API_RESPONSE,
            message: `Blast sent to ${sent_count} of ${recipients.length} recipients`,
            data: {
                blast_id,
                blast_ref:        createResult.data.blast_ref,
                channel,
                recipient_count:  recipients.length,
                sent_count,
                failed_count,
                status:           finalStatus
            }
        }
    } catch (e) {
        console.error('[Blaster] Send:', e)
        response = INTERNAL_SERVER_ERROR_API_RESPONSE
    }
    return res.status(response.status_code).json(response)
})

/* POST /superadmin/blaster/draft */
router.post('/draft', superauth(), async (req, res) => {
    let response = DEFAULT_API_RESPONSE
    try {
        const {
            channel, title, message,
            recipient_type, recipient_group, recipient_ids,
            template_id, variables
        } = req.body

        const validationError = validateBlastBody(req.body)
        if (validationError) {
            return res.status(400).json({ ...BAD_REQUEST_API_RESPONSE, message: validationError })
        }

        const admin_id = req.admin?.admin_id || null

        // Estimate recipient count for the draft summary
        let recipient_count = 0
        try {
            const recipientResult = await resolveRecipients(recipient_type, recipient_group, recipient_ids)
            if (recipientResult.status) recipient_count = recipientResult.data.length
        } catch (_) { /* non-fatal */ }

        const createResult = await CreateBlast({
            blast_channel:          channel,
            blast_title:            sanitize(title),
            blast_body:             sanitize(message),
            blast_recipient_type:   recipient_type,
            blast_recipient_group:  recipient_type === 'Group'      ? recipient_group : null,
            blast_recipient_ids:    recipient_type === 'Individual' ? recipient_ids   : null,
            blast_recipient_count:  recipient_count,
            blast_template_id:      template_id || null,
            blast_status:           'Draft',
            blast_sent_by:          admin_id
        })

        response = { ...SUCCESS_API_RESPONSE, data: createResult.data }
    } catch (e) {
        console.error('[Blaster] Draft:', e)
        response = INTERNAL_SERVER_ERROR_API_RESPONSE
    }
    return res.status(response.status_code).json(response)
})

/* POST /superadmin/blaster/draft/:id/send  — send a previously saved draft */
router.post('/draft/:id/send', superauth(), async (req, res) => {
    let response = DEFAULT_API_RESPONSE
    try {
        const blast_id = parseInt(req.params.id)
        if (!blast_id) {
            return res.status(400).json({ ...BAD_REQUEST_API_RESPONSE, message: 'Invalid blast ID' })
        }

        const detailResult = await GetBlastDetail(blast_id)
        if (!detailResult.status) {
            return res.status(404).json({ ...NOT_FOUND_API_RESPONSE, message: 'Draft not found' })
        }

        const blast = detailResult.data
        if (blast.blast_status !== 'Draft') {
            return res.status(400).json({ ...BAD_REQUEST_API_RESPONSE, message: `Cannot send a blast with status: ${blast.blast_status}` })
        }

        // Re-resolve recipients at send time
        const recipientResult = await resolveRecipients(
            blast.blast_recipient_type,
            blast.blast_recipient_group,
            blast.blast_recipient_ids ? JSON.parse(blast.blast_recipient_ids) : []
        )
        if (!recipientResult.status) {
            return res.status(400).json({ ...BAD_REQUEST_API_RESPONSE, message: recipientResult.message })
        }
        const recipients = recipientResult.data

        if (!recipients.length) {
            return res.status(400).json({ ...BAD_REQUEST_API_RESPONSE, message: 'No eligible recipients found' })
        }

        // Update recipient count to current value
        await UpdateBlastAfterSend(blast_id, {
            blast_status:      'Pending',
            blast_sent_at:     null,
            blast_sent_count:  0,
            blast_failed_count: 0
        })

        const { sent_count, failed_count } = await deliverBlast({
            channel:    blast.blast_channel,
            title:      blast.blast_title,
            body:       blast.blast_body,
            recipients,
            global_vars: {}
        })

        const finalStatus = failed_count === recipients.length ? 'Failed' : 'Sent'
        await UpdateBlastAfterSend(blast_id, {
            blast_status:       finalStatus,
            blast_sent_at:      new Date(),
            blast_sent_count:   sent_count,
            blast_failed_count: failed_count
        })

        response = {
            ...SUCCESS_API_RESPONSE,
            message: `Blast sent to ${sent_count} of ${recipients.length} recipients`,
            data: {
                blast_id,
                blast_ref:       blast.blast_ref,
                channel:         blast.blast_channel,
                recipient_count: recipients.length,
                sent_count,
                failed_count,
                status:          finalStatus
            }
        }
    } catch (e) {
        console.error('[Blaster] DraftSend:', e)
        response = INTERNAL_SERVER_ERROR_API_RESPONSE
    }
    return res.status(response.status_code).json(response)
})

// ──────────────────────────────────────────────────────────────────────────────
// HISTORY
// ──────────────────────────────────────────────────────────────────────────────

/* GET /superadmin/blaster/history  ?page=1&limit=20&channel=Push&status=Sent */
router.get('/history', superauth(), async (req, res) => {
    let response = DEFAULT_API_RESPONSE
    try {
        const { page = 1, limit = 20, channel, status } = req.query
        const result = await GetBlastHistory({
            page:    parseInt(page)  || 1,
            limit:   parseInt(limit) || 20,
            channel: channel || null,
            status:  status  || null
        })
        response = { ...SUCCESS_API_RESPONSE, data: result.data }
    } catch (e) {
        console.error('[Blaster] History:', e)
        response = INTERNAL_SERVER_ERROR_API_RESPONSE
    }
    return res.status(response.status_code).json(response)
})

/* GET /superadmin/blaster/history/:id */
router.get('/history/:id', superauth(), async (req, res) => {
    let response = DEFAULT_API_RESPONSE
    try {
        const blast_id = parseInt(req.params.id)
        if (!blast_id) {
            return res.status(400).json({ ...BAD_REQUEST_API_RESPONSE, message: 'Invalid blast ID' })
        }
        const result = await GetBlastDetail(blast_id)
        if (!result.status) {
            return res.status(404).json({ ...NOT_FOUND_API_RESPONSE, message: 'Blast not found' })
        }
        response = { ...SUCCESS_API_RESPONSE, data: result.data }
    } catch (e) {
        console.error('[Blaster] GetDetail:', e)
        response = INTERNAL_SERVER_ERROR_API_RESPONSE
    }
    return res.status(response.status_code).json(response)
})

module.exports = router
