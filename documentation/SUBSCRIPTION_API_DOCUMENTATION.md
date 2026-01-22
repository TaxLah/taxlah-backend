# Subscription API Documentation

## Overview
APIs for managing user subscriptions including viewing packages, subscribing, cancelling, and managing payments.

**Base URL:** `/api/subscription`

---

## Endpoints

### 1. Get Subscription Packages

Get all available subscription packages.

**Endpoint:** `GET /api/subscription/packages`

**Authentication:** Not required

**Response:**
```json
{
  "status": true,
  "status_code": 200,
  "message": "Subscription packages retrieved successfully.",
  "data": [
    {
      "sub_package_id": 1,
      "package_code": "PRO",
      "package_name": "Package Pro",
      "package_description": "Perfect for regular users with unlimited access",
      "billing_period": "Monthly",
      "price_amount": 14.90,
      "currency": "MYR",
      "features": [
        "Unlimited receipt uploads",
        "AI-powered auto-categorization",
        "Secure cloud storage",
        "Unlimited report generation",
        "Real-time expense dashboard",
        "LHDN-compliant reports",
        "Cancel anytime"
      ],
      "max_receipts": null,
      "max_reports": null,
      "storage_limit_mb": null,
      "package_badge": "MONTHLY",
      "package_color": "#17a2b8",
      "is_featured": "No",
      "sort_order": 1,
      "trial_days": 0
    },
    {
      "sub_package_id": 2,
      "package_code": "PREMIUM",
      "package_name": "Package Premium",
      "package_description": "Best value with yearly savings and exclusive benefits",
      "billing_period": "Yearly",
      "price_amount": 99.00,
      "currency": "MYR",
      "features": [
        "Everything in Monthly plan",
        "Save RM 79.80 per year",
        "Priority customer support",
        "Early access to new features",
        "Exclusive tax tips & guides",
        "Annual tax planning consultation"
      ],
      "package_badge": "BEST VALUE",
      "package_color": "#28a745",
      "is_featured": "Yes",
      "trial_days": 7
    }
  ]
}
```

---

### 2. Get Package Details

Get details of a specific subscription package.

**Endpoint:** `GET /api/subscription/packages/:packageId`

**Authentication:** Not required

**Parameters:**
- `packageId` (path parameter) - Package ID

**Response:**
```json
{
  "status": true,
  "status_code": 200,
  "message": "Package details retrieved successfully.",
  "data": {
    "sub_package_id": 1,
    "package_code": "PRO",
    "package_name": "Package Pro",
    "billing_period": "Monthly",
    "price_amount": 14.90,
    "features": [...]
  }
}
```

---

### 3. Get My Subscription

Get user's current active subscription.

**Endpoint:** `GET /api/subscription/my-subscription`

**Authentication:** Required

**Headers:**
```
Authorization: Bearer <access_token>
```

**Response:**
```json
{
  "status": true,
  "status_code": 200,
  "message": "Active subscription found.",
  "has_subscription": true,
  "data": {
    "subscription_id": 1,
    "subscription_ref": "SUB-1705234567-ABC123DE",
    "account_id": 2,
    "sub_package_id": 1,
    "billing_period": "Monthly",
    "price_amount": 14.90,
    "start_date": "2026-01-14T08:30:00.000Z",
    "current_period_start": "2026-01-14T08:30:00.000Z",
    "current_period_end": "2026-02-14T08:30:00.000Z",
    "next_billing_date": "2026-02-14T08:30:00.000Z",
    "trial_end_date": null,
    "status": "Active",
    "auto_renew": "Yes",
    "payment_method": "ToyyibPay",
    "cancel_at_period_end": "No",
    "cancelled_at": null,
    "package_name": "Package Pro",
    "package_code": "PRO",
    "package_description": "Perfect for regular users",
    "features": [...],
    "package_badge": "MONTHLY",
    "package_color": "#17a2b8"
  }
}
```

**No Subscription Response:**
```json
{
  "status": true,
  "status_code": 200,
  "message": "No active subscription.",
  "has_subscription": false,
  "data": null
}
```

---

### 4. Check Subscription Access

Check if user has active subscription and available features.

**Endpoint:** `GET /api/subscription/check-access`

**Authentication:** Required

