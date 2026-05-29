const express = require('express')
const queues = require('../../queue')
const { CHECK_EMPTY } = require('../../configs/helper')
const { sendUserNotification } = require('../../services/NotificationService')
const router = express.Router()

router.get('/cronjob', async (req, res) => {
    const users = ["user1", "user2", "user3", "user4", "user5", "user6"]

    for (const user of users) {
        console.log(`Cronjob executed for ${user} at ${new Date().toISOString()}`)

        if(user == 'user2') {
            await queues.default.add('General Queue', { user }, { priority: 1 } )
        } else {
            await queues.default.add('General Queue', { user }, { priority: 5 } )
        }
    }
    return res.json({ success: true, message: 'Cronjob tasks queued' })
})

// Test endpoint to manually trigger subscription expiry check
router.get('/expire-subscriptions', async (req, res) => {
    try {
        const SubscriptionService = require('../../models/AppModel/SubscriptionService');
        
        console.log('[Test] Manually triggering subscription expiry check...');
        const result = await SubscriptionService.processExpiredSubscriptions();
        
        return res.json({
            success: true,
            message: 'Subscription expiry check completed',
            data: result
        });
    } catch (error) {
        console.error('[Test] Subscription expiry check failed:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to check expired subscriptions',
            error: error.message
        });
    }
})

// Test endpoint to manually trigger expiry reminder notifications
router.get('/expiry-reminders', async (req, res) => {
    try {
        const SubscriptionService = require('../../models/AppModel/SubscriptionService');
        
        console.log('[Test] Manually triggering expiry reminders...');
        const result = await SubscriptionService.sendExpiryReminders();
        
        return res.json({
            success: true,
            message: 'Expiry reminders sent',
            data: result
        });
    } catch (error) {
        console.error('[Test] Expiry reminders failed:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to send expiry reminders',
            error: error.message
        });
    }
})

router.post("/send-notification", async(req, res) => {
    let notification_title  = req.body.notification_title || "Title Notification"
    let notification_body   = req.body.notification_body || "Body Notification"
    let account_id          = req.body.account_id || null

    try {

        if(CHECK_EMPTY(account_id)) {
            return res.status(400).json({
                status: 'Not ok',
                message: "Account not found."
            })
        }

        await sendUserNotification(account_id, notification_title, notification_body)

        return res.status(200).json({
            status: 'ok',
            message: 'Notification has been send'
        })
        
    } catch (e) {
        console.log("Error send notification to account >> ", e)
        return res.status(500).json({
            status: 'Not ok',
            message: "Server error. Unable to send notification."
        })
    }

    return res.status(200).json({
        status: 'ok',
        message: "Notification send."
    })
})

module.exports = router