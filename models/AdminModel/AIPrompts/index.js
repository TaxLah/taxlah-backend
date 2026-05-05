const db = require('../../../utils/sqlbuilder')

/**
 * Return all prompt templates (id, name, description, is_active, created_at, updated_at — NOT the full template text)
 * so the list call is lightweight.
 */
async function GetAllPromptTemplates() {
    let result = null
    try {
        const rows = await db.raw(
            `SELECT id, name, description, is_active, created_at, updated_at
             FROM prompt_templates
             ORDER BY name ASC`
        )
        result = { status: true, data: rows }
    } catch (e) {
        console.error('[AIPrompts] GetAllPromptTemplates:', e)
        result = { status: false, data: null }
    }
    return result
}

/**
 * Return a single prompt template including its full template text.
 * @param {number} id
 */
async function GetPromptTemplateById(id) {
    let result = null
    try {
        const rows = await db.raw(
            `SELECT *
             FROM prompt_templates
             WHERE id = ?
             LIMIT 1`,
            [id]
        )
        if (!rows.length) {
            result = { status: false, data: null, notFound: true }
        } else {
            result = { status: true, data: rows[0] }
        }
    } catch (e) {
        console.error('[AIPrompts] GetPromptTemplateById:', e)
        result = { status: false, data: null }
    }
    return result
}

/**
 * Update a prompt template's text and/or description.
 * @param {number} id
 * @param {{ template?: string, description?: string, is_active?: number }} fields
 */
async function UpdatePromptTemplate(id, fields = {}) {
    let result = null
    try {
        const setClauses = []
        const params     = []

        if (fields.template !== undefined) {
            setClauses.push('template = ?')
            params.push(fields.template)
        }
        if (fields.description !== undefined) {
            setClauses.push('description = ?')
            params.push(fields.description)
        }
        if (fields.is_active !== undefined) {
            setClauses.push('is_active = ?')
            params.push(fields.is_active ? 1 : 0)
        }

        if (!setClauses.length) {
            return { status: false, data: null, message: 'No fields to update' }
        }

        params.push(id)

        await db.raw(
            `UPDATE prompt_templates SET ${setClauses.join(', ')} WHERE id = ?`,
            params
        )

        // Return the updated row
        const rows = await db.raw(
            `SELECT id, name, description, template, is_active, created_at, updated_at
             FROM prompt_templates WHERE id = ? LIMIT 1`,
            [id]
        )

        result = rows.length
            ? { status: true, data: rows[0] }
            : { status: false, data: null, notFound: true }
    } catch (e) {
        console.error('[AIPrompts] UpdatePromptTemplate:', e)
        result = { status: false, data: null }
    }
    return result
}

module.exports = {
    GetAllPromptTemplates,
    GetPromptTemplateById,
    UpdatePromptTemplate,
}
