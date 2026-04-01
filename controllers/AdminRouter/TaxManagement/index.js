const express = require('express')
const router = express.Router()

const { superauth } = require('../../../configs/auth')
const {
    DEFAULT_API_RESPONSE,
    INTERNAL_SERVER_ERROR_API_RESPONSE,
    BAD_REQUEST_API_RESPONSE,
    SUCCESS_API_RESPONSE,
    CHECK_EMPTY
} = require('../../../configs/helper')
const NotificationService   = require('../../../services/NotificationService')
const db                    = require('../../../utils/sqlbuilder')

const CategoryRouter        = require("./Category")
const SubcategoryRouter     = require("./Subcategory")

router.use("/category", CategoryRouter)
router.use("/subcategory", SubcategoryRouter)

/**
 * POST /admin/tax-management/notify
 * Manually broadcast a tax relief notification to all active users.
 * Use this after publishing new official LHDN tax categories.
 *
 * Body (optional — if omitted, auto-generates message from DB):
 * {
 *   "tax_year": 2026,           // Optional: override year in message
 *   "custom_title": "...",      // Optional: override notification title
 *   "custom_body":  "..."       // Optional: override notification body
 * }
 */
router.post("/notify", superauth(), async (req, res) => {
    let response = DEFAULT_API_RESPONSE

    try {
        const { tax_year, custom_title, custom_body } = req.body

        let title = custom_title || null
        let body  = custom_body  || null

        // Auto-build message from DB if not overridden
        if (!title || !body) {
            const year = tax_year || new Date().getFullYear()

            const rows = await db.raw(`
                SELECT COUNT(*) AS category_count
                FROM tax_category
                WHERE tax_year = ?
                AND tax_mapping_status = 'Official'
                AND status = 'Active'
            `, [year])

            const count = rows[0]?.category_count || 0

            title = title || `📋 New Tax Relief Available (${year})`
            body  = body  || `LHDN has released ${count} official tax relief ${count === 1 ? 'category' : 'categories'} for Year ${year}. Tap to review and claim your reliefs.`
        }

        if (CHECK_EMPTY(title) || CHECK_EMPTY(body)) {
            response         = BAD_REQUEST_API_RESPONSE
            response.message = 'Notification title and body are required.'
            return res.status(response.status_code).json(response)
        }

        const result = await NotificationService.broadcastNotification(title, body, {
            type:     'NewTaxRelief',
            tax_year: String(tax_year || new Date().getFullYear())
        })

        if (!result.success) {
            response         = INTERNAL_SERVER_ERROR_API_RESPONSE
            response.message = result.error || 'Failed to broadcast notification.'
            return res.status(response.status_code).json(response)
        }

        response         = SUCCESS_API_RESPONSE
        response.message = `Tax relief notification broadcasted to ${result.total_accounts} account(s).`
        response.data    = {
            total_accounts: result.total_accounts,
            total_tokens:   result.total_tokens,
            title,
            body
        }

        return res.status(response.status_code).json(response)
    } catch (error) {
        console.error('[Admin TaxManagement] Notify error:', error)
        response      = INTERNAL_SERVER_ERROR_API_RESPONSE
        response.data = null
        return res.status(response.status_code).json(response)
    }
})

module.exports = router
