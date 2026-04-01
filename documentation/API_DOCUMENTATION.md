# TaxLah API Documentation

## Table of Contents
1. [Overview](#overview)
2. [Authentication](#authentication)
3. [API Response Format](#api-response-format)
4. [App API Endpoints](#app-api-endpoints)
5. [Admin API Endpoints](#admin-api-endpoints)
6. [File Upload Endpoints](#file-upload-endpoints)
7. [Error Codes](#error-codes)
8. [Data Models](#data-models)

---

## Overview

**Base URL**: `http://localhost:3000` (configurable via PORT env variable)

**API Version**: 1.0.0

**Tech Stack**:
- Node.js + Express.js
- MySQL Database
- JWT Authentication
- Bcrypt for password hashing
- Azure Document Intelligence for receipt extraction
- Multer for file uploads

---

## Authentication

### Authentication Methods

#### User Authentication (App API)
- **Type**: Bearer Token (JWT)
- **Header**: `Authorization: Bearer <access_token>`
- **Secret**: `APP_SECRET` environment variable
- **Endpoints Protected**: Most `/api/*` endpoints

#### Admin Authentication (Admin API)
- **Type**: Bearer Token (JWT)
- **Header**: `Authorization: Bearer <admin_token>`
- **Secret**: `ADMIN_SECRET` environment variable
- **Endpoints Protected**: All `/admin/*` endpoints

### Token Structure
```json
{
  "uid": "auth_id",
  "aid": "account_id",
  "username": "user123",
  "usermail": "user@example.com",
  "account_name": "John Doe",
  "account_fullname": "John Michael Doe",
  "account_email": "user@example.com",
  "account_contact": "+60123456789"
}
```

---

## API Response Format

### Standard Response Structure

#### Success Response
```json
{
  "status_code": 200,
  "status": "success",
  "message": "Operation successful",
  "data": {}
}
```

#### Error Response
```json
{
  "status_code": 400,
  "status": "error",
  "message": "Error description",
  "data": null
}
```

### HTTP Status Codes
- `200` - Success
- `201` - Created
- `400` - Bad Request
- `401` - Unauthorized
- `403` - Forbidden
- `404` - Not Found
- `500` - Internal Server Error

---

## App API Endpoints

Base Path: `/api`

### 1. Authentication

#### POST /api/auth/onboard
Register a new user account.

**Request Body:**
```json
{
  "account_username": "john_doe",
  "account_password": "SecurePass123!",
  "account_role": "Individual",
  "account_name": "John Doe",
  "account_fullname": "John Michael Doe",
  "account_email": "john@example.com",
  "account_phone": "+60123456789"
}
```

**Password Requirements:**
- Minimum 8 characters
- At least 1 uppercase letter
- At least 1 lowercase letter
- At least 1 number
- At least 1 special character

**Response:**
```json
{
  "status_code": 200,
  "status": "success",
  "message": "Congratulation! Your account has been created successfully.",
  "data": null
}
```

**Notes:**
- Automatically creates welcome notification
- Sends onboarding email
- Sets account status to 'Active'
- Sets auth_is_verified to 'Yes'

---

#### POST /api/auth/signin
Login to user account.

**Request Body:**
```json
{
  "auth_username": "john_doe",
  "auth_password": "SecurePass123!"
}
```

**Note**: `auth_username` can be either username or email address.

**Response:**
```json
{
  "status_code": 200,
  "status": "success",
  "message": "Login Successful.",
  "data": {
    "profile": {
      "uid": 1,
      "aid": 1,
      "username": "john_doe",
      "usermail": "john@example.com",
      "account_name": "John Doe",
      "account_fullname": "John Michael Doe",
      "account_email": "john@example.com",
      "account_contact": "+60123456789"
    },
    "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

---

#### POST /api/auth/authenticate
Verify and refresh access token.

**Headers:**
```
Authorization: Bearer <access_token>
```

**Response:**
```json
{
  "status_code": 200,
  "status": "success",
  "message": "Token validated successfully",
  "data": {
    "profile": {},
    "access_token": "new_token"
  }
}
```

---

### 2. User Profile

#### GET /api/profile
Get user profile information. 🔒 **Requires Authentication**

**Headers:**
```
Authorization: Bearer <access_token>
```

**Response:**
```json
{
  "status_code": 200,
  "status": "success",
  "message": "Profile retrieved successfully",
  "data": {
    "account_id": 1,
    "account_name": "John Doe",
    "account_fullname": "John Michael Doe",
    "account_email": "john@example.com",
    "account_contact": "+60123456789",
    "account_address_1": "123 Main Street",
    "account_address_2": "Apartment 4B",
    "account_address_3": null,
    "account_address_postcode": "50000",
    "account_address_city": "Kuala Lumpur",
    "account_address_state": "Wilayah Persekutuan",
    "account_profile_image": "https://...",
    "account_status": "Active",
    "created_date": "2024-01-01T00:00:00.000Z"
  }
}
```

---

#### PATCH/PUT /api/profile
Update user profile. 🔒 **Requires Authentication**

**Request Body:**
```json
{
  "account_name": "John Updated",
  "account_fullname": "John Michael Updated",
  "account_contact": "+60123456789",
  "account_address_1": "456 New Street",
  "account_address_2": "Suite 10",
  "account_address_postcode": "50200",
  "account_address_city": "Kuala Lumpur",
  "account_address_state": "Wilayah Persekutuan",
  "account_profile_image": "https://..."
}
```

**Response:**
```json
{
  "status_code": 200,
  "status": "success",
  "message": "Profile updated successfully",
  "data": null
}
```

---

#### DELETE /api/profile
Delete user account. 🔒 **Requires Authentication**

**Response:**
```json
{
  "status_code": 200,
  "status": "success",
  "message": "Account deleted successfully",
  "data": null
}
```

---

### 3. Receipts

#### GET /api/receipt/list
Get paginated list of user receipts. 🔒 **Requires Authentication**

**Query Parameters:**
- `page` (optional) - Page number (default: 1)
- `limit` (optional) - Items per page (default: 10)
- `search` (optional) - Search by receipt name or description
- `rc_id` (optional) - Filter by receipt category ID
- `status` (optional) - Filter by status (Active, Inactive, Deleted)
- `sortBy` (optional) - Sort field (created_date, receipt_amount)
- `sortOrder` (optional) - Sort order (ASC, DESC)

**Example Request:**
```
GET /api/receipt/list?page=1&limit=10&search=groceries&sortBy=created_date&sortOrder=DESC
```

**Response:**
```json
{
  "status_code": 200,
  "status": "success",
  "message": "Receipts retrieved successfully.",
  "data": {
    "receipts": [
      {
        "receipt_id": 1,
        "account_id": 1,
        "rc_id": 2,
        "rc_name": "Food & Beverages",
        "receipt_name": "Grocery Shopping",
        "receipt_description": "Weekly groceries",
        "receipt_amount": 156.80,
        "receipt_items": "[{\"name\":\"Milk\",\"price\":5.50}]",
        "receipt_image_url": "https://...",
        "receipt_metadata": null,
        "status": "Active",
        "created_date": "2024-01-15T10:30:00.000Z"
      }
    ],
    "pagination": {
      "total": 50,
      "page": 1,
      "limit": 10,
      "total_pages": 5
    }
  }
}
```

---

#### GET /api/receipt/details
Get receipt details by ID. 🔒 **Requires Authentication**

**Query Parameters:**
- `receipt_id` (required) - Receipt ID

**Example Request:**
```
GET /api/receipt/details?receipt_id=1
```

**Response:**
```json
{
  "status_code": 200,
  "status": "success",
  "message": "Receipt details retrieved successfully.",
  "data": {
    "receipt_id": 1,
    "account_id": 1,
    "rc_id": 2,
    "rc_name": "Food & Beverages",
    "receipt_name": "Grocery Shopping",
    "receipt_description": "Weekly groceries",
    "receipt_amount": 156.80,
    "receipt_items": [
      {
        "name": "Milk",
        "price": 5.50,
        "quantity": 2
      }
    ],
    "receipt_image_url": "https://...",
    "receipt_metadata": {
      "merchant": "Tesco",
      "location": "KLCC"
    },
    "status": "Active",
    "created_date": "2024-01-15T10:30:00.000Z",
    "last_modified": "2024-01-15T10:30:00.000Z"
  }
}
```

---

#### POST /api/receipt/create
Create a new receipt. 🔒 **Requires Authentication**

**Request Body:**
```json
{
  "rc_id": 2,
  "receipt_name": "Grocery Shopping",
  "receipt_description": "Weekly groceries",
  "receipt_amount": 156.80,
  "receipt_items": [
    {
      "name": "Milk",
      "price": 5.50,
      "quantity": 2
    },
    {
      "name": "Bread",
      "price": 4.20,
      "quantity": 1
    }
  ],
  "receipt_image_url": "https://storage.example.com/receipts/img123.jpg",
  "receipt_metadata": {
    "merchant": "Tesco",
    "location": "KLCC"
  },
  "tax_id": 5,
  "taxsub_id": 12,
  "tax_year": 2024
}
```

**Field Descriptions:**
- `rc_id` - Receipt category ID (optional)
- `receipt_name` - Name/title of receipt (optional)
- `receipt_description` - Description (optional)
- `receipt_amount` - Total amount (required, must be >= 0)
- `receipt_items` - Array of items or JSON string (optional)
- `receipt_image_url` - Image URL (required)
- `receipt_metadata` - Additional metadata as JSON (optional)
- `tax_id` - Tax category ID for tax relief claim (optional)
- `taxsub_id` - Tax subcategory ID (optional)
- `tax_year` - Tax year for claim (default: current year)

**Response:**
```json
{
  "status_code": 200,
  "status": "success",
  "message": "Receipt created successfully.",
  "data": {
    "receipt_id": 123,
    "account_id": 1,
    "rc_id": 2,
    "receipt_name": "Grocery Shopping",
    "receipt_amount": 156.80,
    "tax_claim": {
      "success": true,
      "claim_id": 45,
      "claimed_amount": 156.80,
      "limit_reached": false,
      "limit_message": null
    }
  }
}
```

---

#### PUT /api/receipt/update
Update an existing receipt. 🔒 **Requires Authentication**

**Request Body:**
```json
{
  "receipt_id": 1,
  "rc_id": 2,
  "receipt_name": "Updated Receipt Name",
  "receipt_description": "Updated description",
  "receipt_amount": 200.00,
  "receipt_items": [...],
  "receipt_metadata": {...}
}
```

**Response:**
```json
{
  "status_code": 200,
  "status": "success",
  "message": "Receipt updated successfully.",
  "data": null
}
```

---

#### DELETE /api/receipt/delete
Delete a receipt. 🔒 **Requires Authentication**

**Request Body:**
```json
{
  "receipt_id": 1
}
```

**Response:**
```json
{
  "status_code": 200,
  "status": "success",
  "message": "Receipt deleted successfully.",
  "data": null
}
```

---

#### GET /api/receipt/stats
Get receipt statistics for the user. 🔒 **Requires Authentication**

**Query Parameters:**
- `year` (optional) - Filter by year (default: current year)
- `month` (optional) - Filter by month (1-12)

**Response:**
```json
{
  "status_code": 200,
  "status": "success",
  "message": "Receipt statistics retrieved successfully.",
  "data": {
    "total_receipts": 150,
    "total_amount": 15680.50,
    "by_category": [
      {
        "rc_id": 2,
        "rc_name": "Food & Beverages",
        "count": 45,
        "total_amount": 4520.00
      }
    ],
    "by_month": [
      {
        "month": 1,
        "count": 12,
        "total_amount": 1200.00
      }
    ]
  }
}
```

---

### 4. Receipt Categories

#### GET /api/receipt-category/list
Get list of all receipt categories.

**Response:**
```json
{
  "status_code": 200,
  "status": "success",
  "message": "Receipt categories retrieved successfully.",
  "data": [
    {
      "rc_id": 1,
      "rc_name": "Transportation",
      "rc_description": "Transport related expenses",
      "rc_icon": "🚗",
      "status": "Active"
    },
    {
      "rc_id": 2,
      "rc_name": "Food & Beverages",
      "rc_description": "Food and drink expenses",
      "rc_icon": "🍔",
      "status": "Active"
    }
  ]
}
```

---

#### GET /api/receipt-category/details
Get receipt category details.

**Query Parameters:**
- `rc_id` (required) - Receipt category ID

**Response:**
```json
{
  "status_code": 200,
  "status": "success",
  "message": "Category details retrieved successfully.",
  "data": {
    "rc_id": 1,
    "rc_name": "Transportation",
    "rc_description": "Transport related expenses",
    "rc_icon": "🚗",
    "status": "Active",
    "created_date": "2024-01-01T00:00:00.000Z"
  }
}
```

---

#### GET /api/receipt-category/options
Get receipt categories as dropdown options.

**Response:**
```json
{
  "status_code": 200,
  "status": "success",
  "message": "Category options retrieved successfully.",
  "data": [
    {
      "value": 1,
      "label": "Transportation"
    },
    {
      "value": 2,
      "label": "Food & Beverages"
    }
  ]
}
```

---

### 5. Tax Categories

#### GET /api/tax-category
Get list of all tax categories and subcategories.

**Response:**
```json
{
  "status_code": 200,
  "status": "success",
  "message": "Tax categories retrieved successfully.",
  "data": [
    {
      "tax_id": 1,
      "tax_name": "Individual Relief",
      "tax_code": "IR001",
      "tax_description": "Individual tax relief",
      "tax_max_claim": 9000.00,
      "status": "Active",
      "subcategories": [
        {
          "taxsub_id": 1,
          "taxsub_name": "Self",
          "taxsub_code": "IR001-SELF",
          "taxsub_max_claim": 9000.00,
          "status": "Active"
        }
      ]
    }
  ]
}
```

---

### 6. Tax Claims

#### GET /api/tax/claims/:year
Get user's tax claims for a specific year. 🔒 **Requires Authentication**

**Path Parameters:**
- `year` - Tax year (e.g., 2024)

**Example Request:**
```
GET /api/tax/claims/2024
```

**Response:**
```json
{
  "status_code": 200,
  "status": "success",
  "message": "Tax claims retrieved successfully.",
  "data": {
    "claims": [
      {
        "claim_id": 1,
        "account_id": 1,
        "tax_id": 5,
        "taxsub_id": 12,
        "tax_name": "Medical Expenses",
        "taxsub_name": "Parents Medical",
        "claimed_amount": 2500.00,
        "max_claimable": 8000.00,
        "remaining_claimable": 5500.00,
        "percentage_used": 31.25,
        "receipts_count": 5,
        "tax_year": 2024,
        "status": "Active"
      }
    ],
    "summary": {
      "total_claimed": 15600.00,
      "total_max_claimable": 50000.00,
      "categories_count": 8,
      "receipts_count": 45
    }
  }
}
```

---

#### GET /api/tax/claims/:year/summary
Get summary of tax claims for a year. 🔒 **Requires Authentication**

**Path Parameters:**
- `year` - Tax year

**Response:**
```json
{
  "status_code": 200,
  "status": "success",
  "message": "Tax claim summary retrieved successfully.",
  "data": {
    "tax_year": 2024,
    "total_claimed": 15600.00,
    "total_max_possible": 50000.00,
    "percentage_utilized": 31.2,
    "categories_claimed": 8,
    "total_receipts": 45,
    "potential_savings": 5460.00,
    "by_category": [
      {
        "tax_name": "Medical Expenses",
        "claimed": 2500.00,
        "max": 8000.00,
        "percentage": 31.25
      }
    ]
  }
}
```

---

#### POST /api/tax/claims/recalculate
Recalculate all tax claims for a user. 🔒 **Requires Authentication**

**Request Body:**
```json
{
  "year": 2024
}
```

**Response:**
```json
{
  "status_code": 200,
  "status": "success",
  "message": "Tax claims recalculated successfully.",
  "data": {
    "updated_claims": 8,
    "total_claimed": 15600.00
  }
}
```

---

#### GET /api/tax/remaining/:tax_id
Get remaining claimable amount for a tax category. 🔒 **Requires Authentication**

**Path Parameters:**
- `tax_id` - Tax category ID

**Query Parameters:**
- `year` (optional) - Tax year (default: current year)
- `taxsub_id` (optional) - Tax subcategory ID

**Response:**
```json
{
  "status_code": 200,
  "status": "success",
  "message": "Remaining claimable retrieved successfully.",
  "data": {
    "tax_id": 5,
    "taxsub_id": 12,
    "max_claimable": 8000.00,
    "claimed_amount": 2500.00,
    "remaining_claimable": 5500.00,
    "percentage_used": 31.25
  }
}
```

---

#### POST /api/tax/auto-relief
Add automatic tax reliefs based on user profile. 🔒 **Requires Authentication**

**Request Body:**
```json
{
  "year": 2024
}
```

**Response:**
```json
{
  "status_code": 200,
  "status": "success",
  "message": "Auto relief claims added successfully.",
  "data": {
    "added_reliefs": [
      {
        "tax_name": "Individual Relief",
        "amount": 9000.00
      }
    ]
  }
}
```

---

#### POST /api/tax/categorize-receipt
Categorize a receipt for tax relief using AI. 🔒 **Requires Authentication**

**Request Body:**
```json
{
  "receipt_id": 123
}
```

**Response:**
```json
{
  "status_code": 200,
  "status": "success",
  "message": "Receipt categorized successfully.",
  "data": {
    "tax_id": 5,
    "taxsub_id": 12,
    "tax_name": "Medical Expenses",
    "taxsub_name": "Parents Medical",
    "confidence": 0.92
  }
}
```

---

### 7. Dependants

#### GET /api/dependant
Get list of user's dependants. 🔒 **Requires Authentication**

**Query Parameters:**
- `type` (optional) - Filter by type (Spouse, Child, Parent, Sibling)
- `status` (optional) - Filter by status (default: Active)

**Response:**
```json
{
  "status_code": 200,
  "status": "success",
  "message": "Dependants retrieved successfully.",
  "data": [
    {
      "dependant_id": 1,
      "account_id": 1,
      "dependant_name": "Jane Doe",
      "dependant_ic": "950101-01-0001",
      "dependant_type": "Spouse",
      "dependant_relationship": "Wife",
      "dependant_dob": "1995-01-01",
      "dependant_age": 29,
      "is_disabled": false,
      "disability_type": null,
      "is_studying": false,
      "education_level": null,
      "institution_name": null,
      "status": "Active",
      "created_date": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

---

#### GET /api/dependant/stats
Get dependant statistics. 🔒 **Requires Authentication**

**Response:**
```json
{
  "status_code": 200,
  "status": "success",
  "message": "Dependant statistics retrieved successfully.",
  "data": {
    "total_dependants": 5,
    "by_type": {
      "Spouse": 1,
      "Child": 3,
      "Parent": 1
    },
    "disabled_count": 1,
    "studying_count": 2
  }
}
```

---

#### GET /api/dependant/child-relief
Calculate child relief eligibility. 🔒 **Requires Authentication**

**Query Parameters:**
- `year` (optional) - Tax year (default: current year)

**Response:**
```json
{
  "status_code": 200,
  "status": "success",
  "message": "Child relief eligibility calculated successfully.",
  "data": {
    "eligible_children": 2,
    "relief_per_child": 2000.00,
    "total_relief": 4000.00,
    "children": [
      {
        "dependant_id": 2,
        "dependant_name": "Tommy Doe",
        "age": 8,
        "eligible": true
      }
    ]
  }
}
```

---

#### GET /api/dependant/:id
Get dependant details by ID. 🔒 **Requires Authentication**

**Path Parameters:**
- `id` - Dependant ID

**Response:**
```json
{
  "status_code": 200,
  "status": "success",
  "message": "Dependant details retrieved successfully.",
  "data": {
    "dependant_id": 1,
    "account_id": 1,
    "dependant_name": "Jane Doe",
    "dependant_ic": "950101-01-0001",
    "dependant_type": "Spouse",
    "dependant_relationship": "Wife",
    "dependant_dob": "1995-01-01",
    "dependant_age": 29,
    "is_disabled": false,
    "disability_type": null,
    "is_studying": false,
    "education_level": null,
    "institution_name": null,
    "status": "Active"
  }
}
```

---

#### POST /api/dependant
Create a new dependant. 🔒 **Requires Authentication**

**Request Body:**
```json
{
  "dependant_name": "Jane Doe",
  "dependant_ic": "950101-01-0001",
  "dependant_type": "Spouse",
  "dependant_relationship": "Wife",
  "dependant_dob": "1995-01-01",
  "is_disabled": false,
  "disability_type": null,
  "is_studying": false,
  "education_level": null,
  "institution_name": null
}
```

**Dependant Types:**
- `Spouse` - Husband/Wife
- `Child` - Son/Daughter
- `Parent` - Father/Mother
- `Sibling` - Brother/Sister

**Response:**
```json
{
  "status_code": 200,
  "status": "success",
  "message": "Dependant created successfully.",
  "data": {
    "dependant_id": 5
  }
}
```

---

#### PUT /api/dependant/:id
Update a dependant. 🔒 **Requires Authentication**

**Path Parameters:**
- `id` - Dependant ID

**Request Body:** (Same as create, all fields optional)

**Response:**
```json
{
  "status_code": 200,
  "status": "success",
  "message": "Dependant updated successfully.",
  "data": null
}
```

---

#### DELETE /api/dependant/:id
Delete a dependant. 🔒 **Requires Authentication**

**Path Parameters:**
- `id` - Dependant ID

**Response:**
```json
{
  "status_code": 200,
  "status": "success",
  "message": "Dependant deleted successfully.",
  "data": null
}
```

---

### 8. Reports

#### GET /api/report/types
Get available report types and their credit costs.

**Response:**
```json
{
  "status_code": 200,
  "status": "success",
  "message": "Report types retrieved successfully.",
  "data": [
    {
      "type": "basic",
      "name": "Basic Tax Report",
      "credits": 10,
      "features": [
        "Tax summary",
        "Category breakdown"
      ],
      "description": "Simple tax relief summary"
    },
    {
      "type": "detailed",
      "name": "Detailed Tax Report",
      "credits": 25,
      "features": [
        "Full tax summary",
        "Receipt details",
        "Charts and graphs"
      ],
      "description": "Comprehensive tax report with visualizations"
    },
    {
      "type": "premium",
      "name": "Premium Tax Report",
      "credits": 50,
      "features": [
        "Everything in Detailed",
        "Tax optimization tips",
        "Year-over-year comparison"
      ],
      "description": "Premium report with tax optimization insights"
    }
  ]
}
```

---

#### GET /api/report/preview/:year
Preview report data without generating PDF (Free). 🔒 **Requires Authentication**

**Path Parameters:**
- `year` - Tax year

**Response:**
```json
{
  "status_code": 200,
  "status": "success",
  "message": "Report preview data retrieved successfully.",
  "data": {
    "tax_year": 2024,
    "user": {
      "name": "John Doe",
      "email": "john@example.com",
      "ic": "900101-01-0001"
    },
    "summary": {
      "total_claimed": 15600.00,
      "max_possible": 50000.00,
      "categories_claimed": 8,
      "percentage_utilized": 31.2
    },
    "receipts_count": 45,
    "dependants_count": 3,
    "available_reports": [...]
  }
}
```

---

#### POST /api/report/generate
Generate a tax report PDF (Costs Credits). 🔒 **Requires Authentication**

**Request Body:**
```json
{
  "year": 2024,
  "report_type": "detailed"
}
```

**Report Types:**
- `basic` - 10 credits
- `detailed` - 25 credits
- `premium` - 50 credits

**Response:**
```json
{
  "status_code": 200,
  "status": "success",
  "message": "Report generated successfully.",
  "data": {
    "report_url": "https://storage.example.com/reports/report_123.pdf",
    "report_id": "report_123",
    "credits_deducted": 25,
    "remaining_credits": 75
  }
}
```

---

#### GET /api/report/download/:report_id
Download a previously generated report. 🔒 **Requires Authentication**

**Path Parameters:**
- `report_id` - Report ID

**Response:** PDF file download

---

### 9. Credits

#### GET /api/credit/balance
Get user's credit balance. 🔒 **Requires Authentication**

**Response:**
```json
{
  "status_code": 200,
  "status": "success",
  "message": "Credit balance retrieved successfully.",
  "data": {
    "account_id": 1,
    "total_credits": 100,
    "used_credits": 25,
    "remaining_credits": 75,
    "pending_credits": 0
  }
}
```

---

#### GET /api/credit/check/:amount
Check if user has enough credits. 🔒 **Requires Authentication**

**Path Parameters:**
- `amount` - Required credit amount

**Response:**
```json
{
  "status_code": 200,
  "status": "success",
  "message": "Sufficient credits available.",
  "data": {
    "required": 25,
    "available": 75,
    "hasEnough": true
  }
}
```

---

#### GET /api/credit/transactions
Get credit transaction history. 🔒 **Requires Authentication**

**Query Parameters:**
- `page` (optional) - Page number (default: 1)
- `limit` (optional) - Items per page (default: 20)
- `type` (optional) - Filter by type (Purchase, Usage, Refund)

**Response:**
```json
{
  "status_code": 200,
  "status": "success",
  "message": "Credit transactions retrieved successfully.",
  "data": {
    "transactions": [
      {
        "transaction_id": 1,
        "account_id": 1,
        "amount": 100,
        "type": "Purchase",
        "description": "Credit purchase - 100 credits",
        "reference_id": "order_123",
        "created_date": "2024-01-15T10:00:00.000Z"
      },
      {
        "transaction_id": 2,
        "account_id": 1,
        "amount": -25,
        "type": "Usage",
        "description": "Report generation - Detailed Report",
        "reference_id": "report_456",
        "created_date": "2024-01-15T11:00:00.000Z"
      }
    ],
    "pagination": {
      "total": 15,
      "page": 1,
      "limit": 20,
      "total_pages": 1
    }
  }
}
```

---

#### POST /api/credit/purchase
Create a credit purchase order. 🔒 **Requires Authentication**

**Request Body:**
```json
{
  "package_id": 2,
  "payment_method": "chip"
}
```

**Response:**
```json
{
  "status_code": 200,
  "status": "success",
  "message": "Purchase order created successfully.",
  "data": {
    "order_id": "order_123",
    "package_id": 2,
    "credits": 100,
    "amount": 50.00,
    "currency": "MYR",
    "payment_url": "https://chip.com/checkout/...",
    "status": "Pending"
  }
}
```

---

#### POST /api/credit/webhook
CHIP payment webhook callback (Public endpoint - no auth required)

**Note:** This endpoint is called by CHIP payment gateway and includes signature verification.

**Headers:**
```
x-signature: <webhook_signature>
```

**Request Body:** (Raw JSON from CHIP)
```json
{
  "event_type": "payment.success",
  "purchase_id": "order_123",
  "payment_status": "paid",
  "reference": "REF123",
  "is_paid": true,
  "is_test": false
}
```

**Response:**
```json
{
  "success": true
}
```

---

### 10. Packages

#### GET /api/package
Get available credit packages.

**Response:**
```json
{
  "status_code": 200,
  "status": "success",
  "message": "Packages retrieved successfully.",
  "data": [
    {
      "package_id": 1,
      "package_name": "Starter Pack",
      "package_credits": 50,
      "package_price": 25.00,
      "package_currency": "MYR",
      "package_description": "50 credits for getting started",
      "is_popular": false,
      "discount_percentage": 0,
      "status": "Active"
    },
    {
      "package_id": 2,
      "package_name": "Value Pack",
      "package_credits": 100,
      "package_price": 45.00,
      "package_currency": "MYR",
      "package_description": "100 credits - 10% discount",
      "is_popular": true,
      "discount_percentage": 10,
      "status": "Active"
    },
    {
      "package_id": 3,
      "package_name": "Premium Pack",
      "package_credits": 250,
      "package_price": 100.00,
      "package_currency": "MYR",
      "package_description": "250 credits - 20% discount",
      "is_popular": false,
      "discount_percentage": 20,
      "status": "Active"
    }
  ]
}
```

---

### 11. Notifications

#### GET /api/notification
Get user notifications. 🔒 **Requires Authentication**

**Query Parameters:**
- `page` (optional) - Page number (default: 1)
- `limit` (optional) - Items per page (default: 20)
- `read_status` (optional) - Filter by read status (Yes, No)
- `archive_status` (optional) - Filter by archive status (Yes, No)

**Response:**
```json
{
  "status_code": 200,
  "status": "success",
  "message": "Notifications retrieved successfully.",
  "data": {
    "notifications": [
      {
        "notification_id": 1,
        "account_id": 1,
        "notification_title": "Receipt Created Successfully",
        "notification_description": "Your receipt 'Grocery Shopping' has been created...",
        "notification_type": "Info",
        "read_status": "No",
        "archive_status": "No",
        "created_date": "2024-01-15T10:30:00.000Z"
      }
    ],
    "unread_count": 5,
    "pagination": {
      "total": 25,
      "page": 1,
      "limit": 20
    }
  }
}
```

---

### 12. Device Management

#### GET /api/device
Get all active registered devices for the authenticated user. 🔒 **Requires Authentication**

**Response:**
```json
{
  "status_code": 200,
  "status": "success",
  "message": "Operation successful",
  "data": [
    {
      "device_id": 5,
      "account_id": 1,
      "device_uuid": "550e8400-e29b-41d4-a716-446655440000",
      "device_name": "iPhone 13",
      "device_os": "IOS",
      "device_enable_fcm": "Yes",
      "device_fcm_token": "fcm-token-abc123",
      "device_status": "Active",
      "created_date": "2026-01-15T08:00:00.000Z",
      "last_modified": "2026-04-01T10:30:00.000Z"
    }
  ]
}
```

---

#### POST /api/device
Register a device for push notifications. If the `device_uuid` already exists for the account, the existing record is updated (FCM token refreshed, device re-activated) instead of creating a duplicate. 🔒 **Requires Authentication**

**Request Body:**
```json
{
  "device_uuid": "550e8400-e29b-41d4-a716-446655440000",
  "device_name": "iPhone 13",
  "device_os": "IOS",
  "device_fcm_token": "fcm-token-abc123",
  "device_enable_fcm": "Yes"
}
```

**Request Parameters:**

| Field | Type | Required | Description |
|---|---|---|---|
| `device_uuid` | string | ✅ | Unique device identifier (e.g. from `react-native-device-info`) |
| `device_name` | string | ✅ | Human-readable device name |
| `device_os` | string | ✅ | `Android` or `IOS` |
| `device_fcm_token` | string | — | Firebase Cloud Messaging token for push notifications |
| `device_enable_fcm` | string | — | `Yes` (default) or `No` |

**Response (New device):**
```json
{
  "status_code": 200,
  "status": "success",
  "message": "Device registered successfully.",
  "data": {
    "device_id": 5,
    "is_new": true
  }
}
```

**Response (Existing device updated):**
```json
{
  "status_code": 200,
  "status": "success",
  "message": "Device registered successfully.",
  "data": {
    "device_id": 5,
    "is_new": false
  }
}
```

**Error Responses:**

| Status | Message |
|---|---|
| `400` | `device_uuid` / `device_name` / `device_os` / `device_enable_fcm` is undefined or empty |
| `400` | Invalid value for `device_os` — must be `Android` or `IOS` |
| `403` | Unable to register device |

---

#### PATCH /api/device/:device_id
Update a specific device's details including FCM token. 🔒 **Requires Authentication**

**Path Parameters:**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `device_id` | integer | ✅ | The device ID to update |

**Request Body:**
```json
{
  "device_uuid": "550e8400-e29b-41d4-a716-446655440000",
  "device_name": "iPhone 13 Pro",
  "device_os": "IOS",
  "device_fcm_token": "new-fcm-token-xyz789",
  "device_enable_fcm": "Yes"
}
```

**Response:**
```json
{
  "status_code": 200,
  "status": "success",
  "message": "Operation successful",
  "data": 1
}
```

---

#### DELETE /api/device/:device_id
Deregister a device (sets status to `Inactive`). The device will no longer receive push notifications. 🔒 **Requires Authentication**

**Path Parameters:**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `device_id` | integer | ✅ | The device ID to deregister |

**Response:**
```json
{
  "status_code": 200,
  "status": "success",
  "message": "Device deregistered successfully.",
  "data": null
}
```

**Error Responses:**

| Status | Message |
|---|---|
| `400` | `device_id` is undefined or empty |
| `404` | Device not found or does not belong to this account |

---

## Admin API Endpoints

Base Path: `/admin`

**Note:** All admin endpoints require admin authentication using `ADMIN_SECRET`.

### 1. Admin Authentication

#### POST /admin/auth/login
Admin login.

**Request Body:**
```json
{
  "admin_username": "admin",
  "admin_password": "SecureAdminPass123!"
}
```

**Response:**
```json
{
  "status_code": 200,
  "status": "success",
  "message": "Admin login successful.",
  "data": {
    "admin_id": 1,
    "admin_username": "admin",
    "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

---

#### POST /admin/auth/authenticate
Verify admin token. 🔒 **Requires Admin Authentication**

**Response:**
```json
{
  "status_code": 200,
  "status": "success",
  "message": "Admin authenticated successfully.",
  "data": {
    "admin_id": 1,
    "admin_username": "admin"
  }
}
```

---

### 2. User Management

#### GET /admin/users/list
Get list of all users. 🔒 **Requires Admin Authentication**

**Query Parameters:**
- `page` (optional) - Page number
- `limit` (optional) - Items per page
- `search` (optional) - Search by name or email
- `status` (optional) - Filter by status

**Response:**
```json
{
  "status_code": 200,
  "status": "success",
  "message": "Users retrieved successfully.",
  "data": {
    "users": [...],
    "pagination": {...}
  }
}
```

---

#### GET /admin/users/view
Get user details. 🔒 **Requires Admin Authentication**

**Query Parameters:**
- `account_id` (required) - User account ID

---

#### POST /admin/users/create
Create a new user. 🔒 **Requires Admin Authentication**

---

#### PUT /admin/users/update
Update user information. 🔒 **Requires Admin Authentication**

---

#### PATCH /admin/users/status
Update user status. 🔒 **Requires Admin Authentication**

---

#### POST /admin/users/reset-password
Reset user password. 🔒 **Requires Admin Authentication**

---

#### DELETE /admin/users/delete
Delete a user account. 🔒 **Requires Admin Authentication**

---

#### GET /admin/users/stats
Get user statistics. 🔒 **Requires Admin Authentication**

**Response:**
```json
{
  "status_code": 200,
  "status": "success",
  "message": "User statistics retrieved successfully.",
  "data": {
    "total_users": 1250,
    "active_users": 1100,
    "suspended_users": 50,
    "new_users_this_month": 45,
    "by_status": {
      "Active": 1100,
      "Suspended": 50,
      "Pending": 100
    }
  }
}
```

---

#### GET /admin/users/activity
Get user activity logs. 🔒 **Requires Admin Authentication**

---

### 3. Tax Management

#### GET /admin/tax/categories
Get all tax categories. 🔒 **Requires Admin Authentication**

---

#### POST /admin/tax/categories
Create tax category. 🔒 **Requires Admin Authentication**

---

#### PUT /admin/tax/categories
Update tax category. 🔒 **Requires Admin Authentication**

---

#### DELETE /admin/tax/categories
Delete tax category. 🔒 **Requires Admin Authentication**

---

### 4. Merchant Management

#### GET /admin/merchant
Get merchants list. 🔒 **Requires Admin Authentication**

**Query Parameters:**
- `page` (optional)
- `limit` (optional)
- `search` (optional)
- `status` (optional)

---

#### POST /admin/merchant
Create merchant. 🔒 **Requires Admin Authentication**

---

#### PUT /admin/merchant
Update merchant. 🔒 **Requires Admin Authentication**

---

#### PATCH /admin/merchant/status
Update merchant status. 🔒 **Requires Admin Authentication**

---

#### DELETE /admin/merchant
Delete merchant. 🔒 **Requires Admin Authentication**

---

#### GET /admin/merchant/stats
Get merchant statistics. 🔒 **Requires Admin Authentication**

---

### 5. Receipt Management (Admin)

#### GET /admin/receipt/list
Get all receipts. 🔒 **Requires Admin Authentication**

---

#### GET /admin/receipt/details
Get receipt details. 🔒 **Requires Admin Authentication**

---

#### GET /admin/receipt/by-account
Get receipts by account ID. 🔒 **Requires Admin Authentication**

---

#### PUT /admin/receipt/update
Update receipt. 🔒 **Requires Admin Authentication**

---

#### PATCH /admin/receipt/status
Update receipt status. 🔒 **Requires Admin Authentication**

---

#### DELETE /admin/receipt/delete
Delete receipt. 🔒 **Requires Admin Authentication**

---

#### GET /admin/receipt/stats
Get receipt statistics. 🔒 **Requires Admin Authentication**

---

### 6. Receipt Category Management (Admin)

#### GET /admin/receipt-category/list
Get receipt categories. 🔒 **Requires Admin Authentication**

---

#### POST /admin/receipt-category/create
Create receipt category. 🔒 **Requires Admin Authentication**

---

#### PUT /admin/receipt-category/update
Update receipt category. 🔒 **Requires Admin Authentication**

---

#### DELETE /admin/receipt-category/delete
Delete receipt category. 🔒 **Requires Admin Authentication**

---

### 7. Expense Management

#### GET /admin/expense/list
Get expenses list. 🔒 **Requires Admin Authentication**

---

#### GET /admin/expense/details
Get expense details. 🔒 **Requires Admin Authentication**

---

#### PUT /admin/expense/update
Update expense. 🔒 **Requires Admin Authentication**

---

#### PATCH /admin/expense/status
Update expense status. 🔒 **Requires Admin Authentication**

---

#### DELETE /admin/expense/delete
Delete expense. 🔒 **Requires Admin Authentication**

---

#### GET /admin/expense/stats
Get expense statistics. 🔒 **Requires Admin Authentication**

---

### 8. Expense Item Management

#### POST /admin/expense-item/create
Create expense item. 🔒 **Requires Admin Authentication**

---

#### PUT /admin/expense-item/update
Update expense item. 🔒 **Requires Admin Authentication**

---

#### DELETE /admin/expense-item/delete
Delete expense item. 🔒 **Requires Admin Authentication**

---

## File Upload Endpoints

Base Path: `/file-uploader`

### POST /file-uploader
Upload and extract receipt data.

**Request:** Multipart form-data
- `file` - Image file (JPEG, PNG, PDF)

**Response:**
```json
{
  "status_code": 200,
  "status": "success",
  "message": "File uploaded and processed successfully.",
  "data": {
    "file_url": "https://storage.example.com/receipts/img123.jpg",
    "extracted_data": {
      "merchant_name": "Tesco KLCC",
      "total_amount": 156.80,
      "date": "2024-01-15",
      "items": [
        {
          "name": "Milk",
          "quantity": 2,
          "price": 5.50
        }
      ]
    }
  }
}
```

---

### POST /file-uploader/v2
Enhanced file upload with better extraction (Version 2).

**Request:** Multipart form-data
- `file` - Image file

**Response:** Similar to v1 with enhanced extraction accuracy.

---

## Error Codes

### Common Error Responses

#### 400 Bad Request
```json
{
  "status_code": 400,
  "status": "error",
  "message": "Error. Undefined parameter or field is empty.",
  "data": null
}
```

#### 401 Unauthorized
```json
{
  "status_code": 401,
  "status": "error",
  "message": "Error. Authentication token is missing or invalid.",
  "data": null
}
```

#### 403 Forbidden
```json
{
  "status_code": 403,
  "status": "error",
  "message": "Error. You don't have permission to access this resource.",
  "data": null
}
```

#### 404 Not Found
```json
{
  "status_code": 404,
  "status": "error",
  "message": "Route /api/invalid not found",
  "data": null
}
```

#### 500 Internal Server Error
```json
{
  "status_code": 500,
  "status": "error",
  "message": "Error! Please contact our support for more information.",
  "data": null
}
```

---

## Data Models

### Account Model
```typescript
{
  account_id: number,
  account_secret_key: string,
  account_name: string,
  account_fullname: string,
  account_email: string,
  account_contact: string,
  account_address_1: string,
  account_address_2: string,
  account_address_3: string,
  account_address_postcode: string,
  account_address_city: string,
  account_address_state: string,
  account_profile_image: string,
  account_status: 'Pending' | 'Active' | 'Suspended' | 'Others',
  created_date: datetime,
  last_modified: datetime
}
```

---

### Receipt Model
```typescript
{
  receipt_id: number,
  account_id: number,
  rc_id: number,
  receipt_name: string,
  receipt_description: string,
  receipt_amount: decimal,
  receipt_items: JSON,
  receipt_image_url: string,
  receipt_metadata: JSON,
  status: 'Active' | 'Inactive' | 'Deleted',
  created_date: datetime,
  last_modified: datetime
}
```

---

### Tax Category Model
```typescript
{
  tax_id: number,
  tax_name: string,
  tax_code: string,
  tax_description: string,
  tax_max_claim: decimal,
  tax_type: string,
  status: 'Active' | 'Inactive',
  created_date: datetime,
  last_modified: datetime
}
```

---

### Tax Subcategory Model
```typescript
{
  taxsub_id: number,
  tax_id: number,
  taxsub_name: string,
  taxsub_code: string,
  taxsub_description: string,
  taxsub_max_claim: decimal,
  status: 'Active' | 'Inactive',
  created_date: datetime,
  last_modified: datetime
}
```

---

### Tax Claim Model
```typescript
{
  claim_id: number,
  account_id: number,
  tax_id: number,
  taxsub_id: number,
  claimed_amount: decimal,
  max_claimable: decimal,
  tax_year: number,
  status: 'Active' | 'Inactive',
  created_date: datetime,
  last_modified: datetime
}
```

---

### Dependant Model
```typescript
{
  dependant_id: number,
  account_id: number,
  dependant_name: string,
  dependant_ic: string,
  dependant_type: 'Spouse' | 'Child' | 'Parent' | 'Sibling',
  dependant_relationship: string,
  dependant_dob: date,
  dependant_age: number,
  is_disabled: boolean,
  disability_type: string,
  is_studying: boolean,
  education_level: string,
  institution_name: string,
  status: 'Active' | 'Inactive',
  created_date: datetime,
  last_modified: datetime
}
```

---

### Notification Model
```typescript
{
  notification_id: number,
  account_id: number,
  notification_title: string,
  notification_description: string,
  notification_type: 'Info' | 'Warning' | 'Error' | 'Success',
  read_status: 'Yes' | 'No',
  archive_status: 'Yes' | 'No',
  status: 'Active' | 'Inactive',
  created_date: datetime,
  last_modified: datetime
}
```

---

### Credit Transaction Model
```typescript
{
  transaction_id: number,
  account_id: number,
  amount: number,
  type: 'Purchase' | 'Usage' | 'Refund',
  description: string,
  reference_id: string,
  status: 'Completed' | 'Pending' | 'Failed',
  created_date: datetime
}
```

---

### Package Model
```typescript
{
  package_id: number,
  package_name: string,
  package_credits: number,
  package_price: decimal,
  package_currency: string,
  package_description: string,
  is_popular: boolean,
  discount_percentage: number,
  status: 'Active' | 'Inactive',
  created_date: datetime
}
```

---

## Additional Notes

### Rate Limiting
Currently no rate limiting is implemented. Consider implementing rate limiting for production environments.

### CORS Configuration
- Development: Allows all origins
- Production: Uses configured CORS options from `configs/cors.js`

### File Upload Limits
- Maximum file size: Configured via Multer
- Supported formats: JPEG, PNG, PDF
- Azure Document Intelligence is used for receipt extraction

### Database
- Database: MySQL 8.0+
- Connection pooling configured via `utils/sqlbuilder.js`
- Foreign key constraints enabled

### Security Features
- Password hashing: bcrypt with 15 rounds
- JWT token-based authentication
- Input sanitization on all user inputs
- SQL injection prevention via parameterized queries

### Environment Variables Required
```env
# Server
PORT=3000
NODE_ENV=development

# Secrets
APP_SECRET=your_app_secret
ADMIN_SECRET=your_admin_secret

# Database
DB_HOST=localhost
DB_USER=root
DB_PASS=password
DB_NAME=taxlah

# Azure
AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT=...
AZURE_DOCUMENT_INTELLIGENCE_KEY=...

# CHIP Payment
CHIP_BRAND_ID=...
CHIP_API_KEY=...
CHIP_WEBHOOK_SECRET=...

# Email (Postmark)
POSTMARK_API_KEY=...
POSTMARK_FROM_EMAIL=...
```

---

## Support & Contact

For API support or questions, please contact:
- Email: support@taxlah.com
- Documentation: https://docs.taxlah.com
- Status: https://status.taxlah.com

---

**Last Updated**: January 14, 2026
**API Version**: 1.0.0
**Documentation Version**: 1.0.0
