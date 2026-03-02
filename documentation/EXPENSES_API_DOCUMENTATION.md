# Expenses API Documentation

## Overview
The Expenses API provides complete expense management with intelligent tax categorization using NLP and stored procedures. This replaces the basic Receipt flow with a sophisticated system that handles Malaysian LHDN tax relief categories with confidence tracking.

## Base URL
```
/api/expenses
```

All endpoints require JWT authentication via Authorization header:
```
Authorization: Bearer <jwt_token>
```

---

## Endpoints

### 1. Create Expense
Create a new expense with automatic tax categorization and optional item details.

**Endpoint:** `POST /api/expenses/create`

**Request Body:**
```json
{
  "expenses_date": "2024-03-15",
  "expenses_merchant_name": "Watson's Malaysia",
  "expenses_total_amount": 150.00,
  "expenses_merchant_id": "MERCHANT-123",
  "expenses_receipt_no": "RCP-2024-001",
  "expenses_tags": "medicine",
  "expenses_for": "Self",
  "dependant_id": null,
  "items": [
    {
      "item_sku_unit": "SKU-001",
      "item_name": "Panadol Actifast 20s",
      "item_unit_price": 12.50,
      "item_quantity": 2,
      "item_total_price": 25.00
    },
    {
      "item_sku_unit": "SKU-002",
      "item_name": "Vitamin C 1000mg",
      "item_unit_price": 62.50,
      "item_quantity": 2,
      "item_total_price": 125.00
    }
  ]
}
```

**Field Descriptions:**
- `expenses_date` (required): Date in YYYY-MM-DD format
- `expenses_merchant_name` (required): Merchant/store name
- `expenses_total_amount` (required): Total expense amount
- `expenses_merchant_id` (optional): Merchant identifier
- `expenses_receipt_no` (optional): Receipt number
- `expenses_tags` (optional): Tags for expense
- `expenses_for` (optional): "Self", "Spouse", "Child", "Parent"
- `dependant_id` (optional): ID of dependant if applicable
- `items` (optional): Array of purchased items
  - `item_sku_unit` (optional): SKU or unit code
  - `item_name` (optional): Item name/description
  - `item_unit_price` (required): Price per unit
  - `item_quantity` (required): Quantity purchased  
  - `item_total_price` (required): Total price for item

**Response:**
```json
{
  "status_code": 201,
  "status": "success",
  "message": "Expense created successfully",
  "data": {
    "expense": {
      "expenses_id": 456,
      "expenses_merchant_name": "Watson's Malaysia",
      "expenses_total_amount": 150.00,
      "expenses_date": "2024-03-15",
      "tax_id": 3,
      "taxsub_id": 12,
      "tax_category_name": "Medical & Healthcare",
      "taxsub_name": "Medicine & Medical Equipment",
      "lhdn_mapping_status": "Estimated",
      "ai_confidence_score": 92.5,
      "items_count": 2
    },
    "items": [
      {
        "item_id": 123,
        "item_sku_unit": "SKU-001",
        "item_name": "Panadol Actifast 20s",
        "item_unit_price": 12.50,
        "item_quantity": 2,
        "item_total_price": 25.00,
        "expenses_id": 456
      },
      {
        "item_id": 124,
        "item_sku_unit": "SKU-002",
        "item_name": "Vitamin C 1000mg",
        "item_unit_price": 62.50,
        "item_quantity": 2,
        "item_total_price": 125.00,
        "expenses_id": 456
      }
    ],
    "ui_message": {
      "title": "✅ Expense Created",
      "description": "Tax category estimated with 92.5% confidence",
      "badge": {
        "status": "Estimated",
        "color": "#fbbf24",
        "text": "Estimated (92.5%)"
      }
    }
  }
}
```

---

### 2. Get Expenses List
Retrieve expenses with advanced filtering and pagination.

**Endpoint:** `GET /api/expenses/list`

**Query Parameters:**
- `offset` (number, default: 0) - Pagination offset
- `limit` (number, default: 20, max: 100) - Records per page
- `search` (string) - Search by merchant name
- `year` (number) - Filter by tax year
- `mapping_status` (string) - Filter by status: "Estimated", "Confirmed", "Manual", "Pending"
- `tax_category` (number) - Filter by tax_id
- `min_confidence` (number, 0-100) - Minimum confidence score
- `sort` (string, default: "date_desc") - Sort options: "date_asc", "date_desc", "amount_asc", "amount_desc", "confidence_asc", "confidence_desc"

