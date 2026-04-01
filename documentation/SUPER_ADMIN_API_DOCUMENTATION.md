# Super Admin API Documentation

Base URL: `/superadmin`  
All endpoints (except login and forgot/reset-password) require:
```
Authorization: Bearer <admin_token>
```
Token is obtained from the login endpoint. Token expires in **24 hours**.

---

## Table of Contents
1. [Authentication](#1-authentication)
2. [User Management](#2-user-management)
3. [Expenses Management](#3-expenses-management)
4. [Receipt Management](#4-receipt-management)
5. [Package Management](#5-package-management)
6. [Transaction Management](#6-transaction-management)
7. [Subscription Management](#7-subscription-management)
8. [Dashboard](#8-dashboard)
9. [Reports](#9-reports)
10. [Tax Category Management](#10-tax-category-management)
11. [Tax Subcategory Management](#11-tax-subcategory-management)

---

## 1. Authentication

### 1.1 Admin Login
`POST /superadmin/auth/login`

**Request Body:**
```json
{
  "username": "admin@taxlah.com",
  "password": "yourpassword"
}
```

**Response 200:**
```json
{
  "status_code": 200,
  "status": "Success",
  "message": "Login successful.",
  "data": {
    "token": "<jwt_token>",
    "admin": {
      "aauth_id": 1,
      "admin_id": 1,
      "username": "superadmin",
      "email": "admin@taxlah.com",
      "role": "Super Admin",
      "reference": "ADM-001",
      "profile": {
        "admin_id": 1,
        "admin_name": "superadmin",
        "admin_fullname": "Super Administrator",
        "admin_email": "admin@taxlah.com",
        "admin_phone": "+60123456789",
        "admin_role": "Super Admin"
      }
    }
  }
}
```

---

### 1.2 Get Current Admin Profile
`GET /superadmin/auth/me`  
🔒 Requires token

**Response 200:**
```json
{
  "status_code": 200,
  "status": "Success",
  "data": {
    "auth": {
      "aauth_id": 1,
      "aauth_reference_no": "ADM-001",
      "aauth_username": "superadmin",
      "aauth_usermail": "admin@taxlah.com",
      "aauth_role": "Super Admin",
      "aauth_status": "Active"
    },
    "profile": { ... }
  }
}
```

---

### 1.3 Forgot Password (Request OTP)
`POST /superadmin/auth/forgot-password`

**Request Body:**
```json
{ "email": "admin@taxlah.com" }
```

**Response 200:**
```json
{
  "status_code": 200,
  "status": "Success",
  "message": "If the email exists, an OTP has been sent."
}
```
> OTP is valid for **15 minutes**. Sent to admin email via queue.

---

### 1.4 Reset Password with OTP
`POST /superadmin/auth/reset-password`

**Request Body:**
```json
{
  "otp": "123456",
  "new_password": "newSecurePass123"
}
```

**Response 200:**
```json
{ "status_code": 200, "status": "Success", "message": "Password reset successful." }
```

---

### 1.5 Change Password
`PUT /superadmin/auth/change-password`  
🔒 Requires token

**Request Body:**
```json
{
  "current_password": "oldpass",
  "new_password": "newSecurePass123"
}
```

**Response 200:**
```json
{ "status_code": 200, "status": "Success", "message": "Password changed successfully." }
```

---

## 2. User Management

> All list endpoints support: `?page=1&limit=20&search=keyword&status=Active`

### 2.1 List Users
`GET /superadmin/users`  
🔒 Requires token

Query params: `page`, `limit`, `search`, `status` (Active | Suspended | Pending | Others)

**Response 200:**
```json
{
  "data": {
    "users": [ { "account_id": 1, "account_name": "...", ... } ],
    "total": 120,
    "page": 1,
    "limit": 20,
    "totalPages": 6
  }
}
```

---

### 2.2 User Stats Summary
`GET /superadmin/users/stats`  
🔒 Requires token

**Response 200:** `{ "data": { "total": 120, "active": 100, "suspended": 10, ... } }`

---

### 2.3 Get User Details
`GET /superadmin/users/:account_id`  
🔒 Requires token

---

### 2.4 Create User
`POST /superadmin/users`  
🔒 Requires token

**Request Body:**
```json
{
  "account_name": "john",
  "account_fullname": "John Doe",
  "account_email": "john@example.com",
  "account_contact": "+60123456789",
  "account_password": "password123",
  "account_status": "Active"
}
```

---

### 2.5 Update User Profile
`PUT /superadmin/users/:account_id`  
🔒 Requires token

**Allowed fields:** `account_name`, `account_fullname`, `account_contact`, `account_address_1`, `account_address_2`, `account_address_3`, `account_address_postcode`, `account_address_city`, `account_address_state`

---

### 2.6 Update User Status
`PUT /superadmin/users/:account_id/status`  
🔒 Requires token

**Request Body:**
```json
{ "status": "Suspended" }
```
Values: `Active | Suspended | Pending | Others`

---

### 2.7 Update User Credentials
`PUT /superadmin/users/:account_id/credentials`  
🔒 Requires token

**Request Body:**
```json
{
  "new_email": "newemail@example.com",
  "new_password": "newpass123"
}
```
> Both fields are optional; provide at least one.

---

### 2.8 Delete User
`DELETE /superadmin/users/:account_id`  
🔒 Requires token

---

### 2.9 Get User Activity Logs
`GET /superadmin/users/:account_id/activity`  
🔒 Requires token

---

### 2.10 Get User Expenses
`GET /superadmin/users/:account_id/expenses`  
🔒 Requires token

Query params: `page`, `limit`

---

### 2.11 List User Dependants
`GET /superadmin/users/:account_id/dependants`  
🔒 Requires token

Query params: `page`, `limit`, `search`, `status`

---

### 2.12 Create Dependant
`POST /superadmin/users/:account_id/dependants`  
🔒 Requires token

**Request Body:**
```json
{
  "dependant_name": "Jane Doe",
  "dependant_relationship": "Child",
  "dependant_nric": "001010-01-0001",
  "dependant_dob": "2000-01-01",
  "dependant_disability": "No"
}
```

---

### 2.13 Update Dependant
`PUT /superadmin/users/:account_id/dependants/:dependant_id`  
🔒 Requires token

**Allowed fields:** `dependant_name`, `dependant_relationship`, `dependant_nric`, `dependant_dob`, `dependant_disability`, `status`

---

### 2.14 Delete Dependant
`DELETE /superadmin/users/:account_id/dependants/:dependant_id`  
🔒 Requires token

---

## 3. Expenses Management

### 3.1 List All Expenses
`GET /superadmin/expenses`  
🔒 Requires token

Query params: `page`, `limit`, `search`, `status`

---

### 3.2 Expense Stats
`GET /superadmin/expenses/stats`  
🔒 Requires token

---

### 3.3 Get Expense Details
`GET /superadmin/expenses/:expenses_id`  
🔒 Requires token

---

### 3.4 Update Expense
`PUT /superadmin/expenses/:expenses_id`  
🔒 Requires token

**Allowed fields:** `expenses_name`, `expenses_description`, `expense_date`, `expenses_total_amount`, `expenses_currency`, `tax_year`

---

### 3.5 Update Expense Status
`PUT /superadmin/expenses/:expenses_id/status`  
🔒 Requires token

**Request Body:** `{ "status": "Deleted" }` — Values: `Active | Inactive | Deleted`

---

### 3.6 Delete Expense
`DELETE /superadmin/expenses/:expenses_id`  
🔒 Requires token

---

## 4. Receipt Management

### 4.1 List All Receipts
`GET /superadmin/receipts`  
🔒 Requires token

Query params: `page`, `limit`, `search`, `status`

---

### 4.2 Receipt Stats
`GET /superadmin/receipts/stats`  
🔒 Requires token

---

### 4.3 Get Receipt Details
`GET /superadmin/receipts/:receipt_id`  
🔒 Requires token

---

### 4.4 Update Receipt
`PUT /superadmin/receipts/:receipt_id`  
🔒 Requires token

**Allowed fields:** `receipt_name`, `receipt_description`, `receipt_date`, `receipt_total_amount`, `receipt_currency`, `merchant_id`, `receipt_category_id`, `tax_year`

---

### 4.5 Update Receipt Status
`PUT /superadmin/receipts/:receipt_id/status`  
🔒 Requires token

**Request Body:** `{ "status": "Rejected" }` — Values: `Active | Inactive | Deleted | Rejected`

---

### 4.6 Delete Receipt
`DELETE /superadmin/receipts/:receipt_id`  
🔒 Requires token

---

## 5. Package Management

### 5.1 List All Packages
`GET /superadmin/packages`  
🔒 Requires token

Query params: `page`, `limit`, `search`, `status` (Active | Inactive | Archived)

---

### 5.2 Get Package Details
`GET /superadmin/packages/:package_id`  
🔒 Requires token

---

### 5.3 Create Package
`POST /superadmin/packages`  
🔒 Requires token

**Request Body:**
```json
{
  "package_code": "BASIC",
  "package_name": "Basic Plan",
  "package_description": "Entry-level plan for individuals.",
  "billing_period": "Monthly",
  "price_amount": 9.90,
  "features": { "receipts": true, "reports": false, "tax_calc": true },
  "max_receipts": 100,
  "max_reports": 5,
  "storage_limit_mb": 500,
  "sort_order": 1,
  "status": "Active"
}
```
`billing_period` values: `Monthly | Yearly | Lifetime`

---

### 5.4 Update Package
`PUT /superadmin/packages/:package_id`  
🔒 Requires token

**Allowed fields:** `package_name`, `package_description`, `billing_period`, `price_amount`, `features`, `max_receipts`, `max_reports`, `storage_limit_mb`, `sort_order`, `status`

---

### 5.5 Archive Package
`DELETE /superadmin/packages/:package_id`  
🔒 Requires token  
> Sets `status = 'Archived'`. Does not hard-delete.

---

### 5.6 Assign Subscription to User
`POST /superadmin/packages/assign`  
🔒 Requires token

**Request Body:**
```json
{
  "account_id": 42,
  "sub_package_id": 3,
  "billing_period": "Monthly",
  "price_amount": 9.90,
  "start_date": "2024-01-01",
  "current_period_start": "2024-01-01",
  "current_period_end": "2024-02-01",
  "status": "Active",
  "auto_renew": "Yes"
}
```

**Response 200:**
```json
{ "data": { "subscription_id": 55 } }
```

---

### 5.7 Remove User Subscription
`DELETE /superadmin/packages/assign/:subscription_id`  
🔒 Requires token  
> Sets `status = 'Expired'` and `ended_at = NOW()`.

---

## 6. Transaction Management

### 6.1 List All Transactions
`GET /superadmin/transactions`  
🔒 Requires token

Query params: `page`, `limit`, `search`, `status` (Pending | Processing | Paid | Failed | Refunded | Cancelled)

---

### 6.2 Get Transaction Details
`GET /superadmin/transactions/:payment_id`  
🔒 Requires token

---

### 6.3 Create Manual Transaction/Bill
`POST /superadmin/transactions`  
🔒 Requires token

**Request Body:**
```json
{
  "account_id": 42,
  "subscription_id": 55,
  "amount": 9.90,
  "currency": "MYR",
  "payment_gateway": "Manual",
  "payment_status": "Pending",
  "period_start": "2024-01-01",
  "period_end": "2024-02-01",
  "notes": "Manual invoice from admin"
}
```

**Response 200:**
```json
{ "data": { "payment_id": 88 } }
```

---

### 6.4 Update Transaction Status
`PUT /superadmin/transactions/:payment_id/status`  
🔒 Requires token

**Request Body:**
```json
{
  "payment_status": "Paid",
  "notes": "Verified by admin"
}
```
Values: `Pending | Processing | Paid | Failed | Refunded | Cancelled`

---

### 6.5 Delete Transaction
`DELETE /superadmin/transactions/:payment_id`  
🔒 Requires token  
⚠️ **Hard deletes** the record. Use with caution.

---

### 6.6 Send Notification to User(s)
`POST /superadmin/transactions/notify`  
🔒 Requires token

**Request Body (specific users):**
```json
{
  "title": "Payment Reminder",
  "body": "Your subscription is due in 3 days.",
  "account_ids": [42, 47, 88]
}
```

**Request Body (broadcast to all):**
```json
{
  "title": "System Maintenance",
  "body": "TaxLah will be undergoing maintenance on 25 Jan 2025.",
  "broadcast": true
}
```

---

## 7. Subscription Management

### 7.1 List All Subscriptions
`GET /superadmin/subscriptions`  
🔒 Requires token

Query params: `page`, `limit`, `search`, `status` (Trial | Active | Past_Due | Cancelled | Expired | Suspended)

---

### 7.2 Get User's Subscription
`GET /superadmin/subscriptions/user/:account_id`  
🔒 Requires token  
> Returns most recent subscription for the user.

---

### 7.3 Get Subscription Details
`GET /superadmin/subscriptions/:subscription_id`  
🔒 Requires token

---

### 7.4 Update Subscription
`PUT /superadmin/subscriptions/:subscription_id`  
🔒 Requires token

**Allowed fields:** `sub_package_id`, `billing_period`, `price_amount`, `start_date`, `current_period_start`, `current_period_end`, `status`, `auto_renew`, `ended_at`

```json
{
  "status": "Active",
  "current_period_end": "2025-03-01",
  "auto_renew": "Yes"
}
```

---

### 7.5 Remove Subscription
`DELETE /superadmin/subscriptions/:subscription_id`  
🔒 Requires token  
> Sets `status = 'Expired'` and stamps `ended_at`.

---

## 8. Dashboard

### 8.1 Get Dashboard Summary
`GET /superadmin/dashboard`  
🔒 Requires token

**Response 200:**
```json
{
  "data": {
    "total_users": 320,
    "active_users": 290,
    "total_subscriptions": 220,
    "active_subscriptions": 195,
    "total_receipts": 15000,
    "total_revenue": 8850.00,
    "revenue_this_month": 750.00,
    "new_users_this_month": 14,
    "total_expenses": 4200,
    "total_expense_amount": 230000.00
  }
}
```

---

### 8.2 Yearly Revenue Graph
`GET /superadmin/dashboard/revenue?year=2024`  
🔒 Requires token

**Response 200:**
```json
{
  "data": {
    "year": 2024,
    "revenue": [
      { "month": "January",   "total": 500.00 },
      { "month": "February",  "total": 650.00 },
      { "month": "March",     "total": 0 },
      ...
      { "month": "December",  "total": 900.00 }
    ]
  }
}
```
> Always returns all 12 months. Months with no data return `total: 0`.

---

## 9. Reports

> All report endpoints support: `?page=1&limit=20&search=keyword&status=...&dateFrom=2024-01-01&dateTo=2024-12-31`

### 9.1 User Activity Report
`GET /superadmin/reports/users`  
🔒 Requires token

Query params: `page`, `limit`, `search`, `status`, `dateFrom`, `dateTo`

**Response 200 data fields per row:**
`account_id`, `account_name`, `account_email`, `account_status`, `created_date`, `total_expenses`, `total_receipts`, `total_expense_amount`, `subscription_status`, `current_period_end`, `package_name`

---

### 9.2 Transaction Report
`GET /superadmin/reports/transactions`  
🔒 Requires token

Query params: `page`, `limit`, `search`, `status`, `dateFrom`, `dateTo`

**Response 200 data fields per row:**
`payment_id`, `payment_ref`, `amount`, `currency`, `payment_status`, `payment_gateway`, `created_date`, `paid_date`, `account_name`, `account_email`, `package_name`, `package_code`

**Plus summary:**
```json
{
  "summary": {
    "total_collected": 8850.00,
    "paid_count": 180,
    "pending_count": 12,
    "failed_count": 5
  }
}
```

---

### 9.3 Data Usage Report
`GET /superadmin/reports/data-usage`  
🔒 Requires token

Query params: `page`, `limit`, `search`

**Response 200 data fields per row:**
`account_id`, `account_name`, `account_email`, `storage_used_mb`, `storage_limit_mb`, `credit_balance`, `free_receipts_used`, `free_receipts_limit`, `total_receipts`, `total_expenses`, `registered_devices`

---

## Error Responses

All endpoints use the same error format:

| Status Code | When |
|---|---|
| `400` | Missing required field or invalid value |
| `401` | Missing or invalid token |
| `403` | Forbidden (insufficient permission) |
| `404` | Resource not found |
| `500` | Internal server error |

```json
{
  "status_code": 401,
  "status": "Unauthorized",
  "message": "You're not authorized from accessing the server.",
  "data": []
}
```

---

## Database Migration

Run before deploying Super Admin module:

```bash
mysql -u <user> -p <database> < DB/008_super_admin_password_reset.sql
```

This creates the `admin_password_reset` table used by the forgot-password / reset-password flow.

---

## 10. Tax Category Management

> Represents Malaysian LHDN tax relief categories per year. Each `tax_code` may only appear **once per year** — enforced at both the application and database level.

### 10.1 List Tax Categories
`GET /superadmin/tax-categories`  
🔒 Requires token

Query params: `page`, `limit`, `search`, `status`, `year` (e.g. `?year=2024`)

**Response 200:**
```json
{
  "data": {
    "categories": [
      {
        "tax_id": 1,
        "tax_code": "MED",
        "tax_title": "Medical Expenses",
        "tax_description": "Medical treatment for self, spouse or child",
        "tax_max_claim": 10000.00,
        "tax_year": 2024,
        "tax_mapping_status": "Official",
        "status": "Active",
        "created_date": "2024-01-01T00:00:00.000Z"
      }
    ],
    "total": 25,
    "page": 1,
    "limit": 20,
    "totalPages": 2
  }
}
```

---

### 10.2 Tax Category Stats
`GET /superadmin/tax-categories/stats`  
🔒 Requires token

**Response 200:**
```json
{
  "data": {
    "total_categories": 25,
    "active_categories": 20,
    "inactive_categories": 3,
    "deleted_categories": 2,
    "total_max_claim": 85000.00
  }
}
```

---

### 10.3 Get Tax Category Details
`GET /superadmin/tax-categories/:tax_id`  
🔒 Requires token

---

### 10.4 Create Tax Category
`POST /superadmin/tax-categories`  
🔒 Requires token

**Request Body:**
```json
{
  "tax_code": "MED",
  "tax_title": "Medical Expenses",
  "tax_description": "Medical treatment for self, spouse or child",
  "tax_max_claim": 10000.00,
  "tax_year": 2025,
  "tax_mapping_status": "Draft",
  "tax_published_date": null,
  "tax_based_on_year": 2024,
  "tax_requires_receipt": "Yes",
  "tax_claim_for": "Self",
  "tax_frequency": "Yearly",
  "tax_sort_order": 1,
  "tax_claim_type": "Self",
  "tax_is_auto_claim": "No",
  "status": "Active"
}
```

`tax_mapping_status` values: `Draft | Preliminary | Official | Archived`  
`tax_claim_for` values: `Self | Spouse | Child | Parent | Dependant` (multiple allowed)  
`tax_frequency` values: `Yearly | Once Every 2 Years | Lifetime`

> **Duplicate check:** If `tax_code` already exists for the given `tax_year`, returns `400`:
> ```json
> { "message": "Tax category with code \"MED\" already exists for year 2025. Each year may only have one entry per code." }
> ```

---

### 10.5 Update Tax Category
`PUT /superadmin/tax-categories/:tax_id`  
🔒 Requires token

**Allowed fields:** `tax_title`, `tax_description`, `tax_max_claim`, `tax_content`, `tax_mapping_status`, `tax_published_date`, `tax_based_on_year`, `tax_eligibility_criteria`, `tax_requires_receipt`, `tax_claim_for`, `tax_frequency`, `tax_sort_order`, `tax_claim_type`, `tax_is_auto_claim`

> To change `tax_code` or `tax_year`, provide **both** fields together. Duplicate check is applied automatically.

---

### 10.6 Update Tax Category Status
`PUT /superadmin/tax-categories/:tax_id/status`  
🔒 Requires token

**Request Body:** `{ "status": "Archived" }`  
Values: `Active | Inactive | Deleted | Others`

---

### 10.7 Delete Tax Category
`DELETE /superadmin/tax-categories/:tax_id`  
🔒 Requires token  
> Soft delete — sets `status = 'Deleted'`.

---

## 11. Tax Subcategory Management

> Subcategories belong to a parent `tax_category`. Each `taxsub_code` must be unique within its parent category. Filtering by `tax_id` returns all subcategories under a specific category.

### 11.1 List Tax Subcategories
`GET /superadmin/tax-subcategories`  
🔒 Requires token

Query params: `page`, `limit`, `search`, `status`, `tax_id` (filter by parent category)

**Response 200:**
```json
{
  "data": {
    "subcategories": [
      {
        "taxsub_id": 1,
        "taxsub_code": "MED-SELF",
        "taxsub_title": "Medical for Self",
        "taxsub_max_claim": 5000.00,
        "taxsub_claim_for": "Self",
        "taxsub_requires_receipt": "Yes",
        "tax_id": 1,
        "tax_category_name": "Medical Expenses",
        "status": "Active"
      }
    ],
    "total": 48,
    "page": 1,
    "limit": 20,
    "totalPages": 3
  }
}
```

---

### 11.2 Tax Subcategory Stats
`GET /superadmin/tax-subcategories/stats`  
🔒 Requires token

---

### 11.3 Get Tax Subcategory Details
`GET /superadmin/tax-subcategories/:taxsub_id`  
🔒 Requires token

---

### 11.4 Create Tax Subcategory
`POST /superadmin/tax-subcategories`  
🔒 Requires token

**Request Body:**
```json
{
  "tax_id": 1,
  "taxsub_code": "MED-SELF",
  "taxsub_title": "Medical for Self",
  "taxsub_description": "Medical treatment for self only",
  "taxsub_max_claim": 5000.00,
  "taxsub_claim_for": "Self",
  "taxsub_requires_receipt": "Yes",
  "taxsub_sort_order": 1,
  "taxsub_tags": ["medical", "self"],
  "status": "Active"
}
```

> **Duplicate check:** If `taxsub_code` already exists under the same `tax_id`, returns `400`.

---

### 11.5 Update Tax Subcategory
`PUT /superadmin/tax-subcategories/:taxsub_id`  
🔒 Requires token

**Allowed fields:** `taxsub_title`, `taxsub_description`, `taxsub_content`, `taxsub_max_claim`, `taxsub_tags`, `taxsub_claim_for`, `taxsub_requires_receipt`, `taxsub_sort_order`

> To change `taxsub_code` or `tax_id`, provide **both** fields together. Duplicate check is applied.

---

### 11.6 Update Tax Subcategory Status
`PUT /superadmin/tax-subcategories/:taxsub_id/status`  
🔒 Requires token

**Request Body:** `{ "status": "Inactive" }`  
Values: `Active | Inactive | Deleted | Others`

---

### 11.7 Delete Tax Subcategory
`DELETE /superadmin/tax-subcategories/:taxsub_id`  
🔒 Requires token  
> Soft delete — sets `status = 'Deleted'`.
