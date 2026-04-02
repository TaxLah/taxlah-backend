const db = require('../../../utils/sqlbuilder')

// Columns that are safe to return in API responses.
// pg_apikey and pg_secretkey are NEVER selected — they are write-only.
const SAFE_COLS = `
    pg_id,
    pg_name,
    pg_provider,
    pg_environment,
    pg_is_default,
    pg_baseurl,
    pg_config,
    pg_payment_methods,
    status,
    created_at,
    last_modified,
    (pg_apikey IS NOT NULL AND pg_apikey != '') AS pg_apikey_set,
    (pg_secretkey IS NOT NULL AND pg_secretkey != '') AS pg_secretkey_set
`

/* ─────────────────────────────────────────────────────────────
   1. LIST — with per-gateway transaction stats and header totals
──────────────────────────────────────────────────────────────── */
async function AdminGetPaymentGatewaysList(params = {}) {
    const page     = parseInt(params.page)  || 1
    const limit    = parseInt(params.limit) || 20
    const offset   = (page - 1) * limit
    const provider = params.provider || ''
    const status   = params.status   || ''
    const env      = params.environment || ''

    const where  = []
    const values = []

    if (provider && provider !== 'All') {
        where.push(`pgc.pg_provider = ?`)
        values.push(provider)
    }
    if (status && status !== 'All') {
        where.push(`pgc.status = ?`)
        values.push(status)
    }
    if (env && env !== 'All') {
        where.push(`pgc.pg_environment = ?`)
        values.push(env)
    }

    const clause = where.length ? `WHERE ${where.join(' AND ')}` : ''

    try {
        // ── Header summary (always across ALL gateways, no filter) ──
        const [summary] = await db.raw(`
            SELECT COUNT(*) AS total_gateways, SUM(CASE WHEN status = 'Active' THEN 1 ELSE 0 END)  AS active_gateways
            FROM payment_gateway_conf
        `)

        const [txSummary] = await db.raw(`
            SELECT COUNT(*) AS total_transactions, IFNULL(SUM(amount), 0) AS total_volume
            FROM subscription_payment
            WHERE payment_status = 'Paid'
        `)

        // ── Paginated gateway rows ──
        const [{ c: total }] = await db.raw(
            `SELECT COUNT(*) AS c FROM payment_gateway_conf pgc ${clause}`,
            values
        )

        const rows = await db.raw(`
            SELECT
                ${SAFE_COLS},
                IFNULL(sp.tx_count, 0) AS transactions,
                IFNULL(sp.tx_amount, 0.00) AS total_amount
            FROM payment_gateway_conf pgc
            LEFT JOIN (
                SELECT payment_gateway, COUNT(*) AS tx_count, IFNULL(SUM(amount), 0) AS tx_amount
                FROM subscription_payment
                WHERE payment_status = 'Paid'
                GROUP BY payment_gateway
            ) sp ON sp.payment_gateway = pgc.pg_provider COLLATE utf8mb4_unicode_ci
                 AND pgc.pg_environment = 'Production'
            ${clause}
            ORDER BY pgc.pg_is_default DESC, pgc.status ASC, pgc.pg_provider ASC
            LIMIT ${limit} OFFSET ${offset}
        `, values)

        return {
            status: true,
            data: {
                summary: {
                    totalGateways:    parseInt(summary.total_gateways),
                    active:           parseInt(summary.active_gateways),
                    transactions:     parseInt(txSummary.total_transactions),
                    totalVolume:      parseFloat(txSummary.total_volume),
                },
                rows,
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            }
        }
    } catch (e) {
        console.error('[AdminModel/PaymentGateway] List:', e)
        return { status: false, data: null }
    }
}

/* ─────────────────────────────────────────────────────────────
   2. DETAILS
──────────────────────────────────────────────────────────────── */
async function AdminGetPaymentGatewayDetails(pg_id) {
    try {
        const rows = await db.raw(`
            SELECT
                ${SAFE_COLS},
                IFNULL(sp.tx_count, 0)     AS transactions,
                IFNULL(sp.tx_amount, 0.00)  AS total_amount
            FROM payment_gateway_conf pgc
            LEFT JOIN (
                SELECT payment_gateway,
                       COUNT(*)              AS tx_count,
                       IFNULL(SUM(amount), 0) AS tx_amount
                FROM subscription_payment
                WHERE payment_status = 'Paid'
                GROUP BY payment_gateway
            ) sp ON sp.payment_gateway = pgc.pg_provider COLLATE utf8mb4_unicode_ci
                 AND pgc.pg_environment = 'Production'
            WHERE pgc.pg_id = ?
            LIMIT 1
        `, [pg_id])

        if (!rows.length) return { status: false, data: null }
        return { status: true, data: rows[0] }
    } catch (e) {
        console.error('[AdminModel/PaymentGateway] Details:', e)
        return { status: false, data: null }
    }
}

