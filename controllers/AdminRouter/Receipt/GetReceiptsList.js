const express = require('express')
const router = express.Router()
const { CHECK_EMPTY, sanitize } = require('../../../configs/helper')
const { AdminGetReceiptsList } = require('../../../models/AdminModel/Receipt')

/**
 * GET /admin/receipt/list
 * Get paginated list of receipts (admin view)
 * @query page - Page number (default: 1)
 * @query limit - Items per page (default: 20)
 * @query search - Search by receipt name or description
 * @query account_id - Filter by user ID
 * @query rc_id - Filter by receipt category ID
 * @query status - Filter by status (Active, Inactive, Deleted, All)
 * @query sortBy - Sort column (receipt_id, receipt_name, receipt_amount, created_date, account_id)
 * @query sortOrder - Sort order (ASC, DESC)
 */
router.get('/list', async (req, res) => {
    try {
        const params = {
            page: sanitize(req.query.page),
            limit: sanitize(req.query.limit),
            search: sanitize(req.query.search),
            account_id: sanitize(req.query.account_id),
            rc_id: sanitize(req.query.rc_id),
            status: sanitize(req.query.status),
            sortBy: sanitize(req.query.sortBy),
            sortOrder: sanitize(req.query.sortOrder)
        }

        const result = await AdminGetReceiptsList(params)

        if (result.status) {
            return res.status(200).json({
                status_code: 200,
                status: 'success',
                message: 'Receipts retrieved successfully',
                data: result.data
            })
        } else {
            return res.status(500).json({
                status_code: 500,
                status: 'error',
                message: 'Failed to retrieve receipts',
                data: null
            })
        }
    } catch (e) {
        console.log("Error GET /admin/receipt/list: ", e)
        return res.status(500).json({
            status_code: 500,
            status: 'error',
            message: 'Internal server error',
            data: null
        })
    }
})

module.exports = router