**Response:**
```json
{
  "status": true,
  "status_code": 200,
  "message": "Subscription access checked successfully.",
  "data": {
    "success": true,
    "has_access": true,
    "subscription_status": "Active",
    "package_name": "Package Pro",
    "current_period_end": "2026-02-14T08:30:00.000Z",
    "features": {
      "unlimited_receipts": true,
      "unlimited_reports": true,
      "ai_categorization": true,
      "cloud_storage": true,
      "priority_support": false
    }
  }
}
```

---

### 5. Subscribe to Package

Subscribe to a package.

**Endpoint:** `POST /api/subscription/subscribe`

**Authentication:** Required

**Request Body:**
```json
{
  "package_id": 1,
  "payment_method": "ToyyibPay"
}
```

**Response (Requires Payment):**
```json
{
  "status": true,
  "status_code": 200,
  "message": "Subscription created. Please complete payment.",
  "data": {
    "subscription_id": 1,
    "subscription_ref": "SUB-1705234567-ABC123DE",
    "status": "Active",
    "payment_url": "https://gate.chip-in.asia/pay/xyz123",
    "payment_ref": "SUBPAY-1705234567-XYZ789AB"
  }
}
```

**Response (Trial Period):**
```json
{
  "status": true,
  "status_code": 200,
  "message": "Subscription activated with trial period.",
  "data": {
    "subscription_id": 1,
    "subscription_ref": "SUB-1705234567-ABC123DE",
    "status": "Trial",
    "trial_end_date": "2026-01-21T08:30:00.000Z",
    "current_period_end": "2026-02-14T08:30:00.000Z"
  }
}
```

**Error Response:**
```json
{
  "status": false,
  "status_code": 400,
  "message": "User already has an active subscription",
  "data": null
}
```

---

### 6. Cancel Subscription

Cancel user's subscription.

**Endpoint:** `POST /api/subscription/cancel`

**Authentication:** Required

**Request Body:**
```json
{
  "cancel_at_period_end": true,
  "reason": "Too expensive"
}
```

**Parameters:**
- `cancel_at_period_end` (boolean, optional) - Default: true. If true, user can continue using until period end. If false, cancel immediately.
- `reason` (string, optional) - Cancellation reason

**Response (Cancel at Period End):**
```json
{
  "status": true,
  "status_code": 200,
  "message": "Subscription will be cancelled at the end of the current period",
  "data": {
    "subscription_id": 1,
    "ends_at": "2026-02-14T08:30:00.000Z",
    "cancel_at_period_end": true
  }
}
```

**Response (Cancel Immediately):**
```json
{
  "status": true,
  "status_code": 200,
  "message": "Subscription cancelled immediately",
  "data": {
    "subscription_id": 1,
    "cancelled_at": "2026-01-14T10:30:00.000Z",
    "cancel_at_period_end": false
  }
}
```

---

### 7. Resume Subscription

Resume a cancelled subscription (before period end).

**Endpoint:** `POST /api/subscription/resume`

**Authentication:** Required

**Response:**
```json
{
  "status": true,
  "status_code": 200,
  "message": "Subscription resumed successfully",
  "data": {
    "subscription_id": 1,
    "auto_renew": true
  }
}
```

**Error Response:**
```json
{
  "status": false,
  "status_code": 400,
  "message": "Subscription is not set to cancel",
  "data": null
}
```

---

### 8. Renew Subscription

Renew an expired or expiring subscription.

**Endpoint:** `POST /api/subscription/renew`

**Authentication:** Required

**Request Body:**
```json
{
  "package_id": 1,
  "payment_method": "Chip"
}
```

**Parameters:**
- `package_id` (optional) - Package ID to renew with. If not provided, uses the same package from last subscription
- `payment_method` (optional) - Payment method (default: "Chip")

**Response:**
```json
{
  "status": true,
  "status_code": 200,
  "message": "Please complete payment to renew your subscription.",
  "data": {
    "package_name": "Package Pro",
    "package_code": "PRO",
    "billing_period": "Monthly",
    "amount": 14.90,
    "currency": "MYR",
    "period_start": "2026-01-22T10:30:00.000Z",
    "period_end": "2026-02-22T10:30:00.000Z",
    "payment_url": "https://gate.chip-in.asia/pay/xyz123",
    "payment_ref": "SUBPAY-1705934567-XYZ789AB"
  }
}
```

