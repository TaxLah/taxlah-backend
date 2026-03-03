/**
 * Change Password Controller
 * Allows authenticated user to change their password
 * 
 * PUT /api/profile/change-password
 * 
 * @author TaxLah Development Team
 * @date 2026-03-04
 */

const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const { 
    DEFAULT_API_RESPONSE, 
    INTERNAL_SERVER_ERROR_API_RESPONSE,
    UNAUTHORIZED_API_RESPONSE,
    BAD_REQUEST_API_RESPONSE,
    SUCCESS_API_RESPONSE,
    FORBIDDEN_API_RESPONSE,
    ERROR_UNAUTHENTICATED,
    CHECK_EMPTY,
    CREATE_ACCESS_TOKEN,
    CREATE_REFRESH_TOKEN
} = require('../../../configs/helper');
const { AuthUpdateAccessAccount, AuthCheckExistingUsername, AuthLogin } = require('../../../models/AppModel/Auth');
const { AccountGetInfo } = require('../../../models/AppModel/Account');
const moment = require('moment');
const { UserNotificationCreate } = require('../../../models/AppModel/Notification');

/**
 * PUT /api/profile/change-password
 * Change user password
 * 
 * Body:
 * {
 *   current_password: "oldpassword123",
 *   new_password: "newpassword456",
 *   confirm_password: "newpassword456"
 * }
 */
router.put('/', async (req, res) => {
    let response = DEFAULT_API_RESPONSE;
    let user = req.user || null;

    if (CHECK_EMPTY(user)) {
        response = UNAUTHORIZED_API_RESPONSE;
        response.message = ERROR_UNAUTHENTICATED;
        return res.status(response.status_code).json(response);
    }

    try {
        const params = req.body;
        const current_password = params.current_password;
        const new_password = params.new_password;
        const confirm_password = params.confirm_password;

        console.log('[ChangePassword] Request:', { 
            auth_id: user.uid,
            account_id: user.aid 
        });

        // Validation
        if (CHECK_EMPTY(current_password)) {
            response = BAD_REQUEST_API_RESPONSE;
            response.message = 'Current password is required';
            return res.status(response.status_code).json(response);
        }

        if (CHECK_EMPTY(new_password)) {
            response = BAD_REQUEST_API_RESPONSE;
            response.message = 'New password is required';
            return res.status(response.status_code).json(response);
        }

        if (CHECK_EMPTY(confirm_password)) {
            response = BAD_REQUEST_API_RESPONSE;
            response.message = 'Password confirmation is required';
            return res.status(response.status_code).json(response);
        }

        // Check if new password matches confirmation
        if (new_password !== confirm_password) {
            response = BAD_REQUEST_API_RESPONSE;
            response.message = 'New password and confirmation do not match';
            return res.status(response.status_code).json(response);
        }

        // Validate new password strength (minimum 8 characters)
        if (new_password.length < 8) {
            response = BAD_REQUEST_API_RESPONSE;
            response.message = 'New password must be at least 8 characters long';
            return res.status(response.status_code).json(response);
        }

        // Check if new password is same as current password
        if (current_password === new_password) {
            response = BAD_REQUEST_API_RESPONSE;
            response.message = 'New password must be different from current password';
            return res.status(response.status_code).json(response);
        }

        // Get user's current password from database
        const authData = await AuthLogin(user.uid);
        
        if (!authData.status || !authData.data) {
            response = INTERNAL_SERVER_ERROR_API_RESPONSE;
            response.message = 'Failed to retrieve user authentication data';
            return res.status(response.status_code).json(response);
        }

        // Verify current password
        const isCurrentPasswordValid = await bcrypt.compare(current_password, authData.data.auth_password);

        if (!isCurrentPasswordValid) {
            response = FORBIDDEN_API_RESPONSE;
            response.message = 'Current password is incorrect';
            return res.status(response.status_code).json(response);
        }

        // Hash new password
        const hashedNewPassword = await bcrypt.hash(new_password, 15);

        // Update password in database
        const updateData = {
            auth_id: user.uid,
            auth_password: hashedNewPassword
        };

        const updateResult = await AuthUpdateAccessAccount(updateData);

        if (!updateResult.status) {
            response = INTERNAL_SERVER_ERROR_API_RESPONSE;
            response.message = 'Failed to update password';
            return res.status(response.status_code).json(response);
        }

        // Get updated user profile
        const auth = await AuthCheckExistingUsername(user.username);
        const userProfile = await AccountGetInfo(user.aid);
        
        const profile = {
            uid: auth.data.auth_id,
            aid: auth.data.account_id,
            username: auth.data.auth_username,
            usermail: auth.data.auth_usermail,
            ...userProfile.data
        };

        // Generate new tokens
        const access_token = await CREATE_ACCESS_TOKEN(profile);
        const refresh_token = await CREATE_REFRESH_TOKEN(profile);

        // Create notification
        const fcm_title = 'Password Changed Successfully';
        const fcm_text = `Your password has been successfully changed at ${moment().format('DD MMM YYYY, hh:mm A')}. If you did not make this change, please contact support immediately.`;
        
        await UserNotificationCreate({
            account_id: user.aid,
            notification_title: fcm_title,
            notification_description: fcm_text,
            read_status: 'No',
            archive_status: 'No',
            status: 'Active'
        });

        // Success response
        response = SUCCESS_API_RESPONSE;
        response.message = 'Password changed successfully';
        response.data = {
            profile: profile,
            access_token,
            refresh_token
        };

        console.log('[ChangePassword] Success:', {
            auth_id: user.uid,
            account_id: user.aid
        });

        return res.status(response.status_code).json(response);

    } catch (error) {
        console.error('[ChangePassword] Error:', error);
        response = INTERNAL_SERVER_ERROR_API_RESPONSE;
        response.message = 'An error occurred while changing password';
        response.data = { error: error.message };
        return res.status(response.status_code).json(response);
    }
});

module.exports = router;
