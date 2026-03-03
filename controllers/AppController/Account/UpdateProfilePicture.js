/**
 * Update Profile Picture Controller
 * Upload and update user's profile picture
 * 
 * PUT /api/profile/picture
 * 
 * @author TaxLah Development Team
 * @date 2026-03-04
 */

const express = require('express');
const router = express.Router();
const { upload, getFileUrl } = require('../../../configs/fileUpload');
const { 
    DEFAULT_API_RESPONSE, 
    INTERNAL_SERVER_ERROR_API_RESPONSE,
    UNAUTHORIZED_API_RESPONSE,
    BAD_REQUEST_API_RESPONSE,
    SUCCESS_API_RESPONSE,
    ERROR_UNAUTHENTICATED,
    CHECK_EMPTY,
    CREATE_ACCESS_TOKEN,
    CREATE_REFRESH_TOKEN
} = require('../../../configs/helper');
const { AccountUpdate, AccountGetInfo } = require('../../../models/AppModel/Account');
const { AuthCheckExistingUsername } = require('../../../models/AppModel/Auth');
const moment = require('moment');
const { UserNotificationCreate } = require('../../../models/AppModel/Notification');

/**
 * PUT /api/profile/picture
 * Upload profile picture
 * 
 * Body (multipart/form-data):
 * - profile_picture: File (image only - jpeg, jpg, png, gif, webp)
 */
router.put('/', upload.single('profile_picture'), async (req, res) => {
    let response = DEFAULT_API_RESPONSE;
    let user = req.user || null;

    if (CHECK_EMPTY(user)) {
        response = UNAUTHORIZED_API_RESPONSE;
        response.message = ERROR_UNAUTHENTICATED;
        return res.status(response.status_code).json(response);
    }

    try {
        // Check if file was uploaded
        if (!req.file) {
            response = BAD_REQUEST_API_RESPONSE;
            response.message = 'Profile picture file is required';
            return res.status(response.status_code).json(response);
        }

        // Validate file type is image
        const allowedImageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'image/heif'];
        if (!allowedImageTypes.includes(req.file.mimetype)) {
            response = BAD_REQUEST_API_RESPONSE;
            response.message = 'Invalid file type. Only images are allowed (JPEG, PNG, GIF, WEBP, HEIC)';
            return res.status(response.status_code).json(response);
        }

        const account_id = user.account_id;
        
        // Get file URL
        const profileImageUrl = getFileUrl(req.file.path);

        console.log('[UpdateProfilePicture] Uploading:', {
            account_id,
            filename: req.file.filename,
            size: req.file.size,
            url: profileImageUrl
        });

        // Update profile picture in database
        const updateData = {
            account_id: account_id,
            account_profile_image: profileImageUrl
        };

        const updateResult = await AccountUpdate(updateData);

        if (!updateResult.status) {
            response = INTERNAL_SERVER_ERROR_API_RESPONSE;
            response.message = 'Failed to update profile picture';
            return res.status(response.status_code).json(response);
        }

        // Get updated user profile
        const auth = await AuthCheckExistingUsername(user.username);
        const userProfile = await AccountGetInfo(account_id);
        
        const profile = {
            uid: auth.data.auth_id,
            aid: auth.data.account_id,
            username: auth.data.auth_username,
            usermail: auth.data.auth_usermail,
            ...userProfile.data
        };

        // Generate new tokens with updated profile
        const access_token = await CREATE_ACCESS_TOKEN(profile);
        const refresh_token = await CREATE_REFRESH_TOKEN(profile);

        // Create notification
        const fcm_title = 'Profile Picture Updated';
        const fcm_text = `You've successfully updated your profile picture at ${moment().format('DD MMM YYYY, hh:mm A')}.`;
        
        await UserNotificationCreate({
            account_id: account_id,
            notification_title: fcm_title,
            notification_description: fcm_text,
            read_status: 'No',
            archive_status: 'No',
            status: 'Active'
        });

        // Success response
        response = SUCCESS_API_RESPONSE;
        response.message = 'Profile picture updated successfully';
        response.data = {
            profile: profile,
            profile_picture_url: profileImageUrl,
            access_token,
            refresh_token
        };

        console.log('[UpdateProfilePicture] Success:', {
            account_id,
            profile_picture_url: profileImageUrl
        });

        return res.status(response.status_code).json(response);

    } catch (error) {
        console.error('[UpdateProfilePicture] Error:', error);
        response = INTERNAL_SERVER_ERROR_API_RESPONSE;
        response.message = 'An error occurred while updating profile picture';
        response.data = { error: error.message };
        return res.status(response.status_code).json(response);
    }
});

module.exports = router;
