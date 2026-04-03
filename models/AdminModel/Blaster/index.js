/**
 * AdminModel/Blaster/index.js
 *
 * Data-access layer for the Message Blaster feature.
 * Covers: templates, recipient group resolution, blast CRUD.
 */

const db = require('../../../utils/sqlbuilder')

// ──────────────────────────────────────────────────────────────────────────────
// HELPERS
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Generate a human-readable blast reference.
 * Format: BLAST-YYYYMM-{blast_id padded to 5 digits}
 */
function makeBlastRef(blast_id) {
    const now = new Date()
    const y   = now.getFullYear()
    const m   = String(now.getMonth() + 1).padStart(2, '0')
    return `BLAST-${y}${m}-${String(blast_id).padStart(5, '0')}`
}

// ──────────────────────────────────────────────────────────────────────────────
// TEMPLATES
// ──────────────────────────────────────────────────────────────────────────────

async function GetBlastTemplates(channel = null) {
    let sql = `
        SELECT blast_template_id, template_name, template_tag, template_channel, template_title, template_body, status
        FROM blast_template
        WHERE status = 'Active'
    `
    const params = []
    if (channel) {
        sql += ` AND (template_channel = ? OR template_channel = 'Both')`
        params.push(channel)
    }
    sql += ` ORDER BY blast_template_id ASC`
    const rows = await db.raw(sql, params)
    return { status: true, data: rows }
}

async function GetBlastTemplateById(blast_template_id) {
    const sql = `
        SELECT blast_template_id, template_name, template_tag, template_channel, template_title, template_body, status
        FROM blast_template
        WHERE blast_template_id = ?
    `
    const rows = await db.raw(sql, [blast_template_id])
    if (!rows.length) return { status: false, message: 'Template not found' }
    return { status: true, data: rows[0] }
}

async function CreateBlastTemplate(data) {
    const { template_name, template_tag, template_channel, template_title, template_body } = data
    const result = await db.insert('blast_template', {
        template_name,
        template_tag:     template_tag     || null,
        template_channel: template_channel || 'Push',
        template_title:   template_title   || null,
        template_body:    template_body    || null,
        status:           'Active'
    })
    return { status: true, data: { blast_template_id: result.insertId } }
}

async function UpdateBlastTemplate(blast_template_id, data) {
    const fields = {}
    if (data.template_name    !== undefined) fields.template_name    = data.template_name
    if (data.template_tag     !== undefined) fields.template_tag     = data.template_tag
    if (data.template_channel !== undefined) fields.template_channel = data.template_channel
    if (data.template_title   !== undefined) fields.template_title   = data.template_title
    if (data.template_body    !== undefined) fields.template_body    = data.template_body
    if (data.status           !== undefined) fields.status           = data.status

    if (!Object.keys(fields).length) return { status: false, message: 'No fields to update' }

    await db.update('blast_template', fields, { blast_template_id })
    return { status: true }
}

// ──────────────────────────────────────────────────────────────────────────────
// RECIPIENT GROUPS
// ──────────────────────────────────────────────────────────────────────────────

/**
 * SQL query map for each named recipient group.
 * Each query returns: account_id, account_fullname, auth_usermail
 */
