const dbcon = require('../../../utils/sqlbuilder');

/**
 * App Version Model
 * Handles mobile app version management and force update logic
 */
const AppVersionModel = {
    /**
     * Normalize version string to X.Y.Z format
     * Converts "1" to "1.0.0", "1.0" to "1.0.0", etc.
     * @param {string} version - Version string
     * @returns {string} Normalized version
     */
    normalizeVersion: (version) => {
        const parts = version.split('.');
        
        // Ensure we have 3 parts (major.minor.patch)
        while (parts.length < 3) {
            parts.push('0');
        }
        
        // Take only first 3 parts and ensure they're numbers
        return parts.slice(0, 3)
            .map(part => parseInt(part) || 0)
            .join('.');
    },
    /**
     * Check if app version needs update
     * @param {string} currentVersion - Current app version (e.g., "1.0.0")
     * @param {string} platform - Platform: "iOS" or "Android"
     * @returns {object} Update information
     */
    checkVersion: async (currentVersion, platform) => {
        try {
            // Get active version config for the platform
            const versionConfig = await dbcon.raw(`
                SELECT 
                    version_id,
                    platform,
                    version_number,
                    build_number,
                    minimum_required_version,
                    is_force_update,
                    update_title,
                    update_message,
                    release_notes,
                    ios_download_url,
                    android_download_url
                FROM app_version
                WHERE (platform = ? OR platform = 'Both')
                AND is_active = 1
                ORDER BY version_id DESC
                LIMIT 1
            `, [platform]);

            if (!versionConfig || versionConfig.length === 0) {
                return {
                    success: false,
                    message: 'Konfigurasi versi tidak dijumpai'
                };
            }

            const config = versionConfig[0];
            const latestVersion = config.version_number;
            const minimumVersion = config.minimum_required_version;

            // Normalize versions before comparison
            const normalizedCurrent = AppVersionModel.normalizeVersion(currentVersion);
            const normalizedLatest = AppVersionModel.normalizeVersion(latestVersion);
            const normalizedMinimum = AppVersionModel.normalizeVersion(minimumVersion);

            // Compare versions
            const isUpdateAvailable = AppVersionModel.compareVersions(normalizedCurrent, normalizedLatest) < 0;
            const isForceUpdate = AppVersionModel.compareVersions(normalizedCurrent, normalizedMinimum) < 0;

            // Get appropriate download URL
            const downloadUrl = platform === 'iOS' 
                ? config.ios_download_url 
                : config.android_download_url;

            return {
                success: true,
                data: {
                    need_update: isUpdateAvailable,
                    force_update: isForceUpdate || config.is_force_update === 1,
                    current_version: currentVersion,
                    latest_version: latestVersion,
                    minimum_required_version: minimumVersion,
                    platform: platform,
                    update_title: config.update_title,
                    update_message: config.update_message,
                    release_notes: config.release_notes,
                    download_url: downloadUrl,
                    // UI hints
                    can_skip: !isForceUpdate && config.is_force_update === 0,
                    show_later_button: !isForceUpdate && config.is_force_update === 0
                }
            };

        } catch (error) {
            console.error('Error checking app version:', error);
            return {
                success: false,
                message: 'Ralat semasa memeriksa versi aplikasi',
                error: error.message
            };
        }
    },

    /**
     * Compare two version strings
     * Handles versions like "1.0", "1.0.0", "1", etc.
     * @param {string} v1 - Version 1 (e.g., "1.0.0" or "1.0")
     * @param {string} v2 - Version 2 (e.g., "1.2.0" or "1.2")
     * @returns {number} -1 if v1 < v2, 0 if equal, 1 if v1 > v2
     */
    compareVersions: (v1, v2) => {
        // Normalize both versions first
        const normalized1 = AppVersionModel.normalizeVersion(v1);
        const normalized2 = AppVersionModel.normalizeVersion(v2);
        
        const parts1 = normalized1.split('.').map(Number);
        const parts2 = normalized2.split('.').map(Number);
        
        for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
            const part1 = parts1[i] || 0;
            const part2 = parts2[i] || 0;
            
            if (part1 < part2) return -1;
            if (part1 > part2) return 1;
        }
        
        return 0;
    },

    /**
     * Get all version configurations (Admin)
     */
    getAllVersions: async (filters = {}, offset = 0, limit = 20) => {
        try {
            let whereClause = [];
            let params = [];

            if (filters.platform) {
                whereClause.push('platform = ?');
                params.push(filters.platform);
            }

            if (filters.is_active !== undefined) {
                whereClause.push('is_active = ?');
                params.push(filters.is_active);
            }

            const whereSQL = whereClause.length > 0 ? `WHERE ${whereClause.join(' AND ')}` : '';

            const versions = await dbcon.raw(`
                SELECT 
                    version_id,
                    platform,
                    version_number,
                    build_number,
                    minimum_required_version,
                    is_force_update,
                    is_active,
                    update_title,
                    update_message,
                    release_notes,
                    ios_download_url,
                    android_download_url,
                    created_at,
                    last_modified
                FROM app_version
                ${whereSQL}
                ORDER BY created_at DESC
                LIMIT ? OFFSET ?
            `, [...params, limit, offset]);

            const countResult = await dbcon.raw(`
                SELECT COUNT(*) as total
                FROM app_version
                ${whereSQL}
            `, params);

            return {
                success: true,
                data: versions,
                pagination: {
                    total: countResult[0].total,
                    offset: offset,
                    limit: limit
                }
            };

        } catch (error) {
            console.error('Error getting all versions:', error);
            return {
                success: false,
                message: 'Ralat semasa mendapatkan senarai versi',
                error: error.message
            };
        }
    },

    /**
     * Get version by ID (Admin)
     */
    getVersionById: async (versionId) => {
        try {
            const version = await dbcon.raw(`
                SELECT * FROM app_version WHERE version_id = ?
            `, [versionId]);

            if (!version || version.length === 0) {
                return {
                    success: false,
                    message: 'Versi tidak dijumpai'
                };
            }

            return {
                success: true,
                data: version[0]
            };

        } catch (error) {
            console.error('Error getting version by ID:', error);
            return {
                success: false,
                message: 'Ralat semasa mendapatkan maklumat versi',
                error: error.message
            };
        }
    },

    /**
     * Create new version configuration (Admin)
     */
    createVersion: async (versionData) => {
        try {
            const result = await dbcon.insert('app_version', versionData);

            return {
                success: true,
                message: 'Konfigurasi versi berjaya dibuat',
                data: {
                    version_id: result.insertId
                }
            };

        } catch (error) {
            console.error('Error creating version:', error);
            return {
                success: false,
                message: 'Ralat semasa membuat konfigurasi versi',
                error: error.message
            };
        }
    },

    /**
     * Update version configuration (Admin)
     */
    updateVersion: async (versionId, updateData) => {
        try {
            updateData.last_modified = new Date();
            
            const result = await dbcon.update(
                'app_version',
                updateData,
                { version_id: versionId }
            );

            if (result === 0) {
                return {
                    success: false,
                    message: 'Versi tidak dijumpai'
                };
            }

            return {
                success: true,
                message: 'Konfigurasi versi berjaya dikemaskini'
            };

        } catch (error) {
            console.error('Error updating version:', error);
            return {
                success: false,
                message: 'Ralat semasa mengemaskini konfigurasi versi',
                error: error.message
            };
        }
    },

    /**
     * Delete version configuration (Admin)
     */
    deleteVersion: async (versionId) => {
        try {
            const result = await dbcon.delete('app_version', { version_id: versionId });

            if (result === 0) {
                return {
                    success: false,
                    message: 'Versi tidak dijumpai'
                };
            }

            return {
                success: true,
                message: 'Konfigurasi versi berjaya dipadam'
            };

        } catch (error) {
            console.error('Error deleting version:', error);
            return {
                success: false,
                message: 'Ralat semasa memadam konfigurasi versi',
                error: error.message
            };
        }
    },

    /**
     * Set version as active/inactive (Admin)
     */
    toggleVersionStatus: async (versionId, isActive) => {
        try {
            const result = await dbcon.update(
                'app_version',
                { is_active: isActive ? 1 : 0, last_modified: new Date() },
                { version_id: versionId }
            );

            if (result === 0) {
                return {
                    success: false,
                    message: 'Versi tidak dijumpai'
                };
            }

            return {
                success: true,
                message: `Versi berjaya ${isActive ? 'diaktifkan' : 'dinyahaktifkan'}`
            };

        } catch (error) {
            console.error('Error toggling version status:', error);
            return {
                success: false,
                message: 'Ralat semasa mengubah status versi',
                error: error.message
            };
        }
    }
};

module.exports = AppVersionModel;