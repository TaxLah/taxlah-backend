/**
 * Advertisement data access.
 *
 * "Live" means: not soft-deleted, status Active, and inside its scheduling window. The
 * window is optional on both sides, so a row with no dates is simply always live — that
 * check lives here rather than in each caller so the app and the admin preview can never
 * disagree about what a user would actually see.
 */

const db = require('../../utils/sqlbuilder');

const PUBLIC_COLUMNS = `
    ad_id, ad_title, ad_description, ad_image_url, ad_icon, ad_accent_color,
    ad_cta_label, ad_action_type, ad_action_value, sort_order
`;

/** Rows a user is entitled to see right now, ordered as the admin arranged them. */
async function listLive({ limit = null } = {}) {
    // LIMIT cannot take a placeholder: MySQL's prepared-statement protocol rejects it
    // with ER_WRONG_ARGUMENTS. Coerce to a positive integer and inline it, so nothing
    // caller-supplied reaches the statement as text.
    const safeLimit = Number.isFinite(Number(limit)) && Number(limit) > 0
        ? Math.floor(Number(limit))
        : null;

    const sql = `
        SELECT ${PUBLIC_COLUMNS}
          FROM advertisement
         WHERE is_deleted = 0
           AND status = 'Active'
           AND (start_date IS NULL OR start_date <= CURDATE())
           AND (end_date   IS NULL OR end_date   >= CURDATE())
         ORDER BY sort_order ASC, ad_id ASC
        ${safeLimit ? `LIMIT ${safeLimit}` : ''}
    `;
    return db.raw(sql);
}

/** Total live rows, so the app knows whether a "See all" affordance is worth showing. */
async function countLive() {
    const rows = await db.raw(`
        SELECT COUNT(*) AS total
          FROM advertisement
         WHERE is_deleted = 0
           AND status = 'Active'
           AND (start_date IS NULL OR start_date <= CURDATE())
           AND (end_date   IS NULL OR end_date   >= CURDATE())
    `);
    return rows[0]?.total ?? 0;
}

/** Everything not soft-deleted, including inactive and scheduled rows, for the admin list. */
async function listForAdmin() {
    return db.raw(`
        SELECT a.*,
               CASE
                   WHEN a.status <> 'Active' THEN 'Inactive'
                   WHEN a.start_date IS NOT NULL AND a.start_date > CURDATE() THEN 'Scheduled'
                   WHEN a.end_date   IS NOT NULL AND a.end_date   < CURDATE() THEN 'Expired'
                   ELSE 'Live'
               END AS display_state
          FROM advertisement a
         WHERE a.is_deleted = 0
         ORDER BY a.sort_order ASC, a.ad_id ASC
    `);
}

async function getById(ad_id) {
    const rows = await db.raw(
        `SELECT * FROM advertisement WHERE ad_id = ? AND is_deleted = 0 LIMIT 1`,
        [ad_id]
    );
    return rows[0] || null;
}

async function create(data) {
    return db.insert('advertisement', data);
}

async function update(ad_id, data) {
    return db.update('advertisement', data, { ad_id });
}

/**
 * Soft delete. The row stays so that anything referencing it — audit entries, future
 * click tracking — keeps resolving.
 */
async function softDelete(ad_id) {
    return db.raw(
        `UPDATE advertisement SET is_deleted = 1, last_modified = NOW() WHERE ad_id = ?`,
        [ad_id]
    );
}

/** Applies a new ordering in one pass. Ignores ids that do not exist. */
async function reorder(orderedIds) {
    for (let i = 0; i < orderedIds.length; i++) {
        await db.raw(
            `UPDATE advertisement SET sort_order = ?, last_modified = NOW()
              WHERE ad_id = ? AND is_deleted = 0`,
            [i, orderedIds[i]]
        );
    }
}

module.exports = {
    listLive,
    countLive,
    listForAdmin,
    getById,
    create,
    update,
    softDelete,
    reorder,
};