**Example Request:**
```
GET /api/expenses/list?year=2024&mapping_status=Estimated&min_confidence=70&limit=50
```

**Response:**
```json
{
  "status_code": 200,
  "status": "success",
  "message": "Expenses retrieved successfully",
  "data": {
    "expenses": [
      {
        "expenses_id": 456,
        "expenses_merchant": "Watson's Malaysia",
        "expenses_amount": 150.00,
        "expenses_date": "2024-03-15",
        "tax_category_name": "Medical & Healthcare",
        "taxsub_name": "Medicine & Medical Equipment",
        "lhdn_mapping_status": "Estimated",
        "ai_confidence_score": 92.5,
        "tax_year": 2024
      }
    ],
    "pagination": {
      "offset": 0,
      "limit": 50,
      "total": 145,
      "has_more": true
    }
  }
}
```

---

### 3. Get Expense Details
Retrieve detailed information for a single expense including mapping history.

**Endpoint:** `GET /api/expenses/details/:id`

**Response:**
```json
{
  "status_code": 200,
  "status": "success",
  "message": "Expense details retrieved successfully",
  "data": {
    "expense": {
      "expenses_id": 456,
      "expenses_date": "2024-03-15",
      "expenses_merchant": "Watson's Malaysia",
      "expenses_amount": 150.00,
      "tax_id": 3,
      "taxsub_id": 12,
      "tax_category_name": "Medical & Healthcare",
      "taxsub_name": "Medicine & Medical Equipment",
      "lhdn_mapping_status": "Estimated",
      "ai_confidence_score": 92.5,
      "tax_year": 2024
    },
    "items": [
      {
        "item_id": 123,
        "item_sku_unit": "SKU-001",
        "item_name": "Panadol Actifast 20s",
        "item_unit_price": 12.50,
        "item_quantity": 2,
        "item_total_price": 25.00,
        "expenses_id": 456
      }
    ],
    "items_count": 1,
    "mapping_history": [
      {
        "history_id": 123,
        "old_tax_id": null,
        "new_tax_id": 3,
        "old_taxsub_id": null,
        "new_taxsub_id": 12,
        "change_reason": "Initial AI categorization",
        "old_confidence": null,
        "new_confidence": 92.5,
        "changed_at": "2024-03-15T10:30:00Z"
      }
    ]
  }
}
```

---

### 4. Get Expense Items
Retrieve all items for a specific expense.

**Endpoint:** `GET /api/expenses/:id/items`

**Response:**
```json
{
  "status_code": 200,
  "status": "success",
  "message": "Found 2 item(s)",
  "data": {
    "expenses_id": 456,
    "items": [
      {
        "item_id": 123,
        "item_sku_unit": "SKU-001",
        "item_name": "Panadol Actifast 20s",
        "item_unit_price": 12.50,
        "item_quantity": 2,
        "item_total_price": 25.00,
        "status": "Active",
        "created_date": "2024-03-15T10:30:00Z",
        "last_modified": "2024-03-15T10:30:00Z",
        "expenses_id": 456
      },
      {
        "item_id": 124,
        "item_sku_unit": "SKU-002",
        "item_name": "Vitamin C 1000mg",
        "item_unit_price": 62.50,
        "item_quantity": 2,
        "item_total_price": 125.00,
        "status": "Active",
        "created_date": "2024-03-15T10:30:00Z",
        "last_modified": "2024-03-15T10:30:00Z",
        "expenses_id": 456
      }
    ],
    "count": 2
  }
}
```

---

### 5. Update Expense
Update expense fields (date, amount, merchant, type).

**Endpoint:** `PUT /api/expenses/update/:id`

**Request Body:**
```json
{
  "expenses_date": "2024-03-16",
  "expenses_amount": 175.00,
  "expenses_merchant": "Watson's Pharmacy",
  "expenses_type": "Receipt"
}
```

**Response:**
```json
{
  "status_code": 200,
  "status": "success",
  "message": "Expense updated successfully",
  "data": {
    "expenses_id": 456,
    "updated_fields": ["expenses_date", "expenses_amount", "expenses_merchant"]
  }
}
```

---

### 6. Delete Expense
Soft delete an expense (sets status to 'Deleted').

**Endpoint:** `DELETE /api/expenses/delete/:id`

