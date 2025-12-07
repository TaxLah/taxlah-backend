const express = require('express')
const router = express.Router()
const { AdminGetReceiptCategoryStats } = require('../../../models/AdminModel/ReceiptCategory')

/**
 * GET /admin/receipt-category/stats
 * Get receipt category statistics
 */
router.get('/stats', async (req, res) => {
    try {
        const result = await AdminGetReceiptCategoryStats()

        if (result.status) {
            return res.status(200).json({
                status_code: 200,
                status: 'success',
                message: 'Receipt category statistics retrieved successfully',
                data: result.data
            })
        } else {
            return res.status(500).json({
                status_code: 500,
                status: 'error',
                message: 'Failed to retrieve receipt category statistics',
                data: null
            })
        }
    } catch (e) {
        console.log("Error GET /admin/receipt-category/stats: ", e)
        return res.status(500).json({
            status_code: 500,
            status: 'error',
            message: 'Internal server error',
            data: null
        })
    }
})

module.exports = router
