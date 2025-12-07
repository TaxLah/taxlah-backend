const express = require('express')
const router = express.Router()
const { CHECK_EMPTY, sanitize } = require('../../../configs/helper')
const { AdminUpdateReceiptCategory, AdminGetReceiptCategoryDetails } = require('../../../models/AdminModel/ReceiptCategory')

/**
 * PUT /admin/receipt-category/update/:rc_id
 * Update receipt category
 * @param rc_id - Receipt category ID
 * @body rc_name - Category name (optional)
 * @body rc_description - Category description (optional)
 * @body status - Status (optional)
 */
router.put('/update/:rc_id', async (req, res) => {
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

        // Check if category exists
        const checkResult = await AdminGetReceiptCategoryDetails(rc_id)
        if (!checkResult.status) {
            return res.status(404).json({
                status_code: 404,
                status: 'error',
                message: 'Receipt category not found',
                data: null
            })
        }

        const updateData = {
            rc_name: sanitize(req.body.rc_name),
            rc_description: sanitize(req.body.rc_description),
            status: sanitize(req.body.status)
        }

        // Remove undefined values
        Object.keys(updateData).forEach(key => updateData[key] === undefined && delete updateData[key])

        if (Object.keys(updateData).length === 0) {
            return res.status(400).json({
                status_code: 400,
                status: 'error',
                message: 'No data to update',
                data: null
            })
        }

        const result = await AdminUpdateReceiptCategory(rc_id, updateData)

        if (result && result.status) {
            return res.status(200).json({
                status_code: 200,
                status: 'success',
                message: 'Receipt category updated successfully',
                data: result.data
            })
        } else {
            const errorMessage = (result && result.message) ? result.message : 'Failed to update receipt category'
            return res.status(400).json({
                status_code: 400,
                status: 'error',
                message: errorMessage,
                data: null
            })
        }
    } catch (e) {
        console.log("Error PUT /admin/receipt-category/update: ", e)
        return res.status(500).json({
            status_code: 500,
            status: 'error',
            message: 'Internal server error',
            data: null
        })
    }
})

module.exports = router
