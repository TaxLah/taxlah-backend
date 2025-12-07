const express = require('express')
const router = express.Router()
const { CHECK_EMPTY, sanitize } = require('../../../configs/helper')
const { AdminUpdateReceiptCategoryStatus } = require('../../../models/AdminModel/ReceiptCategory')

/**
 * PATCH /admin/receipt-category/status/:rc_id
 * Update receipt category status
 * @param rc_id - Receipt category ID
 * @body status - Status: Active, Inactive
 */
router.patch('/status/:rc_id', async (req, res) => {
    try {
        const rc_id = sanitize(req.params.rc_id)
        const status = sanitize(req.body.status)

        if (CHECK_EMPTY(rc_id)) {
            return res.status(400).json({
                status_code: 400,
                status: 'error',
                message: 'Receipt category ID is required',
                data: null
            })
        }

        if (CHECK_EMPTY(status)) {
            return res.status(400).json({
                status_code: 400,
                status: 'error',
                message: 'Status is required',
                data: null
            })
        }

        const result = await AdminUpdateReceiptCategoryStatus(rc_id, status)

        if (result.status) {
            return res.status(200).json({
                status_code: 200,
                status: 'success',
                message: result.message,
                data: null
            })
        } else {
            return res.status(400).json({
                status_code: 400,
                status: 'error',
                message: result.message,
                data: null
            })
        }
    } catch (e) {
        console.log("Error PATCH /admin/receipt-category/status: ", e)
        return res.status(500).json({
            status_code: 500,
            status: 'error',
            message: 'Internal server error',
            data: null
        })
    }
})

module.exports = router
