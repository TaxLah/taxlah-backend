# Malaysia Tax Relief Management System - Implementation Guide

## Overview

This document explains the schema improvements and implementation approach for auto-calculating tax reliefs based on user receipts and expenses.

---

## 1. Schema Changes Summary

### New Tables Added

| Table | Purpose |
|-------|---------|
| `account_tax_claim` | Tracks individual tax relief claims per user per year |
| `account_tax_summary` | Annual tax relief summary per user |
| `receipt_tax_mapping` | Links receipts to tax categories (for AI-based categorization) |
| `merchant_tax_category` | Pre-maps merchants to likely tax categories |

### Modified Tables

| Table | Changes |
|-------|---------|
| `account_dependant` | Added: IC, gender, disability status, education level, institution details |
| `account_expenses` | Changed `expenses_year` to YEAR type; Added: `claim_id`, `expenses_for`, `dependant_id` |
| `tax_category` | Added: `tax_code`, `tax_year`, `tax_is_auto_claim`, `tax_requires_receipt`, `tax_claim_for`, `tax_frequency`, `tax_sort_order` |
| `tax_subcategory` | Added: `taxsub_code`, `taxsub_claim_for`, `taxsub_requires_receipt`, `taxsub_sort_order` |

---

## 2. LHDN YA 2024 Tax Relief Categories

The SQL file includes all 25 tax relief categories for Year of Assessment 2024:

| # | Code | Category | Max (RM) |
|---|------|----------|----------|
| 1 | INDIVIDUAL_2024 | Individual and Dependent Relatives | 9,000 |
| 2 | PARENT_MEDICAL_2024 | Expenses for Parents | 8,000 |
| 3 | DISABLED_EQUIPMENT_2024 | Basic Supporting Equipment (Disabled) | 6,000 |
| 4 | DISABLED_SELF_2024 | Disabled Individual | 6,000 |
| 5 | EDUCATION_SELF_2024 | Education Fees (Self) | 7,000 |
| 6 | MEDICAL_SERIOUS_2024 | Medical (Serious Diseases) | 10,000 |
| 7 | MEDICAL_EXAM_2024 | Medical Examination | 1,000 |
| 8 | CHILD_DISABILITY_2024 | Child Learning Disability | 4,000 |
| 9 | LIFESTYLE_2024 | Lifestyle | 2,500 |
| 10 | LIFESTYLE_SPORTS_2024 | Lifestyle - Sports | 1,000 |
| 11 | BREASTFEEDING_2024 | Breastfeeding Equipment | 1,000 |
| 12 | CHILDCARE_2024 | Child Care Fees | 3,000 |
| 13 | SSPN_2024 | SSPN Savings | 8,000 |
| 14 | SPOUSE_2024 | Spouse / Alimony | 4,000 |
| 15 | DISABLED_SPOUSE_2024 | Disabled Spouse | 5,000 |
| 16a | CHILD_UNDER18_2024 | Child (Under 18) | 2,000 |
| 16b | CHILD_ALEVEL_2024 | Child (18+ A-Level/Matric) | 2,000 |
| 16b | CHILD_HIGHER_ED_2024 | Child (18+ Diploma/Degree) | 8,000 |
| 16c | DISABLED_CHILD_2024 | Disabled Child | 6,000 |
| 16c | DISABLED_CHILD_HIGHER_2024 | Disabled Child (Higher Ed) | 8,000 |
| 17 | LIFE_EPF_2024 | Life Insurance & EPF | 7,000 |
| 18 | PRS_2024 | PRS / Deferred Annuity | 3,000 |
| 19 | INSURANCE_EDU_MED_2024 | Education & Medical Insurance | 3,000 |
| 20 | SOCSO_2024 | SOCSO | 350 |
| 21 | EV_CHARGING_2024 | EV Charging Facilities | 2,500 |

---

## 3. Key Changes in YA 2025

| Category | YA 2024 | YA 2025 | Change |
|----------|---------|---------|--------|
| Disabled Individual | RM6,000 | RM7,000 | +RM1,000 |
| Child Learning Disability | RM4,000 | RM6,000 | +RM2,000 |
| Disabled Spouse | RM5,000 | RM6,000 | +RM1,000 |
| Disabled Child | RM6,000 | RM8,000 | +RM2,000 |
| Education & Medical Insurance | RM3,000 | RM4,000 | +RM1,000 |
| Parents Medical | Parents only | Parents & Grandparents | Expanded |
| Sports Relief | Self/Spouse/Child | + Parents | Expanded |
| Medical Exam | 3 items | + Health monitoring equipment, disease detection | Expanded |
| EV Charging | EV only | + Composting machine | Expanded |
| **NEW**: Housing Loan Interest | N/A | Up to RM7,000 | New for first home |

