/**
 * NotificationService.js
 * 
 * Centralized push notification + in-app notification service.
 * Every call to sendUserNotification / broadcastNotification will:
 *   1. Fetch active FCM tokens for the target account(s)
 *   2. Queue a pushMultiple job to the notification Bull queue
 *   3. Insert a record into account_notification for in-app sync
 * 
 * Usage:
 *   const NotificationService = require('../services/NotificationService');
 *   await NotificationService.sendUserNotification(account_id, title, body, data);
 *   await NotificationService.broadcastNotification(title, body, data);
 */

const db     = require('../utils/sqlbuilder');
const queues = require('../queue');
const { UserNotificationCreate } = require('../models/AppModel/Notification');

// Maximum tokens per FCM multicast batch
const FCM_BATCH_SIZE = 500;

/**
 * Fetch all active, FCM-enabled device tokens for an account.
 * @param {number} account_id
 * @returns {string[]} Array of FCM token strings
 */
async function getActiveTokens(account_id) {
    const sql = `
        SELECT device_fcm_token
        FROM account_device
        WHERE account_id = ?
        AND device_status  = 'Active'
        AND device_enable_fcm = 'Yes'
        AND device_fcm_token IS NOT NULL
        AND device_fcm_token != ''
    `;
    const rows = await db.raw(sql, [account_id]);
    return rows.map(r => r.device_fcm_token);
}

/**
 * Send a push notification + in-app notification to a single user.
 * Safe to call fire-and-forget (errors are caught internally).
 *
 * @param {number} account_id        - Target user account ID
 * @param {string} title             - Notification title
 * @param {string} body              - Notification body text
 * @param {object} data              - Optional key-value data payload for the app
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function sendUserNotification(account_id, title, body, data = {}) {
    try {
        // Stringify all data values — FCM data payload must be string:string
        const safeData = Object.fromEntries(
            Object.entries({ ...data, account_id: String(account_id) }).map(([k, v]) => [k, String(v)])
        );

        // 1. Queue FCM push if the user has active devices
        const tokens = await getActiveTokens(account_id);
        if (tokens.length > 0) {
            await queues.notification.add('pushMultiple', {
                tokens,
                title,
                body,
                data: safeData
            }, { attempts: 3, backoff: { type: 'exponential', delay: 5000 } });
        }

        // 2. Always persist in-app notification
        await UserNotificationCreate({
            account_id,
            notification_title: title,
            notification_description: body,
            read_status:    'No',
            archive_status: 'No',
            status:         'Active'
        });

        return { success: true };
    } catch (error) {
        console.error('[NotificationService] sendUserNotification error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Broadcast a push notification + in-app notification to ALL active users
 * who have at least one FCM-enabled device. Used for system-wide announcements
 * such as new tax relief categories published by LHDN.
 *
 * @param {string} title  - Notification title
 * @param {string} body   - Notification body text
 * @param {object} data   - Optional key-value data payload
 * @returns {Promise<{success: boolean, total_accounts: number, total_tokens: number, error?: string}>}
 */
async function broadcastNotification(title, body, data = {}) {
    try {
        // Fetch all distinct active accounts that have FCM-enabled devices
        const sql = `
            SELECT ad.account_id, ad.device_fcm_token
            FROM account_device ad
            INNER JOIN account a ON ad.account_id = a.account_id
            WHERE ad.device_status    = 'Active'
            AND ad.device_enable_fcm = 'Yes'
            AND ad.device_fcm_token IS NOT NULL
            AND ad.device_fcm_token != ''
            AND a.status = 'Active'
        `;
        const devices = await db.raw(sql);

        if (devices.length === 0) {
            console.log('[NotificationService] broadcastNotification: No active devices found.');
            return { success: true, total_accounts: 0, total_tokens: 0 };
        }

        const allTokens  = devices.map(d => d.device_fcm_token);
        const accountIds = [...new Set(devices.map(d => d.account_id))];

        const safeData = Object.fromEntries(
            Object.entries(data).map(([k, v]) => [k, String(v)])
        );

        // 1. Queue FCM push in batches of FCM_BATCH_SIZE
        for (let i = 0; i < allTokens.length; i += FCM_BATCH_SIZE) {
            const batch = allTokens.slice(i, i + FCM_BATCH_SIZE);
            await queues.notification.add('pushMultiple', {
                tokens: batch,
                title,
                body,
                data: safeData
            }, { attempts: 3, backoff: { type: 'exponential', delay: 5000 } });
        }

        // 2. Persist in-app notification for every account
        for (const account_id of accountIds) {
            try {
                await UserNotificationCreate({
                    account_id,
                    notification_title:       title,
                    notification_description: body,
                    read_status:    'No',
                    archive_status: 'No',
                    status:         'Active'
                });
            } catch (e) {
                // Don't abort the whole broadcast for a single account failure
                console.error(`[NotificationService] broadcastNotification: failed to create in-app notification for account ${account_id}`, e.message);
            }
        }

        console.log(`[NotificationService] broadcastNotification: queued for ${accountIds.length} accounts / ${allTokens.length} tokens.`);
        return { success: true, total_accounts: accountIds.length, total_tokens: allTokens.length };

    } catch (error) {
        console.error('[NotificationService] broadcastNotification error:', error);
        return { success: false, error: error.message };
    }
}

module.exports = {
    sendUserNotification,
    broadcastNotification
};