**Response:**
```json
{
  "status_code": 200,
  "status": "success",
  "message": "Expense deleted successfully",
  "data": null
}
```

---

### 7. Override Tax Category
Manually override AI categorization with 100% confidence.

**Endpoint:** `PUT /api/expenses/override-category/:id`

**Request Body:**
```json
{
  "tax_id": 5,
  "taxsub_id": 18
}
```

**Response:**
```json
{
  "status_code": 200,
  "status": "success",
  "message": "Tax category overridden successfully",
  "data": {
    "expense": {
      "expenses_id": 456,
      "tax_id": 5,
      "taxsub_id": 18,
      "lhdn_mapping_status": "Manual",
      "ai_confidence_score": 100.0
    },
    "ui_message": {
      "title": "✅ Category Updated",
      "description": "You have manually set the tax category for this expense. It will be marked as Manual with 100% confidence.",
      "badge": {
        "status": "Manual",
        "color": "#6366f1",
        "text": "Manual Override"
      }
    }
  }
}
```

---

### 8. Get Expenses Requiring Review
Retrieve expenses that need user attention (low confidence, pending, or recently changed by LHDN).

**Endpoint:** `GET /api/expenses/requiring-review`

**Query Parameters:**
- `limit` (number, default: 20, max: 100) - Records to return

**Response:**
```json
{
  "status_code": 200,
  "status": "success",
  "message": "Found 3 expenses requiring review",
  "data": {
    "expenses": [
      {
        "expenses_id": 789,
        "expenses_merchant": "Unknown Store",
        "expenses_amount": 250.00,
        "ai_confidence_score": 45.0,
        "lhdn_mapping_status": "Pending",
        "needs_review_reason": "Low confidence score"
      }
    ],
    "count": 3,
    "ui_message": {
      "title": "⚠️ Review Needed",
      "description": "You have 3 expense(s) that need your attention. Please review and confirm the categories.",
      "action": {
        "label": "Review Now",
        "type": "primary"
      }
    }
  }
}
```

---

### 9. Get Mapping Dashboard
Comprehensive overview of tax categorization status.

**Endpoint:** `GET /api/expenses/mapping-dashboard`

**Query Parameters:**
- `tax_year` (number, optional) - Filter by specific year

**Response:**
```json
{
  "status_code": 200,
  "status": "success",
  "message": "Mapping dashboard retrieved successfully",
  "data": {
    "summary": {
      "current_year_receipts": 145,
      "estimated_count": 87,
      "confirmed_count": 45,
      "manual_count": 13,
      "needs_review_count": 8,
      "avg_confidence": 82.5
    },
    "insights": [
      {
        "type": "info",
        "icon": "⏳",
        "title": "Estimated Categories",
        "message": "You have 87 expense(s) with estimated categories. These will be updated when official LHDN mapping is published."
      },
      {
        "type": "warning",
        "icon": "⚠️",
        "title": "Review Needed",
        "message": "8 expense(s) have low confidence and need your review.",
        "action": {
          "label": "Review Now",
          "endpoint": "/api/expenses/requiring-review"
        }
      }
    ]
  }
}
```

---

### 10. Get Expense Statistics
Statistical breakdown of expenses by category.

**Endpoint:** `GET /api/expenses/stats`

**Query Parameters:**
- `year` (number, optional) - Filter by specific year

**Response:**
```json
{
  "status_code": 200,
  "status": "success",
  "message": "Expense statistics retrieved successfully",
  "data": {
    "overview": {
      "total_count": 145,
      "total_amount": 25750.00,
      "avg_amount": 177.59,
      "avg_confidence": 82.5
    },
    "by_category": [
      {
        "tax_id": 3,
        "tax_category_name": "Medical & Healthcare",
        "total_count": 45,
        "total_amount": 8500.00,
        "avg_confidence": 88.2,
        "percentage": "33.01"
      },
      {
        "tax_id": 5,
        "tax_category_name": "Education",
        "total_count": 32,
        "total_amount": 6200.00,
        "avg_confidence": 91.5,
        "percentage": "24.08"
      }
    ],
    "year": "2024"
  }
}
```

---

## Error Responses

### 400 Bad Request
```json
{
  "status_code": 400,
  "status": "error",
  "message": "Invalid input: expenses_amount is required",
  "data": null
}
```

### 401 Unauthorized
```json
{
  "status_code": 401,
  "status": "error",
  "message": "User not authenticated",
  "data": null
}
```

