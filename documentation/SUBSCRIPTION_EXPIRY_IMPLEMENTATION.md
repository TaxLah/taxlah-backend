# Subscription Expiry Implementation

## Overview
Implemented an automated system to handle expired subscriptions using Node.js cron jobs and Bull queue system.

## What Was Implemented

### 1. **Subscription Expiry Function** (`SubscriptionService.js`)
A new function `processExpiredSubscriptions()` that:
- ✅ Queries all subscriptions where:
  - Status = 'Active' AND `current_period_end` < NOW()
  - Status = 'Trial' AND `trial_end_date` < NOW()
- ✅ Updates subscription status to 'Expired'
- ✅ Sets `ended_at` timestamp
- ✅ Logs event in `subscription_history` table
- ✅ Resets `free_receipts_limit` back to default (50)
- ✅ Creates in-app notification
- ✅ Queues push notification (via FCM)
- ✅ Queues email notification
- ✅ Returns processing summary

### 2. **Cron Job Configuration** (`cronjob/index.js`)
- ✅ Added `"expire-subscriptions"` cron job
- ✅ Runs daily at 1:00 AM (Asia/Kuala_Lumpur timezone)
- ✅ Cron expression: `"0 1 * * *"`
- ✅ Automatically initialized on server start

### 3. **Test Endpoint** (`controllers/TestRouter/index.js`)
- ✅ Added `/api/test/expire-subscriptions` endpoint
- ✅ Allows manual triggering of expiration check
- ✅ Returns detailed processing results

## How It Works

### Daily Automated Process (1:00 AM)
```
1. Cron job triggers at 1:00 AM
2. Queries database for expired subscriptions
3. For each expired subscription:
   - Updates status to 'Expired'
   - Resets subscription benefits
   - Creates notification record
   - Queues push notification (Bull queue → Worker → FCM)
   - Queues email notification (Bull queue → Worker → SMTP)
4. Logs results to console
```

### Queue Processing Flow
```
Cron Job → SubscriptionService → Queue System → Worker → External Service
                                      ↓
                                  Bull Redis
                                      ↓
                        [Email Queue] [Notification Queue]
                                      ↓
                              Worker Processes
                                      ↓
                          [SMTP Server] [Firebase FCM]
```

## Files Modified

1. **models/AppModel/SubscriptionService.js**
   - Added `processExpiredSubscriptions()` function
   - Exported in module.exports

2. **cronjob/index.js**
   - Added `"expire-subscriptions"` cron job
   - Scheduled to run daily at 1:00 AM

3. **controllers/TestRouter/index.js**
   - Added `/api/test/expire-subscriptions` test endpoint

## Testing

### Manual Testing
```bash
# Test the expiry function manually
curl http://localhost:3000/api/test/expire-subscriptions
```

### Expected Response
```json
{
  "success": true,
  "message": "Subscription expiry check completed",
  "data": {
    "success": true,
    "message": "Processed 2 expired subscription(s)",
    "count": 2,
    "failed": 0,
    "total": 2
  }
}
```

### What Happens to Expired Users
1. **Database Changes:**
   - `account_subscription.status` → 'Expired'
   - `account_subscription.ended_at` → current timestamp
   - `account_credit.free_receipts_limit` → 50 (default)

2. **Notifications Sent:**
   - In-app notification created
   - Push notification sent to device
   - Email sent to user

3. **Notification Content:**
   - **Trial Expired:** "⏰ Trial Period Ended - Your [Package] trial period has ended..."
   - **Subscription Expired:** "⏰ Subscription Expired - Your [Package] subscription has expired..."

## Cron Schedule Reference

```javascript
// Current schedule: Daily at 1:00 AM
"0 1 * * *"

// Other common schedules:
"0 */6 * * *"    // Every 6 hours
"0 0 * * *"      // Daily at midnight
"0 2 * * 0"      // Every Sunday at 2 AM
"*/30 * * * *"   // Every 30 minutes
```

## Error Handling

- ✅ Try-catch blocks for each subscription
- ✅ Failed subscriptions logged but don't stop the process
- ✅ Continues processing remaining subscriptions on error
- ✅ Returns summary with success/failed counts
- ✅ Detailed error logging to console

## Monitoring

### Check Cron Job Status
```javascript
const { scheduler } = require('./cronjob/index.js');

// List all scheduled tasks
console.log(scheduler.list());

// Stop expiry job
scheduler.stop('expire-subscriptions');

// Start expiry job
scheduler.start('expire-subscriptions');
```

### Console Logs
```
[Cron] Running task: expire-subscriptions
[SubscriptionService] Starting expired subscriptions check...
[SubscriptionService] Found 2 expired subscription(s)
[SubscriptionService] Reset free_receipts_limit for account 5
[SubscriptionService] Processed expired subscription SUB-1234... for account 5
[SubscriptionService] Expired subscriptions processing completed: {...}
[Cron] Task "expire-subscriptions" completed
```

## Database Query (For Manual Check)
```sql
-- Check subscriptions that should be expired
SELECT 
    s.subscription_id,
    s.subscription_ref,
    s.account_id,
    s.status,
    s.current_period_end,
    s.trial_end_date,
    a.account_email,
    pkg.package_name
FROM account_subscription s
JOIN account a ON s.account_id = a.account_id
JOIN subscription_package pkg ON s.sub_package_id = pkg.sub_package_id
WHERE (
    (s.status = 'Active' AND s.current_period_end < NOW())
    OR
    (s.status = 'Trial' AND s.trial_end_date < NOW())
)
AND s.status NOT IN ('Expired', 'Cancelled');
```

## Next Steps (Optional Enhancements)

1. **Grace Period:** Add 3-day grace period before expiring
2. **Reminder Notifications:** Send reminder 7 days before expiry
3. **Admin Dashboard:** Show expiry stats and logs
4. **Retry Logic:** Retry failed notification sends
5. **Webhook Integration:** Notify external systems of expiry

## Support

- **Cron Documentation:** [node-cron](https://www.npmjs.com/package/node-cron)
- **Queue Documentation:** [Bull](https://github.com/OptimalBits/bull)
- **Timezone:** Asia/Kuala_Lumpur (UTC+8)

---

**Implementation Date:** January 22, 2026  
**Version:** 1.0.0  
**Status:** ✅ Active
