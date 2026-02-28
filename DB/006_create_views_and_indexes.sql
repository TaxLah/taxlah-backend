-- ============================================================
-- Migration: Create Views and Additional Indexes
-- Description: Create helpful views for querying mapping data
-- Author: TaxLah Development Team
-- Date: 2026-02-28
-- ============================================================

USE taxlah_development;

START TRANSACTION;

-- ============================================================
-- VIEW: User Expenses Mapping Status Summary
-- ============================================================
CREATE OR REPLACE VIEW `v_user_expenses_mapping_status` AS
SELECT 
    ae.account_id,
    a.account_name,
    ae.expenses_year,
    ae.expenses_mapping_status,
    COUNT(ae.expenses_id) as expense_count,
    SUM(ae.expenses_total_amount) as total_amount,
    AVG(ae.expenses_mapping_confidence) as avg_confidence,
    MIN(ae.expenses_mapping_confidence) as min_confidence,
    MAX(ae.expenses_mapping_confidence) as max_confidence,
    SUM(CASE WHEN ae.expenses_mapping_confidence < 70 THEN 1 ELSE 0 END) as low_confidence_count,
    ae.expenses_mapping_version,
    MAX(ae.expenses_mapping_date) as last_mapping_date
FROM account_expenses ae
JOIN account a ON ae.account_id = a.account_id
WHERE ae.status = 'Active'
GROUP BY ae.account_id, ae.expenses_year, ae.expenses_mapping_status, ae.expenses_mapping_version
ORDER BY ae.account_id, ae.expenses_year DESC;

-- ============================================================
-- VIEW: Tax Category Mapping Readiness
-- ============================================================
CREATE OR REPLACE VIEW `v_tax_mapping_readiness` AS
SELECT 
    tc.tax_year,
    tc.tax_mapping_status,
    COUNT(DISTINCT tc.tax_id) as category_count,
    COUNT(DISTINCT ts.taxsub_id) as subcategory_count,
    tc.tax_published_date,
    tc.tax_based_on_year,
    COUNT(DISTINCT ae.account_id) as affected_users,
    COUNT(ae.expenses_id) as affected_expenses,
    SUM(CASE WHEN ae.expenses_mapping_status = 'Estimated' THEN 1 ELSE 0 END) as pending_remap_count,
    SUM(ae.expenses_total_amount) as total_expense_amount
FROM tax_category tc
LEFT JOIN tax_subcategory ts ON tc.tax_id = ts.tax_id AND ts.status = 'Active'
LEFT JOIN account_expenses ae ON tc.tax_year = ae.expenses_year AND ae.status = 'Active'
WHERE tc.status = 'Active'
GROUP BY tc.tax_year, tc.tax_mapping_status, tc.tax_published_date, tc.tax_based_on_year
ORDER BY tc.tax_year DESC;

-- ============================================================
-- VIEW: Mapping Changes Summary
-- ============================================================
CREATE OR REPLACE VIEW `v_mapping_changes_summary` AS
SELECT 
    DATE(h.changed_date) as change_date,
    h.change_reason,
    h.changed_by,
    COUNT(h.history_id) as change_count,
    COUNT(DISTINCT h.expenses_id) as unique_expenses,
    COUNT(DISTINCT ae.account_id) as affected_users,
    AVG(h.confidence_after) as avg_confidence_after,
    SUM(CASE WHEN h.confidence_after < 70 THEN 1 ELSE 0 END) as low_confidence_changes
FROM account_expenses_mapping_history h
JOIN account_expenses ae ON h.expenses_id = ae.expenses_id
GROUP BY DATE(h.changed_date), h.change_reason, h.changed_by
ORDER BY change_date DESC, h.change_reason;

-- ============================================================
-- VIEW: Expenses Requiring Review
-- ============================================================
CREATE OR REPLACE VIEW `v_expenses_requiring_review` AS
SELECT 
    ae.expenses_id,
    ae.account_id,
    a.account_name,
    a.account_email,
    ae.expenses_merchant_name,
    ae.expenses_total_amount,
    ae.expenses_date,
    ae.expenses_year,
    tc.tax_code,
    tc.tax_title,
    ae.expenses_mapping_status,
    ae.expenses_mapping_confidence,
    ae.expenses_mapping_version,
    -- Get change history
    (SELECT COUNT(*) FROM account_expenses_mapping_history h 
     WHERE h.expenses_id = ae.expenses_id) as change_count,
    -- Get latest change reason
    (SELECT h.change_reason FROM account_expenses_mapping_history h 
     WHERE h.expenses_id = ae.expenses_id 
     ORDER BY h.changed_date DESC LIMIT 1) as last_change_reason
FROM account_expenses ae
JOIN account a ON ae.account_id = a.account_id
LEFT JOIN tax_category tc ON ae.expenses_tax_category = tc.tax_id
WHERE ae.status = 'Active'
  AND (
      ae.expenses_mapping_confidence < 70 
      OR ae.expenses_mapping_status = 'Pending'
      OR EXISTS (
          SELECT 1 FROM account_expenses_mapping_history h
          WHERE h.expenses_id = ae.expenses_id
            AND h.change_reason = 'LHDN_Update'
            AND h.changed_date >= DATE_SUB(NOW(), INTERVAL 7 DAY)
      )
  )
ORDER BY ae.expenses_mapping_confidence ASC, ae.expenses_date DESC;

-- ============================================================
-- Additional Indexes for Performance
-- ============================================================

-- Index for filtering by confidence score
ALTER TABLE `account_expenses`
ADD INDEX `idx_low_confidence` (`expenses_mapping_confidence`, `expenses_year`)
WHERE `expenses_mapping_confidence` < 70;

-- Composite index for common queries
ALTER TABLE `account_expenses`
ADD INDEX `idx_account_year_status` (`account_id`, `expenses_year`, `expenses_mapping_status`, `status`);

-- Index for history queries
ALTER TABLE `account_expenses_mapping_history`
ADD INDEX `idx_reason_date` (`change_reason`, `changed_date`);

COMMIT;

-- Verify views
SELECT 
    'Migration Complete: Views and Indexes' as status,
    COUNT(*) as view_count
FROM information_schema.VIEWS
WHERE TABLE_SCHEMA = 'taxlah_development'
  AND TABLE_NAME LIKE 'v_%mapping%';

-- ============================================================
-- Verification Queries
-- ============================================================
-- SHOW FULL TABLES WHERE Table_type = 'VIEW';
-- SELECT * FROM v_user_expenses_mapping_status LIMIT 5;
-- SELECT * FROM v_tax_mapping_readiness;
-- SELECT * FROM v_expenses_requiring_review LIMIT 10;
-- ============================================================