# TaxLah Subscription API - Mobile Developer Guide

## 📱 Version 1.0 | Last Updated: March 31, 2026

Complete API documentation for implementing subscription features in mobile applications (iOS/Android/Flutter/React Native).

---

## Table of Contents

1. [Overview](#overview)
2. [Authentication](#authentication)
3. [Subscription Flow](#subscription-flow)
4. [API Endpoints](#api-endpoints)
5. [Data Models](#data-models)
6. [Mobile Integration Guide](#mobile-integration-guide)
7. [Error Handling](#error-handling)
8. [Best Practices](#best-practices)
9. [Testing](#testing)

---

## Overview

### What is TaxLah Subscription?

TaxLah offers subscription-based access to premium tax management features. Users can subscribe to monthly or yearly plans with optional trial periods.

### Key Features
- **Multiple Packages**: Monthly and Yearly billing options
- **Trial Periods**: Some packages offer free trial days
- **Auto-Renewal**: Automatic subscription renewal
- **Easy Cancellation**: Cancel anytime, with option to continue until period end
- **Payment Gateway**: Integrated with Chip payment gateway
- **Subscription History**: Track all subscription events

### Base URL
```
Production: https://api.taxlah.com
Staging: https://staging-api.taxlah.com
Development: http://localhost:3000
```

### API Base Path
```
/api/subscription
```

---

## Authentication

All authenticated endpoints require JWT Bearer token in the Authorization header.

### Header Format
```
Authorization: Bearer <your_jwt_token>
```

### Example (cURL)
```bash
curl -X GET "https://api.taxlah.com/api/subscription/my-subscription" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

### Example (JavaScript/Fetch)
```javascript
const response = await fetch('https://api.taxlah.com/api/subscription/my-subscription', {
    method: 'GET',
    headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
    }
});
```

### Example (Flutter/Dart)
```dart
final response = await http.get(
  Uri.parse('https://api.taxlah.com/api/subscription/my-subscription'),
  headers: {
    'Authorization': 'Bearer $authToken',
    'Content-Type': 'application/json',
  },
);
```

### Example (React Native)
```javascript
import axios from 'axios';

const response = await axios.get(
    'https://api.taxlah.com/api/subscription/my-subscription',
    {
        headers: {
            'Authorization': `Bearer ${authToken}`,
            'Content-Type': 'application/json'
        }
    }
);
```

---

## Subscription Flow

### User Journey

```
┌─────────────────────────────────────────────────────────────┐
│                    USER ONBOARDING                          │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    ┌──────────────────┐
                    │  View Packages   │ ◄── GET /packages
                    └──────────────────┘
                              │
                              ▼
                    ┌──────────────────┐
                    │ Select a Package │
                    └──────────────────┘
                              │
                              ▼
                ┌─────────────────────────────┐
                │  Has Trial Period?          │
                └─────────────────────────────┘
                      │                  │
                      │ Yes              │ No
                      ▼                  ▼
           ┌──────────────────┐  ┌──────────────────┐
           │ Instant Activation│  │  Payment Required │
           │ POST /subscribe   │  │  POST /subscribe  │
           │ Status: Trial     │  │  Returns: payment_url
           └──────────────────┘  └──────────────────┘
                      │                  │
                      │                  ▼
                      │         ┌─────────────────┐
                      │         │ User Pays via   │
                      │         │ Payment Gateway │
                      │         └─────────────────┘
                      │                  │
                      │                  ▼
                      │         ┌─────────────────┐
                      │         │ Webhook Received│
                      │         │ Subscription    │
                      │         │ Activated       │
                      │         └─────────────────┘
                      │                  │
                      └─────────┬────────┘
                                │
                                ▼
                    ┌──────────────────────┐
                    │  Subscription Active │
                    │  User has access     │
                    └──────────────────────┘
                                │
          ┌─────────────────────┼─────────────────────┐
          │                     │                     │
          ▼                     ▼                     ▼
    ┌──────────┐        ┌──────────┐        ┌──────────┐
    │  Cancel  │        │  Resume  │        │  Renew   │
    └──────────┘        └──────────┘        └──────────┘
```

### Subscription Statuses

| Status | Description | User Access |
|--------|-------------|-------------|
| **Trial** | User in trial period | ✅ Full Access |
| **Active** | Active paid subscription | ✅ Full Access |
| **Past_Due** | Payment failed, grace period | ⚠️ Limited Access |
| **Cancelled** | User cancelled, still active until period end | ✅ Access until end date |
| **Expired** | Subscription ended | ❌ No Access |
| **Suspended** | Account suspended by admin | ❌ No Access |

---

## API Endpoints

### 1. Get Subscription Packages

Retrieve all available subscription packages.

**Endpoint:** `GET /api/subscription/packages`  
**Authentication:** Not Required  
**Rate Limit:** None

#### Response Example
```json
{
    "status": true,
    "status_code": 200,
    "message": "Subscription packages retrieved successfully.",
    "data": [
        {
            "sub_package_id": 1,
            "package_code": "PRO",
            "package_name": "Monthly Pro",
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
            "package_name": "Yearly Premium",
            "package_description": "Best value with yearly savings",
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
            "sort_order": 2,
            "trial_days": 7
        }
    ]
}
```

#### Mobile Implementation

**Flutter Example:**
```dart
Future<List<SubscriptionPackage>> getPackages() async {
  try {
    final response = await http.get(
      Uri.parse('$baseUrl/api/subscription/packages'),
    );
    
    if (response.statusCode == 200) {
      final data = json.decode(response.body);
      return (data['data'] as List)
          .map((json) => SubscriptionPackage.fromJson(json))
          .toList();
    }
    throw Exception('Failed to load packages');
  } catch (e) {
    print('Error: $e');
    rethrow;
  }
}

// Model
class SubscriptionPackage {
  final int subPackageId;
  final String packageCode;
  final String packageName;
  final String description;
  final String billingPeriod;
  final double priceAmount;
  final String currency;
  final List<String> features;
  final String badge;
  final String color;
  final int trialDays;
  
  SubscriptionPackage.fromJson(Map<String, dynamic> json)
      : subPackageId = json['sub_package_id'],
        packageCode = json['package_code'],
        packageName = json['package_name'],
        description = json['package_description'],
        billingPeriod = json['billing_period'],
        priceAmount = (json['price_amount'] as num).toDouble(),
        currency = json['currency'],
        features = List<String>.from(json['features']),
        badge = json['package_badge'],
        color = json['package_color'],
        trialDays = json['trial_days'];
}
```

**React Native Example:**
```javascript
import { useState, useEffect } from 'react';
import axios from 'axios';

export const useSubscriptionPackages = () => {
    const [packages, setPackages] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const fetchPackages = async () => {
            try {
                const response = await axios.get(
                    `${API_BASE_URL}/api/subscription/packages`
                );
                
                if (response.data.status) {
                    setPackages(response.data.data);
                }
            } catch (err) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        fetchPackages();
    }, []);

    return { packages, loading, error };
};

// Usage in component
function PackagesScreen() {
    const { packages, loading, error } = useSubscriptionPackages();

    if (loading) return <LoadingSpinner />;
    if (error) return <ErrorMessage message={error} />;

    return (
        <FlatList
            data={packages}
            renderItem={({ item }) => <PackageCard package={item} />}
            keyExtractor={item => item.sub_package_id.toString()}
        />
    );
}
```

---

### 2. Get Package Details

Get details of a specific subscription package.

**Endpoint:** `GET /api/subscription/packages/:packageId`  
**Authentication:** Not Required

#### Parameters
- `packageId` (path parameter) - Package ID

#### Example Request
```bash
GET /api/subscription/packages/1
```

#### Response Example
```json
{
    "status": true,
    "status_code": 200,
    "message": "Package details retrieved successfully.",
    "data": {
        "sub_package_id": 1,
        "package_code": "PRO",
        "package_name": "Monthly Pro",
        "billing_period": "Monthly",
        "price_amount": 14.90,
        "features": [...]
    }
}
```

---

### 3. Get My Subscription

Get user's current active subscription details.

**Endpoint:** `GET /api/subscription/my-subscription`  
**Authentication:** Required ✅

#### Response Example (With Subscription)
```json
{
    "status": true,
    "status_code": 200,
    "message": "Active subscription found.",
    "has_subscription": true,
    "data": {
        "subscription_id": 123,
        "subscription_ref": "SUB-1711900234-ABC123",
        "account_id": 456,
        "sub_package_id": 1,
        "billing_period": "Monthly",
        "price_amount": 14.90,
        "start_date": "2026-03-01T00:00:00.000Z",
        "current_period_start": "2026-03-01T00:00:00.000Z",
        "current_period_end": "2026-04-01T00:00:00.000Z",
        "next_billing_date": "2026-04-01T00:00:00.000Z",
        "trial_end_date": null,
        "status": "Active",
        "auto_renew": "Yes",
        "payment_method": "Chip",
        "cancel_at_period_end": "No",
        "cancelled_at": null,
        "package_name": "Monthly Pro",
        "package_code": "PRO",
        "package_description": "Perfect for regular users",
        "features": [
            "Unlimited receipt uploads",
            "AI-powered auto-categorization"
        ],
        "package_badge": "MONTHLY",
        "package_color": "#17a2b8"
    }
}
```

#### Response Example (No Subscription)
```json
{
    "status": true,
    "status_code": 200,
    "message": "No active subscription.",
    "has_subscription": false,
    "data": null
}
```

#### Mobile Implementation

**Flutter Example:**
```dart
class SubscriptionService {
  Future<UserSubscription?> getMySubscription(String token) async {
    try {
      final response = await http.get(
        Uri.parse('$baseUrl/api/subscription/my-subscription'),
        headers: {
          'Authorization': 'Bearer $token',
          'Content-Type': 'application/json',
        },
      );

      if (response.statusCode == 200) {
        final data = json.decode(response.body);
        
        if (data['has_subscription'] == true) {
          return UserSubscription.fromJson(data['data']);
        }
        return null;
      }
      
      throw Exception('Failed to load subscription');
    } catch (e) {
      print('Error: $e');
      rethrow;
    }
  }
}
```

**React Native Example:**
```javascript
export const getMySubscription = async (token) => {
    try {
        const response = await axios.get(
            `${API_BASE_URL}/api/subscription/my-subscription`,
            {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        return {
            hasSubscription: response.data.has_subscription,
            subscription: response.data.data
        };
    } catch (error) {
        console.error('Get subscription error:', error);
        throw error;
    }
};
```

---

### 4. Check Subscription Access

Check if user has active subscription and what features are available.

**Endpoint:** `GET /api/subscription/check-access`  
**Authentication:** Required ✅

#### Response Example
```json
{
    "status": true,
    "status_code": 200,
    "message": "Subscription access checked successfully.",
    "data": {
        "success": true,
        "has_access": true,
        "subscription_status": "Active",
        "package_name": "Monthly Pro",
        "current_period_end": "2026-04-01T00:00:00.000Z",
        "features": {
            "unlimited_receipts": true,
            "unlimited_reports": true,
            "ai_categorization": true,
            "cloud_storage": true,
            "priority_support": false
        },
        "days_remaining": 15
    }
}
```

#### Use Case: Feature Gating

**Flutter Example:**
```dart
class FeatureGate {
  static Future<bool> canUploadReceipt() async {
    final access = await checkAccess();
    return access.features['unlimited_receipts'] ?? false;
  }

  static Future<void> showFeatureLockedDialog(BuildContext context) async {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('Premium Feature'),
        content: Text('This feature requires an active subscription.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: Text('Cancel'),
          ),
          ElevatedButton(
            onPressed: () {
              Navigator.pop(ctx);
              Navigator.pushNamed(ctx, '/subscription/packages');
            },
            child: Text('Subscribe Now'),
          ),
        ],
      ),
    );
  }
}
```

---

### 5. Subscribe to Package

Subscribe user to a specific package.

**Endpoint:** `POST /api/subscription/subscribe`  
**Authentication:** Required ✅

#### Request Body
```json
{
    "package_id": 1,
    "payment_method": "Chip"
}
```

#### Parameters
- `package_id` (integer, required) - ID of the package to subscribe to
- `payment_method` (string, optional) - Payment method (default: "Chip")

#### Response Example (With Trial)
```json
{
    "status": true,
    "status_code": 200,
    "message": "Subscription activated with trial period.",
    "data": {
        "subscription_id": 123,
        "subscription_ref": "SUB-1711900234-ABC123",
        "status": "Trial",
        "trial_end_date": "2026-04-07T00:00:00.000Z",
        "current_period_end": "2026-04-01T00:00:00.000Z"
    }
}
```

#### Response Example (Payment Required)
```json
{
    "status": true,
    "status_code": 200,
    "message": "Please complete payment to activate subscription.",
    "data": {
        "package_name": "Monthly Pro",
        "amount": 14.90,
        "billing_period": "Monthly",
        "payment_url": "https://gate.chip-in.asia/pay/abc123xyz",
        "payment_ref": "SUBPAY-1711900234-XYZ789"
    }
}
```

#### Error Response (Already Subscribed)
```json
{
    "status": false,
    "status_code": 400,
    "message": "User already has an active subscription",
    "data": null
}
```

#### Mobile Implementation

**Flutter Example:**
```dart
Future<SubscriptionResult> subscribe(int packageId) async {
  try {
    final response = await http.post(
      Uri.parse('$baseUrl/api/subscription/subscribe'),
      headers: {
        'Authorization': 'Bearer $token',
        'Content-Type': 'application/json',
      },
      body: json.encode({
        'package_id': packageId,
        'payment_method': 'Chip',
      }),
    );

    final data = json.decode(response.body);

    if (data['status'] == true) {
      // Check if payment is required
      if (data['data']['payment_url'] != null) {
        // Open payment URL in webview or browser
        await launchUrl(Uri.parse(data['data']['payment_url']));
        return SubscriptionResult.pendingPayment(
          paymentUrl: data['data']['payment_url'],
          paymentRef: data['data']['payment_ref'],
        );
      } else {
        // Trial activated immediately
        return SubscriptionResult.success(
          subscriptionId: data['data']['subscription_id'],
          status: data['data']['status'],
        );
      }
    }

    return SubscriptionResult.error(data['message']);
  } catch (e) {
    return SubscriptionResult.error(e.toString());
  }
}
```

**React Native Example:**
```javascript
import { Linking } from 'react-native';

export const subscribeToPackage = async (packageId, token) => {
    try {
        const response = await axios.post(
            `${API_BASE_URL}/api/subscription/subscribe`,
            {
                package_id: packageId,
                payment_method: 'Chip'
            },
            {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        const result = response.data;

        if (result.status) {
            if (result.data.payment_url) {
                // Open payment URL
                await Linking.openURL(result.data.payment_url);
                
                return {
                    requiresPayment: true,
                    paymentUrl: result.data.payment_url,
                    paymentRef: result.data.payment_ref
                };
            } else {
                // Trial activated
                return {
                    requiresPayment: false,
                    subscription: result.data
                };
            }
        }

        throw new Error(result.message);
    } catch (error) {
        console.error('Subscribe error:', error);
        throw error;
    }
};
```

---

### 6. Cancel Subscription

Cancel user's active subscription.

**Endpoint:** `POST /api/subscription/cancel`  
**Authentication:** Required ✅

#### Request Body
```json
{
    "cancel_at_period_end": true,
    "reason": "Too expensive"
}
```

#### Parameters
- `cancel_at_period_end` (boolean, optional) - Default: true
  - `true`: User keeps access until current period ends
  - `false`: Cancel immediately, access removed
- `reason` (string, optional) - Cancellation reason for analytics

#### Response Example (Cancel at Period End)
```json
{
    "status": true,
    "status_code": 200,
    "message": "Subscription will be cancelled at the end of the current period",
    "data": {
        "subscription_id": 123,
        "ends_at": "2026-04-01T00:00:00.000Z",
        "cancel_at_period_end": true,
        "days_remaining": 15
    }
}
```

#### Response Example (Cancel Immediately)
```json
{
    "status": true,
    "status_code": 200,
    "message": "Subscription cancelled successfully",
    "data": {
        "subscription_id": 123,
        "status": "Cancelled",
        "ended_at": "2026-03-17T10:30:00.000Z"
    }
}
```

#### Mobile Implementation

**Flutter Example:**
```dart
Future<void> cancelSubscription(BuildContext context) async {
  // Show confirmation dialog
  final confirmed = await show Dialog<bool>(
    context: context,
    builder: (ctx) => AlertDialog(
      title: Text('Cancel Subscription'),
      content: Text(
        'Are you sure you want to cancel? You\'ll lose access to premium features.'
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(ctx, false),
          child: Text('No, Keep Subscription'),
        ),
        ElevatedButton(
          onPressed: () => Navigator.pop(ctx, true),
          child: Text('Yes, Cancel'),
          style: ElevatedButton.styleFrom(primary: Colors.red),
        ),
      ],
    ),
  );

  if (confirmed == true) {
    try {
      final response = await http.post(
        Uri.parse('$baseUrl/api/subscription/cancel'),
        headers: {
          'Authorization': 'Bearer $token',
          'Content-Type': 'application/json',
        },
        body: json.encode({
          'cancel_at_period_end': true,
          'reason': 'User initiated cancellation',
        }),
      );

      final data = json.decode(response.body);

      if (data['status'] == true) {
        // Show success message
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(data['message'])),
        );
      }
    } catch (e) {
      print('Error: $e');
    }
  }
}
```

---

### 7. Resume Subscription

Resume a cancelled subscription (before it expires).

**Endpoint:** `POST /api/subscription/resume`  
**Authentication:** Required ✅

#### Request Body
None required (empty body or {})

#### Response Example
```json
{
    "status": true,
    "status_code": 200,
    "message": "Subscription resumed successfully",
    "data": {
        "subscription_id": 123,
        "status": "Active",
        "current_period_end": "2026-04-01T00:00:00.000Z",
        "cancel_at_period_end": false
    }
}
```

---

### 8. Renew Subscription

Renew an expired or expiring subscription.

**Endpoint:** `POST /api/subscription/renew`  
**Authentication:** Required ✅

#### Request Body
```json
{
    "package_id": 1,
    "payment_method": "Chip"
}
```

#### Parameters
- `package_id` (integer, optional) - Package to renew with (if not provided, uses same package)
- `payment_method` (string, optional) - Payment method

---

### 9. Get Subscription History

Get user's subscription history.

**Endpoint:** `GET /api/subscription/history`  
**Authentication:** Required ✅

#### Query Parameters
- `limit` (integer, optional) - Max number of records (default: 10)

#### Example Request
```bash
GET /api/subscription/history?limit=5
```

#### Response Example
```json
{
    "status": true,
    "status_code": 200,
    "message": "Subscription history retrieved successfully.",
    "data": [
        {
            "subscription_id": 123,
            "subscription_ref": "SUB-1711900234-ABC123",
            "package_name": "Monthly Pro",
            "billing_period": "Monthly",
            "price_amount": 14.90,
            "start_date": "2026-03-01T00:00:00.000Z",
            "ended_at": null,
            "status": "Active"
        },
        {
            "subscription_id": 122,
            "subscription_ref": "SUB-1708308234-XYZ789",
            "package_name": "Monthly Pro",
            "billing_period": "Monthly",
            "price_amount": 14.90,
            "start_date": "2026-02-01T00:00:00.000Z",
            "ended_at": "2026-03-01T00:00:00.000Z",
            "status": "Expired"
        }
    ]
}
```

---

### 10. Get Subscription Events

Get timeline of subscription events (activations, cancellations, renewals, etc.).

**Endpoint:** `GET /api/subscription/events`  
**Authentication:** Required ✅

#### Query Parameters
- `limit` (integer, optional) - Max number of events (default: 20)

---

### 11. Get Payment History

Get user's payment history.

**Endpoint:** `GET /api/subscription/payments`  
**Authentication:** Required ✅

#### Query Parameters
- `limit` (integer, optional) - Max number of payments (default: 10)

#### Response Example
```json
{
    "status": true,
    "status_code": 200,
    "message": "Payment history retrieved successfully.",
    "data": [
        {
            "payment_id": 789,
            "payment_ref": "SUBPAY-1711900234-XYZ789",
            "subscription_id": 123,
            "amount": 14.90,
            "currency": "MYR",
            "payment_method": "Chip",
            "payment_status": "Completed",
            "gateway_payment_id": "chip_pay_abc123",
            "paid_at": "2026-03-01T10:30:00.000Z",
            "period_start": "2026-03-01T00:00:00.000Z",
            "period_end": "2026-04-01T00:00:00.000Z"
        }
    ]
}
```

---

### 12. Get Payment Details

Get specific payment details by reference.

**Endpoint:** `GET /api/subscription/payment/:paymentRef`  
**Authentication:** Required ✅

#### Example Request
```bash
GET /api/subscription/payment/SUBPAY-1711900234-XYZ789
```

---

## Data Models

### Subscription Model
```typescript
interface Subscription {
    subscription_id: number;
    subscription_ref: string;
    account_id: number;
    sub_package_id: number;
    billing_period: 'Monthly' | 'Yearly';
    price_amount: number;
    start_date: string; // ISO 8601
    current_period_start: string;
    current_period_end: string;
    next_billing_date: string | null;
    trial_end_date: string | null;
    cancelled_at: string | null;
    ended_at: string | null;
    status: 'Trial' | 'Active' | 'Past_Due' | 'Cancelled' | 'Expired' | 'Suspended';
    auto_renew: 'Yes' | 'No';
    payment_method: string;
    cancel_reason: string | null;
    cancel_at_period_end: 'Yes' | 'No';
    package_name: string;
    package_code: string;
    package_description: string;
    features: string[];
    package_badge: string;
    package_color: string;
}
```

### Package Model
```typescript
interface SubscriptionPackage {
    sub_package_id: number;
    package_code: string;
    package_name: string;
    package_description: string;
    billing_period: 'Monthly' | 'Yearly';
    price_amount: number;
    currency: string;
    features: string[];
    max_receipts: number | null;
    max_reports: number | null;
    storage_limit_mb: number | null;
    package_badge: string;
    package_color: string;
    is_featured: 'Yes' | 'No';
    sort_order: number;
    trial_days: number;
}
```

### Payment Model
```typescript
interface Payment {
    payment_id: number;
    payment_ref: string;
    subscription_id: number;
    account_id: number;
    amount: number;
    currency: string;
    payment_method: string;
    payment_status: 'Pending' | 'Completed' | 'Failed' | 'Refunded';
    gateway_payment_id: string | null;
    paid_at: string | null;
    period_start: string;
    period_end: string;
    created_date: string;
}
```

---

## Mobile Integration Guide

### State Management (Flutter - Riverpod)

```dart
// providers/subscription_provider.dart
import 'package:flutter_riverpod/flutter_riverpod.dart';

final subscriptionProvider = StateNotifierProvider<SubscriptionNotifier, SubscriptionState>((ref) {
  return SubscriptionNotifier();
});

class SubscriptionState {
  final bool hasSubscription;
  final Subscription? subscription;
  final bool isLoading;
  final String? error;

  SubscriptionState({
    this.hasSubscription = false,
    this.subscription,
    this.isLoading = false,
    this.error,
  });

  SubscriptionState copyWith({
    bool? hasSubscription,
    Subscription? subscription,
    bool? isLoading,
    String? error,
  }) {
    return SubscriptionState(
      hasSubscription: hasSubscription ?? this.hasSubscription,
      subscription: subscription ?? this.subscription,
      isLoading: isLoading ?? this.isLoading,
      error: error ?? this.error,
    );
  }
}

class SubscriptionNotifier extends StateNotifier<SubscriptionState> {
  SubscriptionNotifier() : super(SubscriptionState());

  Future<void> loadSubscription() async {
    state = state.copyWith(isLoading: true, error: null);
    
    try {
      final token = await getAuthToken();
      final result = await SubscriptionService.getMySubscription(token);
      
      state = state.copyWith(
        hasSubscription: result != null,
        subscription: result,
        isLoading: false,
      );
    } catch (e) {
      state = state.copyWith(
        isLoading: false,
        error: e.toString(),
      );
    }
  }

  Future<void> subscribe(int packageId) async {
    state = state.copyWith(isLoading: true);
    
    try {
      final result = await SubscriptionService.subscribe(packageId);
      
      if (!result.requiresPayment) {
        // Reload subscription after successful activation
        await loadSubscription();
      }
      
      state = state.copyWith(isLoading: false);
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
    }
  }

  Future<void> cancelSubscription({String? reason}) async {
    state = state.copyWith(isLoading: true);
    
    try {
      await SubscriptionService.cancel(cancelAtPeriodEnd: true, reason: reason);
      await loadSubscription(); // Reload to get updated status
      
      state = state.copyWith(isLoading: false);
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
    }
  }
}

// Usage in widget
class SubscriptionScreen extends ConsumerWidget {
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final subscriptionState = ref.watch(subscriptionProvider);
    
    if (subscriptionState.isLoading) {
      return CircularProgressIndicator();
    }
    
    if (subscriptionState.hasSubscription) {
      return SubscriptionDetailsCard(
        subscription: subscriptionState.subscription!,
      );
    }
    
    return SubscriptionPackagesView();
  }
}
```

### State Management (React Native - Context API)

```javascript
// contexts/SubscriptionContext.js
import React, { createContext, useContext, useState, useEffect } from 'react';
import { subscriptionAPI } from '../api/subscription';

const SubscriptionContext = createContext();

export function SubscriptionProvider({ children }) {
    const [subscription, setSubscription] = useState(null);
    const [hasSubscription, setHasSubscription] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const loadSubscription = async () => {
        try {
            setLoading(true);
            const result = await subscriptionAPI.getMySubscription();
            setSubscription(result.subscription);
            setHasSubscription(result.hasSubscription);
            setError(null);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const subscribe = async (packageId) => {
        try {
            setLoading(true);
            const result = await subscriptionAPI.subscribe(packageId);
            
            if (!result.requiresPayment) {
                await loadSubscription();
            }
            
            return result;
        } catch (err) {
            setError(err.message);
            throw err;
        } finally {
            setLoading(false);
        }
    };

    const cancelSubscription = async (reason) => {
        try {
            setLoading(true);
            await subscriptionAPI.cancel({ cancelAtPeriodEnd: true, reason });
            await loadSubscription();
        } catch (err) {
            setError(err.message);
            throw err;
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadSubscription();
    }, []);

    return (
        <SubscriptionContext.Provider
            value={{
                subscription,
                hasSubscription,
                loading,
                error,
                loadSubscription,
                subscribe,
                cancelSubscription
            }}
        >
            {children}
        </SubscriptionContext.Provider>
    );
}

export const useSubscription = () => useContext(SubscriptionContext);

// Usage in component
function SubscriptionScreen() {
    const { subscription, hasSubscription, loading, subscribe } = useSubscription();

    if (loading) {
        return <ActivityIndicator />;
    }

    if (hasSubscription) {
        return <SubscriptionDetails subscription={subscription} />;
    }

    return <PackageSelection onSubscribe={subscribe} />;
}
```

### Payment Integration

#### WebView for Payment Gateway

**Flutter Example:**
```dart
import 'package:webview_flutter/webview_flutter.dart';

class PaymentWebView extends StatefulWidget {
  final String paymentUrl;
  final String paymentRef;
  
  const PaymentWebView({
    required this.paymentUrl,
    required this.paymentRef,
  });

  @override
  _PaymentWebViewState createState() => _PaymentWebViewState();
}

class _PaymentWebViewState extends State<PaymentWebView> {
  late final WebViewController controller;

  @override
  void initState() {
    super.initState();
    
    controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setNavigationDelegate(
        NavigationDelegate(
          onPageFinished: (String url) {
            // Check if payment is complete
            if (url.contains('payment-success') || url.contains('return-url')) {
              _handlePaymentComplete();
            } else if (url.contains('payment-failed')) {
              _handlePaymentFailed();
            }
          },
        ),
      )
      ..loadRequest(Uri.parse(widget.paymentUrl));
  }

  void _handlePaymentComplete() async {
    // Wait a bit for webhook to process
    await Future.delayed(Duration(seconds: 2));
    
    // Refresh subscription status
    final provider = context.read(subscriptionProvider.notifier);
    await provider.loadSubscription();
    
    // Navigate back with success
    Navigator.of(context).pop(true);
    
    // Show success message
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text('Payment successful! Subscription activated.')),
    );
  }

  void _handlePaymentFailed() {
    Navigator.of(context).pop(false);
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text('Payment failed. Please try again.')),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text('Complete Payment')),
      body: WebViewWidget(controller: controller),
    );
  }
}
```

**React Native Example:**
```javascript
import { WebView } from 'react-native-webview';

function PaymentWebView({ paymentUrl, paymentRef, onComplete, onFail }) {
    const handleNavigationStateChange = (navState) => {
        const { url } = navState;

        // Check if payment is complete
        if (url.includes('payment-success') || url.includes('return-url')) {
            // Wait for webhook to process
            setTimeout(() => {
                onComplete();
            }, 2000);
        } else if (url.includes('payment-failed')) {
            onFail();
        }
    };

    return (
        <WebView
            source={{ uri: paymentUrl }}
            onNavigationStateChange={handleNavigationStateChange}
            startInLoadingState={true}
            renderLoading={() => <ActivityIndicator />}
        />
    );
}
```

---

## Error Handling

### Common Error Codes

| Status Code | Error Type | Description |
|-------------|------------|-------------|
| 400 | Bad Request | Invalid request parameters |
| 401 | Unauthorized | Missing or invalid authentication token |
| 404 | Not Found | Resource not found (package, subscription, etc.) |
| 409 | Conflict | User already has active subscription |
| 500 | Server Error | Internal server error |

### Error Response Format
```json
{
    "status": false,
    "status_code": 400,
    "message": "Error description here",
    "data": null
}
```

### Error Handling Best Practices

**Flutter Example:**
```dart
class APIException implements Exception {
  final int statusCode;
  final String message;

  APIException(this.statusCode, this.message);

  @override
  String toString() => message;
}

Future<T> handleAPICall<T>(Future<http.Response> Function() apiCall) async {
  try {
    final response = await apiCall();
    final data = json.decode(response.body);

    if (response.statusCode == 200 && data['status'] == true) {
      return data['data'] as T;
    }

    throw APIException(
      data['status_code'] ?? response.statusCode,
      data['message'] ?? 'Unknown error occurred',
    );
  } on SocketException {
    throw APIException(0, 'No internet connection');
  } on FormatException {
    throw APIException(0, 'Invalid response format');
  } catch (e) {
    if (e is APIException) rethrow;
    throw APIException(0, e.toString());
  }
}

// Usage
try {
  final subscription = await handleAPICall(() => 
    http.get(Uri.parse('$baseUrl/api/subscription/my-subscription'))
  );
} on APIException catch (e) {
  if (e.statusCode == 401) {
    // Handle unauthorized - redirect to login
    navigatorKey.currentState?.pushReplacementNamed('/login');
  } else {
    // Show error message
    showErrorDialog(e.message);
  }
}
```

---

## Best Practices

### 1. Cache Subscription Data

Cache subscription data locally to reduce API calls and improve app performance.

**Flutter Example (using Hive):**
```dart
import 'package:hive/hive.dart';

class SubscriptionCache {
  static const String boxName = 'subscription';
  static const String key = 'current_subscription';

  static Future<void> saveSubscription(Subscription subscription) async {
    final box = await Hive.openBox(boxName);
    await box.put(key, subscription.toJson());
  }

  static Future<Subscription?> getSubscription() async {
    final box = await Hive.openBox(boxName);
    final data = box.get(key);
    return data != null ? Subscription.fromJson(data) : null;
  }

  static Future<void> clear() async {
    final box = await Hive.openBox(boxName);
    await box.delete(key);
  }
}

// Use in service
class SubscriptionService {
  Future<Subscription?> getMySubscription({bool forceRefresh = false}) async {
    // Try cache first
    if (!forceRefresh) {
      final cached = await SubscriptionCache.getSubscription();
      if (cached != null) return cached;
    }

    // Fetch from API
    final subscription = await _fetchFromAPI();
    
    // Save to cache
    if (subscription != null) {
      await SubscriptionCache.saveSubscription(subscription);
    }

    return subscription;
  }
}
```

### 2. Handle Payment Results

Always verify payment status after payment gateway returns.

```dart
Future<void> handlePaymentReturn() async {
  // Show loading
  showDialog(
    context: context,
    barrierDismissible: false,
    builder: (ctx) => Center(child: CircularProgressIndicator()),
  );

  // Wait for webhook processing
  await Future.delayed(Duration(seconds: 3));

  // Fetch latest subscription status
  final provider = context.read(subscriptionProvider.notifier);
  await provider.loadSubscription();

  // Hide loading
  Navigator.pop(context);

  // Check if subscription is active
  final state = context.read(subscriptionProvider);
  if (state.hasSubscription) {
    showSuccessDialog('Subscription activated successfully!');
  } else {
    showErrorDialog('Payment verification failed. Please contact support.');
  }
}
```

### 3. Feature Gating

Implement proper feature gating to control access to premium features.

```dart
class FeatureAccess {
  static Future<bool> canAccessFeature(String featureName) async {
    final subscription = await SubscriptionCache.getSubscription();
    
    if (subscription == null) return false;
    if (subscription.status != 'Active' && subscription.status != 'Trial') {
      return false;
    }

    // Check feature availability
    switch (featureName) {
      case 'upload_receipt':
        return subscription.features.contains('Unlimited receipt uploads');
      case 'generate_report':
        return true; // All subscriptions have this
      case 'priority_support':
        return subscription.package_code == 'PREMIUM';
      default:
        return false;
    }
  }

  static Future<void> checkAndExecute(
    BuildContext context,
    String feature,
    VoidCallback action,
  ) async {
    final hasAccess = await canAccessFeature(feature);
    
    if (hasAccess) {
      action();
    } else {
      showSubscriptionRequiredDialog(context);
    }
  }
}

// Usage
ElevatedButton(
  onPressed: () {
    FeatureAccess.checkAndExecute(
      context,
      'upload_receipt',
      () => Navigator.pushNamed(context, '/upload-receipt'),
    );
  },
  child: Text('Upload Receipt'),
);
```

### 4. Subscription Status Polling

For better UX during payment, poll subscription status.

```dart
class PaymentVerification {
  static Future<bool> waitForActivation(String paymentRef, {
    Duration timeout = const Duration(minutes: 5),
    Duration pollInterval = const Duration(seconds: 3),
  }) async {
    final endTime = DateTime.now().add(timeout);
    
    while (DateTime.now().isBefore(endTime)) {
      try {
        final subscription = await SubscriptionService.getMySubscription(
          forceRefresh: true,
        );
        
        if (subscription != null && 
            (subscription.status == 'Active' || subscription.status == 'Trial')) {
          return true;
        }
      } catch (e) {
        print('Poll error: $e');
      }
      
      await Future.delayed(pollInterval);
    }
    
    return false;
  }
}

// Usage after payment
final activated = await PaymentVerification.waitForActivation(paymentRef);
if (activated) {
  showSuccessMessage();
} else {
  showTimeoutMessage();
}
```

### 5. Offline Handling

Handle offline scenarios gracefully.

```dart
class NetworkAwareSubscriptionService {
  Future<Subscription?> getSubscription() async {
    final hasConnection = await checkConnectivity();
    
    if (!hasConnection) {
      // Return cached data with warning
      final cached = await SubscriptionCache.getSubscription();
      if (cached != null) {
        showWarning('Using offline data. Connect to refresh.');
        return cached;
      }
      throw NoInternetException();
    }

    return await fetchFromAPI();
  }
}
```

---

## Testing

### Test Accounts

Contact support for test accounts with different subscription statuses.

### Test Cards (Chip Payment Gateway)

| Card Number | Expiry | CVV | Result |
|-------------|--------|-----|--------|
| 4242 4242 4242 4242 | Any future date | Any 3 digits | Success |
| 4000 0000 0000 0002 | Any future date | Any 3 digits | Declined |

### Test Scenarios

1. **Subscribe with Trial**
   - Select package with trial_days > 0
   - Verify instant activation
   - Check trial_end_date is set

2. **Subscribe with Payment**
   - Select package with trial_days = 0
   - Complete payment flow
   - Verify activation after payment

3. **Cancel Subscription**
   - Cancel with cancel_at_period_end = true
   - Verify access continues until period end
   - Check status shows cancellation

4. **Resume Cancelled Subscription**
   - Cancel subscription
   - Resume before period ends
   - Verify cancel_at_period_end resets

5. **Payment Failure**
   - Use test declined card
   - Verify subscription not activated
   - Check error handling

---

## Support & Resources

### API Support
- Email: api-support@taxlah.com
- Developer Portal: https://developer.taxlah.com
- Status Page: https://status.taxlah.com

### Rate Limits
- Authenticated: 100 requests per minute
- Unauthenticated: 20 requests per minute

### Webhooks
For real-time subscription status updates, implement webhook handling:
- Endpoint: Your server endpoint
- Events: `subscription.created`, `subscription.updated`, `subscription.cancelled`, `payment.completed`

---

**Last Updated:** March 31, 2026  
**API Version:** 1.0  
**Document Version:** 1.0.0

---

© 2026 TaxLah. All rights reserved.