### YA 2025 New Subcategories

The following subcategories are **new or expanded** in YA 2025:

| Parent Category | Subcategory Code | Description | Max (RM) |
|-----------------|------------------|-------------|----------|
| Medical Exam | MED_EXAM_MONITOR_2025 | Self-health monitoring equipment | 1,000 |
| Medical Exam | MED_EXAM_DISEASE_TEST_2025 | Disease detection tests | 1,000 |
| EV & Green | COMPOSTING_MACHINE_2025 | Domestic food waste composting machine | 2,500 |
| Housing (NEW) | HOUSING_LOAN_500K_2025 | Property up to RM500,000 | 7,000 |
| Housing (NEW) | HOUSING_LOAN_750K_2025 | Property RM500,001-RM750,000 | 2,500 |

---

## 4. Auto-Calculation Implementation

### 4.1 Receipt Processing Flow

```
User uploads receipt
        ↓
Azure Document Intelligence extracts data
        ↓
Insert into `receipt` table
        ↓
AI categorization (match to tax_category)
        ↓
Insert into `receipt_tax_mapping`
        ↓
Create/Update `account_expenses`
        ↓
Update `account_tax_claim` (aggregate)
        ↓
Recalculate `account_tax_summary`
```

### 4.2 Mapping Azure Receipt Fields to Tax Categories

Based on the Azure Document Intelligence receipt model, here's how to map extracted data:

```javascript
// Example: Azure Receipt Response Processing
const processReceipt = async (azureResponse, accountId) => {
  const receipt = azureResponse.documents[0];
  
  // Extract key fields
  const merchantName = receipt.fields.MerchantName?.content;
  const merchantAddress = receipt.fields.MerchantAddress?.content;
  const transactionDate = receipt.fields.TransactionDate?.content;
  const total = receipt.fields.Total?.content;
  const items = receipt.fields.Items?.values || [];
  
  // 1. Try to match merchant to known tax categories
  const merchantMapping = await db.query(`
    SELECT mtc.*, tc.tax_code, tc.tax_title
    FROM merchant_tax_category mtc
    JOIN merchant m ON mtc.merchant_id = m.merchant_id
    JOIN tax_category tc ON mtc.tax_id = tc.tax_id
    WHERE m.merchant_name LIKE ? AND tc.tax_year = ?
    ORDER BY mtc.priority
    LIMIT 1
  `, [`%${merchantName}%`, currentTaxYear]);
  
  // 2. If no merchant match, analyze items for categorization
  if (!merchantMapping) {
    const suggestedCategory = await categorizeByItems(items);
  }
  
  // 3. Insert receipt and create tax mapping
  // ... (see full implementation below)
};
```

### 4.3 Smart Categorization Logic

```javascript
const CATEGORY_KEYWORDS = {
  'LIFESTYLE_2024': {
    'LIFE_BOOKS': ['book', 'novel', 'magazine', 'newspaper', 'journal', 'publication'],
    'LIFE_GADGETS': ['laptop', 'computer', 'smartphone', 'phone', 'tablet', 'ipad', 'macbook'],
    'LIFE_INTERNET': ['internet', 'broadband', 'wifi', 'fibre', 'unifi', 'time'],
  },
  'LIFESTYLE_SPORTS_2024': {
    'SPORT_EQUIPMENT': ['badminton', 'racket', 'ball', 'shoe', 'jersey', 'sports'],
    'SPORT_GYM': ['gym', 'fitness', 'membership'],
  },
  'MEDICAL_SERIOUS_2024': {
    'MED_VACCINATION': ['vaccine', 'vaccination', 'immunization'],
    'MED_DENTAL': ['dental', 'dentist', 'teeth', 'orthodontic'],
  },
  // ... more categories
};

const categorizeReceipt = (merchantName, items, merchantCategory) => {
  // Score each tax category based on keyword matches
  const scores = {};
  
  for (const [taxCode, subcategories] of Object.entries(CATEGORY_KEYWORDS)) {
    for (const [subCode, keywords] of Object.entries(subcategories)) {
      const score = calculateMatchScore(merchantName, items, keywords);
      if (score > 0) {
        scores[taxCode] = scores[taxCode] || {};
        scores[taxCode][subCode] = score;
      }
    }
  }
  
  // Return highest scoring category
  return getBestMatch(scores);
};
```

