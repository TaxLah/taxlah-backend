const express = require('express')
const router = express.Router()
const { CHECK_EMPTY, sanitize } = require('../../../configs/helper')
const { AdminDeleteReceiptCategory } = require('../../../models/AdminModel/ReceiptCategory')

/**
 * DELETE /admin/receipt-category/delete/:rc_id
 * Delete receipt category (hard delete, prevents deletion if in use)
 * @param rc_id - Receipt category ID
 */
router.delete('/delete/:rc_id', async (req, res) => {
    try {
        const rc_id = sanitize(req.params.rc_id)

        if (CHECK_EMPTY(rc_id)) {
            return res.status(400).json({
                status_code: 400,
                status: 'error',
                message: 'Receipt category ID is required',
                data: null
            })
        }

        const result = await AdminDeleteReceiptCategory(rc_id)

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
        console.log("Error DELETE /admin/receipt-category/delete: ", e)
        return res.status(500).json({
            status_code: 500,
            status: 'error',
            message: 'Internal server error',
            data: null
        })
    }
})

module.exports = router