const GROUP_QUERIES = {
    all_users: `
        SELECT a.account_id, a.account_fullname, aa.auth_usermail
        FROM account a
        INNER JOIN auth_access aa ON aa.account_id = a.account_id
        WHERE a.status = 'Active' AND aa.auth_status = 'Active'
    `,
    active_users: `
        SELECT DISTINCT a.account_id, a.account_fullname, aa.auth_usermail
        FROM account a
        INNER JOIN auth_access aa        ON aa.account_id  = a.account_id
        INNER JOIN account_subscription s ON s.account_id  = a.account_id
        WHERE a.status = 'Active' AND aa.auth_status = 'Active'
        AND s.status = 'Active'
    `,
    free_users: `
        SELECT DISTINCT a.account_id, a.account_fullname, aa.auth_usermail
        FROM account a
        INNER JOIN auth_access aa         ON aa.account_id   = a.account_id
        INNER JOIN account_subscription s  ON s.account_id   = a.account_id
        INNER JOIN subscription_package sp ON sp.sub_package_id = s.sub_package_id
        WHERE a.status = 'Active' AND aa.auth_status = 'Active'
        AND s.status = 'Active' AND sp.package_price = 0
    `,
    premium_users: `
        SELECT DISTINCT a.account_id, a.account_fullname, aa.auth_usermail
        FROM account a
        INNER JOIN auth_access aa         ON aa.account_id   = a.account_id
        INNER JOIN account_subscription s  ON s.account_id   = a.account_id
        INNER JOIN subscription_package sp ON sp.sub_package_id = s.sub_package_id
        WHERE a.status = 'Active' AND aa.auth_status = 'Active'
        AND s.status = 'Active' AND sp.package_price > 0
    `,
    pending_claims: `
        SELECT DISTINCT a.account_id, a.account_fullname, aa.auth_usermail
        FROM account a
        INNER JOIN auth_access aa      ON aa.account_id = a.account_id
        INNER JOIN account_tax_claim c ON c.account_id  = a.account_id
        WHERE a.status = 'Active' AND aa.auth_status = 'Active'
        AND c.claim_status IN ('Draft', 'Pending') AND c.status = 'Active'
    `,
    no_submissions_30d: `
        SELECT a.account_id, a.account_fullname, aa.auth_usermail
        FROM account a
        INNER JOIN auth_access aa ON aa.account_id = a.account_id
        WHERE a.status = 'Active' AND aa.auth_status = 'Active'
            AND a.account_id NOT IN (
                SELECT DISTINCT account_id FROM receipt
                WHERE created_date >= DATE_SUB(NOW(), INTERVAL 30 DAY)
                    AND status NOT IN ('Deleted')
                UNION
                SELECT DISTINCT account_id FROM account_expenses
                WHERE created_date >= DATE_SUB(NOW(), INTERVAL 30 DAY)
                    AND status NOT IN ('Deleted')
            )
    `,
    overdue_bills: `
        SELECT DISTINCT a.account_id, a.account_fullname, aa.auth_usermail
        FROM account a
        INNER JOIN auth_access aa ON aa.account_id = a.account_id
        INNER JOIN bill b          ON b.account_id  = a.account_id
        WHERE a.status = 'Active' AND aa.auth_status = 'Active'
        AND b.bill_status = 'Overdue'
    `,
    expiring_soon_7d: `
        SELECT DISTINCT a.account_id, a.account_fullname, aa.auth_usermail
        FROM account a
        INNER JOIN auth_access aa         ON aa.account_id = a.account_id
        INNER JOIN account_subscription s  ON s.account_id = a.account_id
        WHERE a.status = 'Active' AND aa.auth_status = 'Active'
        AND s.status = 'Active'
        AND s.current_period_end BETWEEN NOW() AND DATE_ADD(NOW(), INTERVAL 7 DAY)
    `
}

/**
 * Returns all recipient groups with their current user counts.
 */
async function GetRecipientGroups() {
    const groups = [
        { key: 'all_users',        label: 'All Users' },
        { key: 'active_users',     label: 'Active Users' },
        { key: 'free_users',       label: 'Free Users' },
        { key: 'premium_users',    label: 'Premium Users' },
        { key: 'pending_claims',   label: 'Users with Pending Claims' },
        { key: 'no_submissions_30d', label: 'No Submissions (30 days)' },
        { key: 'overdue_bills',    label: 'Overdue Bills' },
        { key: 'expiring_soon_7d', label: 'Expiring Subscription (7 days)' }
    ]

    const results = await Promise.all(
        groups.map(async g => {
            const countSql = `SELECT COUNT(*) AS total FROM (${GROUP_QUERIES[g.key]}) AS sub`
            const rows = await db.raw(countSql)
            return { ...g, count: rows[0].total }
        })
    )
    return { status: true, data: results }
}

/**
 * Resolve a named group into an array of recipient rows.
 * Returns: { account_id, account_fullname, auth_usermail }[]
 */
async function GetRecipientsByGroup(group_key) {
    if (!GROUP_QUERIES[group_key]) {
        return { status: false, message: 'Invalid recipient group' }
    }
    const rows = await db.raw(GROUP_QUERIES[group_key])
    return { status: true, data: rows }
}

/**
 * Resolve an array of individual account_ids into recipient rows.
 * Returns: { account_id, account_fullname, auth_usermail }[]
 */
async function GetRecipientsByIds(account_ids) {
    if (!account_ids || !account_ids.length) return { status: true, data: [] }
    const placeholders = account_ids.map(() => '?').join(',')
    const sql = `
        SELECT a.account_id, a.account_fullname, aa.auth_usermail
        FROM account a
        INNER JOIN auth_access aa ON aa.account_id = a.account_id
        WHERE a.account_id IN (${placeholders})
          AND a.status = 'Active' AND aa.auth_status = 'Active'
    `
    const rows = await db.raw(sql, account_ids)
    return { status: true, data: rows }
}

/**
 * Paginated list of all active users for the Individual Users tab.
 */