/* ─────────────────────────────────────────────────────────────
   3. CREATE
──────────────────────────────────────────────────────────────── */
async function AdminCreatePaymentGateway(data) {
    try {
        const row = await db.insert('payment_gateway_conf', data)
        if (!row.insertId) return { status: false, data: null }
        return { status: true, data: row.insertId }
    } catch (e) {
        console.error('[AdminModel/PaymentGateway] Create:', e)
        return { status: false, data: null }
    }
}

/* ─────────────────────────────────────────────────────────────
   4. UPDATE
──────────────────────────────────────────────────────────────── */
async function AdminUpdatePaymentGateway(pg_id, data) {
    try {
        const row = await db.update('payment_gateway_conf', data, { pg_id })
        return { status: row > 0, data: row }
    } catch (e) {
        console.error('[AdminModel/PaymentGateway] Update:', e)
        return { status: false, data: null }
    }
}

/* ─────────────────────────────────────────────────────────────
   5. UPDATE STATUS  (Active / Inactive)
──────────────────────────────────────────────────────────────── */
async function AdminUpdatePaymentGatewayStatus(pg_id, status) {
    try {
        const row = await db.update('payment_gateway_conf', { status }, { pg_id })
        return { status: row > 0, data: row }
    } catch (e) {
        console.error('[AdminModel/PaymentGateway] UpdateStatus:', e)
        return { status: false, data: null }
    }
}

/* ─────────────────────────────────────────────────────────────
   6. SET DEFAULT
   Atomically clears all defaults then sets the target one.
──────────────────────────────────────────────────────────────── */
async function AdminSetPaymentGatewayDefault(pg_id) {
    try {
        await db.raw(`UPDATE payment_gateway_conf SET pg_is_default = 0`)
        const row = await db.update('payment_gateway_conf', { pg_is_default: 1 }, { pg_id })
        return { status: row > 0, data: row }
    } catch (e) {
        console.error('[AdminModel/PaymentGateway] SetDefault:', e)
        return { status: false, data: null }
    }
}

/* ─────────────────────────────────────────────────────────────
   7. DELETE
──────────────────────────────────────────────────────────────── */
async function AdminDeletePaymentGateway(pg_id) {
    try {
        const row = await db.raw(
            `DELETE FROM payment_gateway_conf WHERE pg_id = ? LIMIT 1`,
            [pg_id]
        )
        return { status: row.affectedRows > 0, data: row.affectedRows }
    } catch (e) {
        console.error('[AdminModel/PaymentGateway] Delete:', e)
        return { status: false, data: null }
    }
}

/* ─────────────────────────────────────────────────────────────
   8. CHECK DUPLICATE NAME (same name + environment combination)
──────────────────────────────────────────────────────────────── */
async function AdminCheckPaymentGatewayDuplicate(pg_name, pg_provider, pg_environment, exclude_pg_id = null) {
    try {
        let sql    = `SELECT pg_id FROM payment_gateway_conf WHERE pg_name = ? AND pg_provider = ? AND pg_environment = ?`
        let values = [pg_name, pg_provider, pg_environment]
        if (exclude_pg_id) {
            sql += ` AND pg_id != ?`
            values.push(exclude_pg_id)
        }
        sql += ` LIMIT 1`
        const rows = await db.raw(sql, values)
        return { status: true, data: rows.length > 0 }
    } catch (e) {
        console.error('[AdminModel/PaymentGateway] CheckDuplicate:', e)
        return { status: false, data: false }
    }
}

module.exports = {
    AdminGetPaymentGatewaysList,
    AdminGetPaymentGatewayDetails,
    AdminCreatePaymentGateway,
    AdminUpdatePaymentGateway,
    AdminUpdatePaymentGatewayStatus,
    AdminSetPaymentGatewayDefault,
    AdminDeletePaymentGateway,
    AdminCheckPaymentGatewayDuplicate,
}
