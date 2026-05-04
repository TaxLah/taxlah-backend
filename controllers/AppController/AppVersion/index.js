const express = require('express');
const AppVersionModel = require('../../../models/AppModel/AppVersion');
const router = express.Router()

/**
 * GET /app-version/check
 * Check if app needs update (Public - no auth required)
 * Query params: version (string), platform (iOS|Android)
 */
router.get('/check', async (req, res) => {
    try {
        const { version, platform } = req.query;

        // Validate input
        if (!version || !platform) {
            return res.status(400).json({
                success: false,
                message: 'The version and platform parameters are required'
            });
        }

        // Validate platform
        if (!['iOS', 'Android'].includes(platform)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid platform. Use iOS or Android'
            });
        }

        // Validate version format (accepts 1, 1.0, or 1.0.0)
        const versionRegex = /^\d+(\.\d+)?(\.\d+)?$/;
        if (!versionRegex.test(version)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid version format. Use: X, X.Y, or X.Y.Z (e.g. 1, 1.0, or 1.0.0)'
            });
        }

        const result = await AppVersionModel.checkVersion(version, platform);

        if (!result.success) {
            // If no version config found, allow the app to continue (no update required)
            return res.status(200).json({
                success: true,
                data: {
                    need_update: false,
                    force_update: false,
                    current_version: version,
                    platform: platform,
                    message: 'Your current version is up to date'
                }
            });
        }

        return res.status(200).json(result);

    } catch (error) {
        console.error('Error checking app version:', error);
        return res.status(500).json({
            success: false,
            message: 'An error occurred while checking the app version',
            error: error.message
        });
    }
});

/**
 * GET /app-version/latest
 * Get latest version info (Public)
 * Query params: platform (iOS|Android)
 */
router.get('/latest', async (req, res) => {
    try {
        const { platform } = req.query;

        if (!platform || !['iOS', 'Android'].includes(platform)) {
            return res.status(400).json({
                success: false,
                message: 'The platform parameter is required (iOS or Android)'
            });
        }

        const result = await AppVersionModel.checkVersion('0.0.0', platform);

        if (!result.success) {
            return res.status(404).json({
                success: false,
                message: 'Version information not found'
            });
        }

        return res.status(200).json({
            success: true,
            data: {
                latest_version: result.data.latest_version,
                platform: platform,
                release_notes: result.data.release_notes,
                download_url: result.data.download_url
            }
        });

    } catch (error) {
        console.error('Error getting latest version:', error);
        return res.status(500).json({
            success: false,
            message: 'An error occurred while retrieving the latest version information',
            error: error.message
        });
    }
});

module.exports = router