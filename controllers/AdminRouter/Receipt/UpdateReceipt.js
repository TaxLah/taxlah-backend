const express = require('express')
const router = express.Router()
const { CHECK_EMPTY, sanitize } = require('../../../configs/helper')
const { AdminUpdateReceipt, AdminGetReceiptDetails } = require('../../../models/AdminModel/Receipt')

/**
 * PUT /admin/receipt/update/:receipt_id
 * Update receipt details (admin can update any receipt)
 * @param receipt_id - Receipt ID
 * @body receipt_name - Receipt name (optional)
 * @body receipt_description - Receipt description (optional)
 * @body receipt_amount - Receipt amount (optional)
 * @body rc_id - Receipt category ID (optional)
 * @body status - Status (optional)
 * @body receipt_items - Receipt items array (optional)
 * @body receipt_image_url - Receipt image URL (optional)
 */
router.put('/update/:receipt_id', async (req, res) => {
    try {
        console.log("Log Params : ", req.body)
        const receipt_id = sanitize(req.params.receipt_id)
        
        if (CHECK_EMPTY(receipt_id)) {
            return res.status(400).json({
                status_code: 400,
                status: 'error',
                message: 'Receipt ID is required',
                data: null
            })
        }

        // Check if receipt exists
        const checkResult = await AdminGetReceiptDetails(receipt_id)
        if (!checkResult.status) {
            return res.status(404).json({
                status_code: 404,
                status: 'error',
                message: 'Receipt not found',
                data: null
            })
        }

        const updateData = {
            receipt_name: sanitize(req.body.receipt_name),
            receipt_description: sanitize(req.body.receipt_description),
            receipt_amount: sanitize(req.body.receipt_amount),
            rc_id: req.body.rc_id,
            status: sanitize(req.body.status),
            receipt_items: req.body.receipt_items,
            receipt_image_url: sanitize(req.body.receipt_image_url)
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

        const result = await AdminUpdateReceipt(receipt_id, updateData)

        if (result.status) {
            return res.status(200).json({
                status_code: 200,
                status: 'success',
                message: 'Receipt updated successfully',
                data: result.data
            })
        } else {
            return res.status(500).json({
                status_code: 500,
                status: 'error',
                message: 'Failed to update receipt',
                data: null
            })
        }
    } catch (e) {
        console.log("Error PUT /admin/receipt/update: ", e)
        return res.status(500).json({
            status_code: 500,
            status: 'error',
            message: 'Internal server error',
            data: null
        })
    }
})

module.exports = router
