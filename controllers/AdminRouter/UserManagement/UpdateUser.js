const express = require('express')
const router = express.Router()
const { 
    DEFAULT_API_RESPONSE, 
    INTERNAL_SERVER_ERROR_API_RESPONSE,
    BAD_REQUEST_API_RESPONSE,
    SUCCESS_API_RESPONSE,
    CHECK_EMPTY,
    sanitize,
    isValidEmail
} = require('../../../configs/helper')
const { AdminUpdateUserProfile } = require('../../../models/AdminModel/UserManagement')

/**
 * PUT /admin/users/update/:account_id
 * Update user profile information
 * Body: { account_name, account_fullname, account_email, account_contact, address fields, etc. }
 */
router.put("/:account_id", async(req, res) => {
    let response = DEFAULT_API_RESPONSE

    try {
        const account_id = req.params.account_id
        const params = req.body

        if(CHECK_EMPTY(account_id)) {
            response = BAD_REQUEST_API_RESPONSE
            response.message = "Error. Account ID is required."
            return res.status(response.status_code).json(response)
        }

        console.log("Admin Update User Request - Account ID: ", account_id, " Params: ", params)

        // Build update object with only provided fields
        let updateData = {}

        if(params.account_name && !CHECK_EMPTY(params.account_name)) {
            updateData.account_name = sanitize(params.account_name)
        }

        if(params.account_fullname && !CHECK_EMPTY(params.account_fullname)) {
            updateData.account_fullname = sanitize(params.account_fullname)
        }

        if(params.account_email && !CHECK_EMPTY(params.account_email)) {
            if(!isValidEmail(params.account_email)) {
                response = BAD_REQUEST_API_RESPONSE
                response.message = "Error. Invalid email format."
                return res.status(response.status_code).json(response)
            }
            updateData.account_email = sanitize(params.account_email)
        }

        if(params.account_contact) {
            updateData.account_contact = sanitize(params.account_contact)
        }

        if(params.account_address_1) {
            updateData.account_address_1 = sanitize(params.account_address_1)
        }

        if(params.account_address_2) {
            updateData.account_address_2 = sanitize(params.account_address_2)
        }

        if(params.account_address_3) {
            updateData.account_address_3 = sanitize(params.account_address_3)
        }

        if(params.account_address_postcode) {
            updateData.account_address_postcode = sanitize(params.account_address_postcode)
        }

        if(params.account_address_city) {
            updateData.account_address_city = sanitize(params.account_address_city)
        }

        if(params.account_address_state) {
            updateData.account_address_state = sanitize(params.account_address_state)
        }

        if(params.account_profile_image) {
            updateData.account_profile_image = sanitize(params.account_profile_image)
        }

        // Check if there's anything to update
        if(Object.keys(updateData).length === 0) {
            response = BAD_REQUEST_API_RESPONSE
            response.message = "Error. No valid fields to update."
            return res.status(response.status_code).json(response)
        }

        const result = await AdminUpdateUserProfile(account_id, updateData)

        if(!result.status) {
            response = INTERNAL_SERVER_ERROR_API_RESPONSE
            response.message = "Error. Failed to update user profile."
            return res.status(response.status_code).json(response)
        }

        response = SUCCESS_API_RESPONSE
        response.message = "User profile updated successfully."
        response.data = { account_id: parseInt(account_id), updated_fields: Object.keys(updateData) }

        res.status(response.status_code).json(response)

    } catch (error) {
        console.log("Error Admin Update User: ", error)
        response = INTERNAL_SERVER_ERROR_API_RESPONSE
        response.message = "Error. An error occurred while updating user profile."
        res.status(response.status_code).json(response)
    }
})

module.exports = router
