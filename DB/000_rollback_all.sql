-- ============================================================
-- ROLLBACK SCRIPT: Tax Mapping Enhancement
-- Description: Rollback all changes if something goes wrong
-- Author: TaxLah Development Team
-- Date: 2026-02-28
-- WARNING: THIS WILL DELETE ALL MAPPING DATA!
-- ============================================================

USE taxlah_development;

SET FOREIGN_KEY_CHECKS = 0;

-- Drop views
DROP VIEW IF EXISTS `v_user_expenses_mapping_status`;
DROP VIEW IF EXISTS `v_tax_mapping_readiness`;
DROP VIEW IF EXISTS `v_mapping_changes_summary`;
DROP VIEW IF EXISTS `v_expenses_requiring_review`;
DROP VIEW IF EXISTS `v_pending_mapping_notifications`;

-- Drop triggers
DROP TRIGGER IF EXISTS `trg_expenses_category_change`;

-- Drop stored procedures
DROP PROCEDURE IF EXISTS `sp_check_official_mapping_exists`;
DROP PROCEDURE IF EXISTS `sp_ai_categorize_expense_preliminary`;
DROP PROCEDURE IF EXISTS `sp_ai_categorize_expense`;
DROP PROCEDURE IF EXISTS `sp_upload_receipt_with_mapping`;

-- Drop tables
DROP TABLE IF EXISTS `account_expenses_mapping_notification`;
DROP TABLE IF EXISTS `account_expenses_mapping_history`;

-- Remove columns from tax_category
ALTER TABLE `tax_category`
DROP INDEX IF EXISTS `idx_mapping_status`,
DROP INDEX IF EXISTS `idx_published_date`,
DROP COLUMN IF EXISTS `tax_mapping_status`,
DROP COLUMN IF EXISTS `tax_published_date`,
DROP COLUMN IF EXISTS `tax_based_on_year`;

-- Remove columns from account_expenses
ALTER TABLE `account_expenses`
DROP FOREIGN KEY IF EXISTS `fk_expenses_original_tax`,
DROP INDEX IF EXISTS `idx_mapping_status`,
DROP INDEX IF EXISTS `idx_mapping_version`,
DROP INDEX IF EXISTS `idx_mapping_date`,
DROP INDEX IF EXISTS `idx_low_confidence`,
DROP INDEX IF EXISTS `idx_account_year_status`,
DROP COLUMN IF EXISTS `expenses_mapping_status`,
DROP COLUMN IF EXISTS `expenses_mapping_confidence`,
DROP COLUMN IF EXISTS `expenses_mapping_version`,
DROP COLUMN IF EXISTS `expenses_original_tax_category`,
DROP COLUMN IF EXISTS `expenses_mapping_date`;

SET FOREIGN_KEY_CHECKS = 1;

SELECT 'ROLLBACK COMPLETE - All mapping enhancements removed' as status;

-- ============================================================
-- NOTE: After rollback, you may want to restart MySQL to clear
-- any cached schema information
-- ============================================================