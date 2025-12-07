const express = require('express')
const router = express.Router()
const { CHECK_EMPTY, sanitize } = require('../../../configs/helper')
const { AdminGetReceiptCategoryDetails } = require('../../../models/AdminModel/ReceiptCategory')

/**
 * GET /admin/receipt-category/details/:rc_id
 * Get single receipt category details
 * @param rc_id - Receipt category ID
 */
router.get('/details/:rc_id', async (req, res) => {
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

        const result = await AdminGetReceiptCategoryDetails(rc_id)

        if (result.status) {
            return res.status(200).json({
                status_code: 200,
                status: 'success',
                message: 'Receipt category details retrieved successfully',
                data: result.data
            })
        } else {
            return res.status(404).json({
                status_code: 404,
                status: 'error',
                message: 'Receipt category not found',
                data: null
            })
        }
    } catch (e) {
        console.log("Error GET /admin/receipt-category/details: ", e)
        return res.status(500).json({
            status_code: 500,
            status: 'error',
            message: 'Internal server error',
            data: null
        })
    }
})

module.exports = router
