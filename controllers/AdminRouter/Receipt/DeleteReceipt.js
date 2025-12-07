const express = require('express')
const router = express.Router()
const { CHECK_EMPTY, sanitize } = require('../../../configs/helper')
const { AdminDeleteReceipt } = require('../../../models/AdminModel/Receipt')

/**
 * DELETE /admin/receipt/delete/:receipt_id
 * Soft delete receipt (set status to Deleted)
 * @param receipt_id - Receipt ID
 */
router.delete('/delete/:receipt_id', async (req, res) => {
    try {
        const receipt_id = sanitize(req.params.receipt_id)

        if (CHECK_EMPTY(receipt_id)) {
            return res.status(400).json({
                status_code: 400,
                status: 'error',
                message: 'Receipt ID is required',
                data: null
            })
        }

        const result = await AdminDeleteReceipt(receipt_id)

        if (result.status) {
            return res.status(200).json({
                status_code: 200,
                status: 'success',
                message: result.message,
                data: null
            })
        } else {
            return res.status(500).json({
                status_code: 500,
                status: 'error',
                message: result.message,
                data: null
            })
        }
    } catch (e) {
        console.log("Error DELETE /admin/receipt/delete: ", e)
        return res.status(500).json({
            status_code: 500,
            status: 'error',
            message: 'Internal server error',
            data: null
        })
    }
})

module.exports = router
