const express = require('express')
const router = express.Router()
const { AdminGetReceiptStats } = require('../../../models/AdminModel/Receipt')

/**
 * GET /admin/receipt/stats
 * Get receipt statistics (admin overview)
 */
router.get('/stats', async (req, res) => {
    try {
        const result = await AdminGetReceiptStats()

        if (result.status) {
            return res.status(200).json({
                status_code: 200,
                status: 'success',
                message: 'Receipt statistics retrieved successfully',
                data: result.data
            })
        } else {
            return res.status(500).json({
                status_code: 500,
                status: 'error',
                message: 'Failed to retrieve receipt statistics',
                data: null
            })
        }
    } catch (e) {
        console.log("Error GET /admin/receipt/stats: ", e)
        return res.status(500).json({
            status_code: 500,
            status: 'error',
            message: 'Internal server error',
            data: null
        })
    }
})

module.exports = router
