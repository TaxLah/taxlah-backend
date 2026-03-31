# Dashboard API Documentation

## Endpoint: Get Dashboard Summary

**URL:** `GET /api/expenses/dashboard`

**Description:** Retrieves comprehensive dashboard data including total expenses and tax relief amounts for display on user's dashboard.

---

## Authentication
Requires valid JWT token in Authorization header.

---

## Query Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| year | integer | No | Tax year to query (defaults to current year) |

---

## Request Example

### Current Year (2026)
```bash
GET /api/expenses/dashboard
Authorization: Bearer YOUR_JWT_TOKEN
```

### Previous Year (2025)
```bash
GET /api/expenses/dashboard?year=2025
Authorization: Bearer YOUR_JWT_TOKEN
```

### JavaScript/Fetch Example
```javascript
const year = 2026; // or get from user selection

const response = await fetch(`/api/expenses/dashboard?year=${year}`, {
    method: 'GET',
    headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json'
    }
});

const data = await response.json();
console.log(data);
```

---

## Response Structure

```json
{
    "status_code": 200,
    "status": "success",
    "message": "Dashboard summary retrieved successfully",
    "data": {
        "year": 2026,
        "summary": {
            "expenses": {
                "total_count": 45,
                "total_amount": 12500.50,
                "avg_amount": 277.79,
                "confirmed_count": 30,
                "estimated_count": 10,
                "pending_count": 3,
                "manual_count": 2,
                "earliest_date": "2026-01-05",
                "latest_date": "2026-03-30"
            },
            "tax_relief": {
                "total_claims": 12,
                "unique_categories": 8,
                "total_claimed_amount": 9850.00,
                "total_max_claimable": 15000.00,
                "total_remaining": 5150.00,
                "utilization_percentage": "65.67"
            }
        },
        "expenses_by_category": [
            {
                "tax_id": 4,
                "tax_code": "P4",
                "tax_title": "Purchase of books, journals, magazines, newspapers",
                "tax_max_claim": 1500.00,
                "expense_count": 8,
                "total_amount": 2450.50,
                "avg_confidence": 88.5,
                "percentage": "19.60"
            },
            {
                "tax_id": 7,
                "tax_code": "P7",
                "tax_title": "Medical expenses",
                "tax_max_claim": 8000.00,
                "expense_count": 12,
                "total_amount": 3200.00,
                "avg_confidence": 92.3,
                "percentage": "25.60"
            }
            // ... more categories
        ],
        "tax_claims_by_category": [
            {
                "tax_id": 4,
                "tax_code": "P4",
                "tax_title": "Purchase of books, journals, magazines, newspapers",
                "tax_max_claim": 1500.00,
                "total_claimed": 1200.00,
                "remaining_claimable": 300.00,
                "claim_count": 5,
                "claim_status": "Draft",
                "utilization_percentage": "80.00"
            }
            // ... more categories
        ],
        "monthly_breakdown": [
            {
                "month": "2026-01",
                "month_number": 1,
                "expense_count": 12,
                "total_amount": 3200.50
            },
            {
                "month": "2026-02",
                "month_number": 2,
                "expense_count": 18,
                "total_amount": 4850.00
            },
            {
                "month": "2026-03",
                "month_number": 3,
                "expense_count": 15,
                "total_amount": 4450.00
            }
            // ... more months
        ]
    }
}
```

---

## Response Fields Explanation

### Summary Section

#### Expenses
- **total_count**: Total number of expenses for the year
- **total_amount**: Sum of all expense amounts
- **avg_amount**: Average expense amount
- **confirmed_count**: Expenses with confirmed AI categorization
- **estimated_count**: Expenses with estimated categorization
- **pending_count**: Expenses not yet categorized
- **manual_count**: User manually categorized expenses
- **earliest_date**: Date of first expense
- **latest_date**: Date of most recent expense

#### Tax Relief
- **total_claims**: Total number of tax relief claims
- **unique_categories**: Number of different tax categories claimed
- **total_claimed_amount**: Total amount of tax relief claimed
- **total_max_claimable**: Maximum amount that can be claimed
- **total_remaining**: Amount still available to claim
- **utilization_percentage**: Percentage of maximum claim utilized

