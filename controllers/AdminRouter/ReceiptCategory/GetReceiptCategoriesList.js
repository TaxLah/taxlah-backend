const express = require('express')
const router = express.Router()
const { CHECK_EMPTY, sanitize } = require('../../../configs/helper')
const { AdminGetReceiptCategoriesList } = require('../../../models/AdminModel/ReceiptCategory')

/**
 * GET /admin/receipt-category/list
 * Get paginated list of receipt categories (admin management)
 * @query page - Page number (default: 1)
 * @query limit - Items per page (default: 20)
 * @query search - Search by category name or description
 * @query status - Filter by status (Active, Inactive, All)
 * @query sortBy - Sort column (rc_id, rc_name, created_date, status)
 * @query sortOrder - Sort order (ASC, DESC)
 */
router.get('/list', async (req, res) => {
    try {
        const params = {
            page: sanitize(req.query.page),
            limit: sanitize(req.query.limit),
            search: sanitize(req.query.search),
            status: sanitize(req.query.status),
            sortBy: sanitize(req.query.sortBy),
            sortOrder: sanitize(req.query.sortOrder)
        }

        const result = await AdminGetReceiptCategoriesList(params)

        if (result.status) {
            return res.status(200).json({
                status_code: 200,
                status: 'success',
                message: 'Receipt categories retrieved successfully',
                data: result.data
            })
        } else {
            return res.status(500).json({
                status_code: 500,
                status: 'error',
                message: 'Failed to retrieve receipt categories',
                data: null
            })
        }
    } catch (e) {
        console.log("Error GET /admin/receipt-category/list: ", e)
        return res.status(500).json({
            status_code: 500,
            status: 'error',
            message: 'Internal server error',
            data: null
        })
    }
})

module.exports = router
