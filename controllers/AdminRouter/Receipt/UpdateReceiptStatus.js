const express = require('express')
const router = express.Router()
const { CHECK_EMPTY, sanitize } = require('../../../configs/helper')
const { AdminUpdateReceiptStatus } = require('../../../models/AdminModel/Receipt')

/**
 * PATCH /admin/receipt/status/:receipt_id
 * Update receipt status (admin can change status of any receipt)
 * @param receipt_id - Receipt ID
 * @body status - Status: Active, Inactive, Deleted, Others
 */
router.patch('/status/:receipt_id', async (req, res) => {
    try {
        const receipt_id = sanitize(req.params.receipt_id)
        const status = sanitize(req.body.status)

        if (CHECK_EMPTY(receipt_id)) {
            return res.status(400).json({
                status_code: 400,
                status: 'error',
                message: 'Receipt ID is required',
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

        const result = await AdminUpdateReceiptStatus(receipt_id, status)

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
        console.log("Error PATCH /admin/receipt/status: ", e)
        return res.status(500).json({
            status_code: 500,
            status: 'error',
            message: 'Internal server error',
            data: null
        })
    }
})

module.exports = router