### 4.4 Tax Claim Aggregation

```sql
-- Stored procedure to recalculate user's tax claims for a year
DELIMITER //

CREATE PROCEDURE sp_recalculate_tax_claims(
  IN p_account_id INT,
  IN p_tax_year YEAR
)
BEGIN
  -- For each tax category, sum up eligible expenses
  INSERT INTO account_tax_claim (
    account_id, tax_year, tax_id, claimed_amount, max_claimable, claim_status
  )
  SELECT 
    ae.account_id,
    p_tax_year,
    ae.expenses_tax_category,
    LEAST(SUM(ae.expenses_total_amount), tc.tax_max_claim),
    tc.tax_max_claim,
    'Draft'
  FROM account_expenses ae
  JOIN tax_category tc ON ae.expenses_tax_category = tc.tax_id
  WHERE ae.account_id = p_account_id
    AND ae.expenses_year = p_tax_year
    AND ae.expenses_tax_eligible = 'Yes'
    AND ae.status = 'Active'
    AND tc.tax_year = p_tax_year
  GROUP BY ae.account_id, ae.expenses_tax_category
  ON DUPLICATE KEY UPDATE
    claimed_amount = LEAST(VALUES(claimed_amount), max_claimable),
    last_modified = CURRENT_TIMESTAMP;
    
  -- Add auto-claim reliefs (like Individual relief)
  INSERT INTO account_tax_claim (
    account_id, tax_year, tax_id, claimed_amount, max_claimable, claim_status
  )
  SELECT 
    p_account_id,
    p_tax_year,
    tc.tax_id,
    tc.tax_max_claim,
    tc.tax_max_claim,
    'Verified'
  FROM tax_category tc
  WHERE tc.tax_year = p_tax_year
    AND tc.tax_is_auto_claim = 'Yes'
    AND tc.status = 'Active'
  ON DUPLICATE KEY UPDATE
    claimed_amount = max_claimable;
    
END //

DELIMITER ;
```

---

## 5. API Endpoints Suggestions

### Receipt Processing
```
POST /api/receipts/upload
- Upload receipt image
- Process with Azure Document Intelligence
- Auto-categorize and create expense entry

GET /api/receipts/:id/suggest-category
- Get AI-suggested tax category for a receipt

PUT /api/receipts/:id/category
- Manually set/override tax category
```

### Tax Claims
```
GET /api/tax/claims/:year
- Get all tax claims for a year

GET /api/tax/claims/:year/summary
- Get summary with total relief, remaining claimable

POST /api/tax/claims/recalculate
- Trigger recalculation of all claims

GET /api/tax/categories/:year
- Get all tax relief categories for a year
```

### Reports
```
GET /api/tax/report/:year
- Generate tax relief report for filing

GET /api/tax/report/:year/pdf
- Generate PDF report
```

---

## 6. Frontend Considerations

### Dashboard Widgets
1. **Total Relief Summary** - Show total claimed vs maximum available
2. **Category Progress Bars** - Visual progress for each relief category
3. **Recent Receipts** - List of recently uploaded receipts with categorization status
4. **Alerts** - Notify when approaching category limits

### Receipt Upload Flow
1. Camera/Gallery upload
2. Processing indicator while Azure extracts data
3. Review extracted data (editable)
4. Confirm or change suggested category
5. Success confirmation with updated totals

---

## 7. Database Migration Notes

When running the SQL file:

1. **Backup first**: `mysqldump -u user -p database > backup.sql`

2. **Run in order**:
   - Schema alterations (Part 1)
   - YA 2024 seed data (Part 2)
   - YA 2025 seed data (Part 3)
   - Views (Part 4)
   - Sample merchants (Part 5)

3. **Handle existing data**: The ALTER statements assume columns don't exist. If re-running, you may need to DROP columns first or use `IF NOT EXISTS` patterns.

---

## 8. Next Steps

1. ✅ Schema improvements - Done
2. ✅ LHDN tax relief seed data - Done
3. 🔲 Implement receipt-to-category mapping service
4. 🔲 Create tax calculation service
5. 🔲 Build tax claim management APIs
6. 🔲 Add tax report generation
7. 🔲 Frontend dashboard for tax relief tracking

---

## Questions?

Let me know if you need:
- More detailed API implementation
- Frontend component examples
- Additional tax categories or subcategories
- Help with the Azure Document Intelligence integration
- Tax calculation logic for Malaysian progressive tax rates