### 404 Not Found
```json
{
  "status_code": 404,
  "status": "error",
  "message": "Expense not found",
  "data": null
}
```

### 500 Internal Server Error
```json
{
  "status_code": 500,
  "status": "error",
  "message": "An error occurred while processing request",
  "data": { "error": "Database connection failed" }
}
```

---

## Mapping Status Types

| Status | Description | Confidence |
|--------|-------------|-----------|
| **Estimated** | Using previous year's LHDN mapping (Jan-Sep) | AI-determined |
| **Confirmed** | Using current year's official LHDN mapping (Oct-Dec) | AI-determined |
| **Manual** | User manually overrode AI categorization | 100% |
| **Pending** | Awaiting categorization or review | Variable |

---

## Best Practices

### 1. Handling Estimated vs Confirmed
- **Jan-Sep**: Expenses are marked as "Estimated" using previous year's rules
- **Oct-Dec**: System checks for official mapping and marks as "Confirmed"
- Users can manually override any category at any time

### 2. Confidence Scoring
- High (≥85%): Auto-accept
- Medium (70-84%): Review recommended
- Low (<70%): Review required

### 3. Pagination
- Use `offset` and `limit` for large datasets
- Maximum `limit` is 100 records per request
- Check `has_more` in pagination response

### 4. Filtering Strategy
Combine filters for precise queries:
```
/api/expenses/list?year=2024&mapping_status=Estimated&min_confidence=70
```

### 5. Review Workflow
1. Check `/requiring-review` endpoint regularly
2. Review low-confidence expenses
3. Use `/override-category` for manual corrections
4. Monitor `/mapping-dashboard` for overall health

---

## Integration Example

```javascript
// Create expense with auto-categorization and items
async function createExpense(expenseData) {
  const response = await fetch('/api/expenses/create', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(expenseData)
  });
  
  const result = await response.json();
  
  // Show UI badge based on confidence
  if (result.data.expense.ai_confidence_score < 70) {
    showWarning('Low confidence - please review');
  }
  
  return result;
}

// Example: Create expense with items
const expenseWithItems = {
  expenses_date: '2024-03-15',
  expenses_merchant_name: 'Watson\'s Malaysia',
  expenses_total_amount: 150.00,
  expenses_receipt_no: 'RCP-001',
  items: [
    {
      item_name: 'Panadol Actifast 20s',
      item_unit_price: 12.50,
      item_quantity: 2,
      item_total_price: 25.00
    },
    {
      item_name: 'Vitamin C 1000mg',
      item_unit_price: 62.50,
      item_quantity: 2,
      item_total_price: 125.00
    }
  ]
};

await createExpense(expenseWithItems);

// Check expenses needing review
async function checkReview() {
  const response = await fetch('/api/expenses/requiring-review', {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  
  const result = await response.json();
  
  if (result.data.count > 0) {
    showNotification(result.data.ui_message);
  }
}

// Override category manually
async function overrideCategory(expenseId, taxId, taxsubId) {
  const response = await fetch(`/api/expenses/override-category/${expenseId}`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ tax_id: taxId, taxsub_id: taxsubId })
  });
  
  return await response.json();
}
```

---

## Migration from Receipt API

If migrating from the old `/api/receipt` endpoints:

| Old Endpoint | New Endpoint | Notes |
|-------------|--------------|-------|
| POST /receipt/upload | POST /expenses/create | Now includes AI categorization and items |
| GET /receipt/list | GET /expenses/list | Enhanced filtering options |
| GET /receipt/details/:id | GET /expenses/details/:id | Includes mapping history and items |
| N/A | GET /expenses/:id/items | **NEW**: Get expense items |
| PUT /receipt/update/:id | PUT /expenses/update/:id | Same functionality |
| DELETE /receipt/delete/:id | DELETE /expenses/delete/:id | Same functionality |
| N/A | PUT /expenses/override-category/:id | **NEW**: Manual override |
| N/A | GET /expenses/requiring-review | **NEW**: Review queue |
| N/A | GET /expenses/mapping-dashboard | **NEW**: Analytics dashboard |
| N/A | GET /expenses/stats | **NEW**: Statistics |

---

## Support

For questions or issues, refer to:
- [TAX_MAPPING_SYSTEM.md](../TAX_MAPPING_SYSTEM.md) - Complete system documentation
- [IMPLEMENTATION_GUIDE.md](../IMPLEMENTATION_GUIDE.md) - Development guide