async function GetIndividualUsers({ page = 1, limit = 20, search = '' } = {}) {
    const offset = (page - 1) * limit
    const params = []
    let where = `WHERE a.status = 'Active' AND aa.auth_status = 'Active'`

    if (search) {
        where += ` AND (a.account_fullname LIKE ? OR aa.auth_usermail LIKE ?)`
        params.push(`%${search}%`, `%${search}%`)
    }

    const countSql = `
        SELECT COUNT(*) AS total
        FROM account a
        INNER JOIN auth_access aa ON aa.account_id = a.account_id
        ${where}
    `
    const dataSql = `
        SELECT a.account_id, a.account_fullname, aa.auth_usermail
        FROM account a
        INNER JOIN auth_access aa ON aa.account_id = a.account_id
        ${where}
        ORDER BY a.account_fullname ASC
        LIMIT ? OFFSET ?
    `

    const [countRows, dataRows] = await Promise.all([
        db.raw(countSql, [...params]),
        db.raw(dataSql,  [...params, limit, offset])
    ])

    return {
        status: true,
        data: {
            users:       dataRows,
            total:       countRows[0].total,
            page:        Number(page),
            limit:       Number(limit),
            total_pages: Math.ceil(countRows[0].total / limit)
        }
    }
}

// ──────────────────────────────────────────────────────────────────────────────
// BLAST MESSAGE CRUD
// ──────────────────────────────────────────────────────────────────────────────

async function CreateBlast(data) {
    const {
        blast_channel, blast_title, blast_body,
        blast_recipient_type, blast_recipient_group, blast_recipient_ids,
        blast_recipient_count, blast_template_id, blast_status,
        blast_sent_at, blast_sent_count, blast_failed_count, blast_sent_by
    } = data

    const result = await db.insert('blast_message', {
        blast_ref:             'BLAST-PENDING',   // updated after insert
        blast_channel,
        blast_title,
        blast_body,
        blast_recipient_type:  blast_recipient_type  || 'Group',
        blast_recipient_group: blast_recipient_group || null,
        blast_recipient_ids:   blast_recipient_ids   ? JSON.stringify(blast_recipient_ids) : null,
        blast_recipient_count: blast_recipient_count || 0,
        blast_sent_count:      blast_sent_count      || 0,
        blast_failed_count:    blast_failed_count    || 0,
        blast_template_id:     blast_template_id     || null,
        blast_status:          blast_status          || 'Draft',
        blast_sent_at:         blast_sent_at         || null,
        blast_sent_by:         blast_sent_by         || null
    })

    const blast_id  = result.insertId
    const blast_ref = makeBlastRef(blast_id)
    await db.update('blast_message', { blast_ref }, { blast_id })

    return { status: true, data: { blast_id, blast_ref } }
}

async function UpdateBlastAfterSend(blast_id, { blast_status, blast_sent_at, blast_sent_count, blast_failed_count }) {
    await db.update('blast_message', {
        blast_status,
        blast_sent_at,
        blast_sent_count,
        blast_failed_count
    }, { blast_id })
    return { status: true }
}

async function GetBlastHistory({ page = 1, limit = 20, channel = null, status = null } = {}) {
    const offset = (page - 1) * limit
    const params = []
    let where = `WHERE 1=1`

    if (channel) { where += ` AND bm.blast_channel = ?`;  params.push(channel) }
    if (status)  { where += ` AND bm.blast_status  = ?`;  params.push(status) }

    const countSql = `SELECT COUNT(*) AS total FROM blast_message bm ${where}`
    const dataSql  = `
        SELECT bm.blast_id, bm.blast_ref, bm.blast_channel,
            bm.blast_title, bm.blast_recipient_count,
            bm.blast_sent_count, bm.blast_failed_count,
            bm.blast_status, bm.blast_sent_at,
            bm.blast_recipient_type, bm.blast_recipient_group,
            a.admin_username AS sent_by_username
        FROM blast_message bm
        LEFT JOIN admin a ON a.admin_id = bm.blast_sent_by
        ${where}
        ORDER BY bm.created_at DESC
        LIMIT ? OFFSET ?
    `

    const [countRows, dataRows] = await Promise.all([
        db.raw(countSql, [...params]),
        db.raw(dataSql,  [...params, limit, offset])
    ])

    return {
        status: true,
        data: {
            blasts:      dataRows,
            total:       countRows[0].total,
            page:        Number(page),
            limit:       Number(limit),
            total_pages: Math.ceil(countRows[0].total / limit)
        }
    }
}

async function GetBlastDetail(blast_id) {
    const sql = `
        SELECT bm.*, a.admin_username AS sent_by_username
        FROM blast_message bm
        LEFT JOIN admin a ON a.admin_id = bm.blast_sent_by
        WHERE bm.blast_id = ?
    `
    const rows = await db.raw(sql, [blast_id])
    if (!rows.length) return { status: false, message: 'Blast not found' }
    return { status: true, data: rows[0] }
}

// ──────────────────────────────────────────────────────────────────────────────

module.exports = {
    // Templates
    GetBlastTemplates,
    GetBlastTemplateById,
    CreateBlastTemplate,
    UpdateBlastTemplate,
    // Recipients
    GetRecipientGroups,
    GetRecipientsByGroup,
    GetRecipientsByIds,
    GetIndividualUsers,
    // Blasts
    CreateBlast,
    UpdateBlastAfterSend,
    GetBlastHistory,
    GetBlastDetail
}