**Error Responses:**
```json
{
  "status": false,
  "status_code": 400,
  "message": "You have an active subscription. Cancel it first or wait until it expires to renew.",
  "data": null
}
```

```json
{
  "status": false,
  "status_code": 400,
  "message": "No previous subscription found. Please subscribe to a package first.",
  "data": null
}
```

**Notes:**
- Users can renew their expired subscriptions
- Users can renew if their subscription is cancelled and set to end at period end
- Can optionally change to a different package during renewal
- Payment must be completed to activate the renewed subscription
- Trial periods do not apply to renewals

---

### 9. Get Subscription History

Get user's subscription history.

**Endpoint:** `GET /api/subscription/history?limit=10`

**Authentication:** Required

**Query Parameters:**
- `limit` (optional) - Number of records to fetch (default: 10)

**Response:**
```json
{
  "status": true,
  "status_code": 200,
  "message": "Subscription history retrieved successfully.",
  "data": [
    {
      "subscription_id": 2,
      "subscription_ref": "SUB-1705234567-ABC123DE",
      "billing_period": "Monthly",
      "price_amount": 14.90,
      "start_date": "2025-12-14T08:30:00.000Z",
      "current_period_end": "2026-01-14T08:30:00.000Z",
      "status": "Expired",
      "cancelled_at": "2026-01-01T10:00:00.000Z",
      "ended_at": "2026-01-14T08:30:00.000Z",
      "package_name": "Package Pro",
      "package_code": "PRO"
    },
    {
      "subscription_id": 1,
      "subscription_ref": "SUB-1705134567-XYZ789AB",
      "billing_period": "Monthly",
      "price_amount": 14.90,
      "start_date": "2026-01-14T08:30:00.000Z",
      "current_period_end": "2026-02-14T08:30:00.000Z",
      "status": "Active",
      "cancelled_at": null,
      "ended_at": null,
      "package_name": "Package Pro",
      "package_code": "PRO"
    }
  ]
}
```

---

### 10. Get Subscription Events

Get user's subscription event history (changes, payments, etc.).

**Endpoint:** `GET /api/subscription/events?limit=20`

**Authentication:** Required

**Query Parameters:**
- `limit` (optional) - Number of records to fetch (default: 20)

**Response:**
```json
{
  "status": true,
  "status_code": 200,
  "message": "Subscription events retrieved successfully.",
  "data": [
    {
      "history_id": 5,
      "subscription_id": 1,
      "event_type": "Payment_Succeeded",
      "event_description": "Payment of MYR 14.90 completed successfully",
      "old_status": null,
      "new_status": "Active",
      "event_date": "2026-01-14T08:35:00.000Z"
    },
    {
      "history_id": 4,
      "subscription_id": 1,
      "event_type": "Created",
      "event_description": "Subscription created for Package Pro",
      "old_status": null,
      "new_status": "Active",
      "event_date": "2026-01-14T08:30:00.000Z"
    }
  ]
}
```

---

### 11. Get Payment History

Get user's subscription payment history.

**Endpoint:** `GET /api/subscription/payments?limit=10`

**Authentication:** Required

**Query Parameters:**
- `limit` (optional) - Number of records to fetch (default: 10)

**Response:**
```json
{
  "status": true,
  "status_code": 200,
  "message": "Payment history retrieved successfully.",
  "data": [
    {
      "payment_id": 1,
      "payment_ref": "SUBPAY-1705234567-XYZ789AB",
      "amount": 14.90,
      "currency": "MYR",
      "period_start": "2026-01-14T08:30:00.000Z",
      "period_end": "2026-02-14T08:30:00.000Z",
      "payment_gateway": "ToyyibPay",
      "payment_status": "Paid",
      "created_date": "2026-01-14T08:30:00.000Z",
      "paid_date": "2026-01-14T08:35:00.000Z",
      "subscription_ref": "SUB-1705234567-ABC123DE",
      "billing_period": "Monthly",
      "package_name": "Package Pro"
    }
  ]
}
```

---

### 12. Get Payment Details

Get specific payment details.

**Endpoint:** `GET /api/subscription/payment/:paymentRef`

**Authentication:** Required

**Parameters:**
- `paymentRef` (path parameter) - Payment reference

