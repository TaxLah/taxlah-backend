const express = require('express')
const router = express.Router()
const { CHECK_EMPTY, sanitize } = require('../../../configs/helper')
const { AdminCreateReceiptCategory } = require('../../../models/AdminModel/ReceiptCategory')

/**
 * POST /admin/receipt-category/create
 * Create new receipt category
 * @body rc_name - Category name (required)
 * @body rc_description - Category description (optional)
 * @body status - Status (optional, default: Active)
 */
router.post('/create', async (req, res) => {
    try {
        const rc_name = sanitize(req.body.rc_name)

        if (CHECK_EMPTY(rc_name)) {
            return res.status(400).json({
                status_code: 400,
                status: 'error',
                message: 'Receipt category name is required',
                data: null
            })
        }

        const categoryData = {
            rc_name: rc_name,
            rc_description: sanitize(req.body.rc_description),
            status: sanitize(req.body.status) || 'Active'
        }

        const result = await AdminCreateReceiptCategory(categoryData)

        if (result.status) {
            return res.status(201).json({
                status_code: 201,
                status: 'success',
                message: 'Receipt category created successfully',
                data: result.data
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
        console.log("Error POST /admin/receipt-category/create: ", e)
        return res.status(500).json({
            status_code: 500,
            status: 'error',
            message: 'Internal server error',
            data: null
        })
    }
})

module.exports = router