### Expenses by Category
Lists all expense categories with:
- Category details (code, title, max claim)
- Number of expenses in category
- Total amount spent
- Average AI confidence score
- Percentage of total expenses

### Tax Claims by Category
Lists all tax relief categories with:
- Category details
- Amount claimed
- Remaining claimable amount
- Number of claims
- Claim status
- Utilization percentage

### Monthly Breakdown
Month-by-month breakdown showing:
- Month identifier
- Number of expenses
- Total amount spent

---

## UI Display Examples

### Dashboard Cards

```jsx
// Total Expenses Card
<Card>
    <h3>Total Expenses ({data.year})</h3>
    <p className="amount">RM {data.summary.expenses.total_amount.toFixed(2)}</p>
    <p className="count">{data.summary.expenses.total_count} transactions</p>
</Card>

// Tax Relief Card
<Card>
    <h3>Tax Relief Claimed ({data.year})</h3>
    <p className="amount">RM {data.summary.tax_relief.total_claimed_amount.toFixed(2)}</p>
    <p className="remaining">
        RM {data.summary.tax_relief.total_remaining.toFixed(2)} remaining
    </p>
    <ProgressBar 
        value={data.summary.tax_relief.utilization_percentage} 
        max="100"
    />
</Card>
```

### Chart Data Formatting

```javascript
// For pie chart (expenses by category)
const pieChartData = data.expenses_by_category.map(cat => ({
    name: cat.tax_code,
    value: cat.total_amount,
    label: cat.tax_title
}));

// For line chart (monthly breakdown)
const lineChartData = {
    labels: data.monthly_breakdown.map(m => m.month),
    datasets: [{
        label: 'Monthly Expenses',
        data: data.monthly_breakdown.map(m => m.total_amount)
    }]
};

// For bar chart (tax relief utilization)
const barChartData = data.tax_claims_by_category.map(cat => ({
    category: cat.tax_code,
    claimed: cat.total_claimed,
    remaining: cat.remaining_claimable,
    max: cat.tax_max_claim
}));
```

---

## Error Responses

### Unauthorized (401)
```json
{
    "status_code": 401,
    "status": "error",
    "message": "Unauthenticated user.",
    "data": null
}
```

### Internal Server Error (500)
```json
{
    "status_code": 500,
    "status": "error",
    "message": "An error occurred while retrieving dashboard summary",
    "data": {
        "error": "Error details here"
    }
}
```

---

## Performance Notes

- This endpoint aggregates data from multiple tables
- Response time: typically 100-300ms
- Cached data recommended for frequently accessed years
- Consider pagination for categories if user has many categories

---

## Use Cases

1. **Dashboard Homepage**
   - Display year summary cards
   - Show total expenses and tax relief
   - Monthly trends chart

2. **Year Comparison**
   - Allow users to switch between years
   - Compare current year vs previous years
   - Track year-over-year growth

3. **Tax Planning**
   - Show remaining claimable amounts
   - Identify underutilized categories
   - Plan future expenses

4. **Financial Overview**
   - Category breakdown visualization
   - Monthly spending patterns
   - Tax relief optimization

---

## Related Endpoints

- `GET /api/expenses/stats` - Detailed expense statistics
- `GET /api/expenses/list` - List of individual expenses
- `GET /api/expenses/mapping-dashboard` - AI mapping status
- `POST /api/expenses/create` - Create new expense

---

## Testing

### Test with cURL
```bash
# Get current year dashboard
curl -X GET "http://localhost:3000/api/expenses/dashboard" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Get specific year dashboard
curl -X GET "http://localhost:3000/api/expenses/dashboard?year=2025" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Test with Postman
1. Create new GET request
2. URL: `{{base_url}}/api/expenses/dashboard`
3. Add Auth token to Headers
4. Optional: Add query param `year=2025`
5. Send request

---

## Version History

- **v1.0** (2026-03-31): Initial release with expense and tax relief summaries

---

**Last Updated:** March 31, 2026