**Response:**
```json
{
  "status": true,
  "status_code": 200,
  "message": "Payment details retrieved successfully.",
  "data": {
    "payment_id": 1,
    "subscription_id": 1,
    "account_id": 2,
    "payment_ref": "SUBPAY-1705234567-XYZ789AB",
    "amount": 14.90,
    "currency": "MYR",
    "period_start": "2026-01-14T08:30:00.000Z",
    "period_end": "2026-02-14T08:30:00.000Z",
    "payment_gateway": "ToyyibPay",
    "gateway_transaction_id": "CHIP123456",
    "gateway_response": "{...}",
    "payment_status": "Paid",
    "created_date": "2026-01-14T08:30:00.000Z",
    "paid_date": "2026-01-14T08:35:00.000Z",
    "subscription_ref": "SUB-1705234567-ABC123DE",
    "billing_period": "Monthly",
    "package_name": "Package Pro",
    "package_code": "PRO"
  }
}
```

---

### 13. Payment Webhook

Webhook endpoint for payment gateway callbacks (CHIP).

**Endpoint:** `POST /api/subscription/webhook`

**Authentication:** Not required (verified via signature)

**Headers:**
```
x-signature: <webhook_signature>
Content-Type: application/json
```

**Request Body:** (From CHIP payment gateway)
```json
{
  "id": "purchase_xyz123",
  "event_type": "purchase.paid",
  "status": "paid",
  "is_paid": true,
  "purchase": {
    "total": 1490,
    "currency": "MYR"
  },
  "client": {
    "email": "user@example.com"
  }
}
```

**Response:**
```json
{
  "success": true
}
```

**Note:** This endpoint is called automatically by the payment gateway. Always returns 200 status to prevent retries.

---

## Subscription Status

Possible subscription statuses:
- **`Trial`** - User is in trial period
- **`Active`** - Subscription is active and paid
- **`Past_Due`** - Payment failed but in grace period
- **`Cancelled`** - User cancelled, but subscription ended
- **`Expired`** - Subscription period ended
- **`Suspended`** - Admin suspended the subscription

---

## Payment Status

Possible payment statuses:
- **`Pending`** - Payment initiated but not completed
- **`Processing`** - Payment being processed
- **`Paid`** - Payment successful
- **`Failed`** - Payment failed
- **`Refunded`** - Payment refunded
- **`Cancelled`** - Payment cancelled

---

## Error Codes

Common error responses:

### 400 Bad Request
```json
{
  "status": false,
  "status_code": 400,
  "message": "Invalid package ID.",
  "data": null
}
```

### 401 Unauthorized
```json
{
  "status": false,
  "status_code": 401,
  "message": "Invalid Token",
  "data": null
}
```

### 404 Not Found
```json
{
  "status": false,
  "status_code": 404,
  "message": "Package not found.",
  "data": null
}
```

### 500 Internal Server Error
```json
{
  "status": false,
  "status_code": 500,
  "message": "An error occurred while processing subscription.",
  "data": null
}
```

---

## Usage Flow

### Standard Subscription Flow:

1. **View Packages**: `GET /api/subscription/packages`
2. **Check Current Subscription**: `GET /api/subscription/my-subscription`
3. **Subscribe**: `POST /api/subscription/subscribe` with package_id
4. **Complete Payment**: User redirected to payment_url
5. **Payment Callback**: Webhook processes payment
6. **Check Access**: `GET /api/subscription/check-access` to verify features

### Renewal Flow:

1. **Check Subscription**: `GET /api/subscription/my-subscription` (shows expired or expiring)
2. **Renew Subscription**: `POST /api/subscription/renew` with optional package_id
3. **Complete Payment**: User redirected to payment_url
4. **Payment Callback**: Webhook processes payment and creates new subscription
5. **Subscription Activated**: User can access premium features again

### Cancel and Resume Flow:

1. **Cancel Subscription**: `POST /api/subscription/cancel` with cancel_at_period_end: true
2. **User Changes Mind**: `POST /api/subscription/resume` (before period ends)

---

## Notes

- All timestamps are in ISO 8601 format (UTC)
- Amounts are in MYR (Malaysian Ringgit)
- Trial periods (if available) are automatically applied on first subscription only, not on renewals
- Users can only have ONE active subscription at a time
- Renewals can be done with the same package or a different package
