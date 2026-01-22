const express = require('express')
const queues = require('../../queue')
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

module.exports = router