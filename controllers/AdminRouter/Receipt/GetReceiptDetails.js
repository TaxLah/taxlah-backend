const express = require('express')
const router = express.Router()
const { CHECK_EMPTY, sanitize } = require('../../../configs/helper')
const { AdminGetReceiptDetails } = require('../../../models/AdminModel/Receipt')

/**
 * GET /admin/receipt/details/:receipt_id
 * Get receipt details (admin view includes user info)
 * @param receipt_id - Receipt ID
 */
router.get('/details/:receipt_id', async (req, res) => {
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

        const result = await AdminGetReceiptDetails(receipt_id)

        if (result.status) {
            return res.status(200).json({
                status_code: 200,
                status: 'success',
                message: 'Receipt details retrieved successfully',
                data: result.data
            })
        } else {
            return res.status(404).json({
                status_code: 404,
                status: 'error',
                message: 'Receipt not found',
                data: null
            })
        }
    } catch (e) {
        console.log("Error GET /admin/receipt/details: ", e)
        return res.status(500).json({
            status_code: 500,
            status: 'error',
            message: 'Internal server error',
            data: null
        })
    }
})

module.exports = router
