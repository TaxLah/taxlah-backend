-- ============================================================
-- Migration: Add Mapping Columns to account_expenses
-- Description: Add fields to track mapping status, confidence,
--              and version for deferred tax categorization
-- Author: TaxLah Development Team
-- Date: 2026-02-28
-- ============================================================

USE taxlah_development;

-- Start transaction for safety
START TRANSACTION;

-- Add mapping status columns
ALTER TABLE `account_expenses`
ADD COLUMN `expenses_mapping_status` ENUM('Pending', 'Estimated', 'Confirmed', 'Manual') 
    DEFAULT 'Pending' 
    COMMENT 'Pending=no mapping yet, Estimated=prelim AI, Confirmed=official LHDN, Manual=user override'
    AFTER `expenses_tax_eligible`,
    
ADD COLUMN `expenses_mapping_confidence` DECIMAL(5,2) DEFAULT NULL 
    COMMENT 'AI confidence score 0-100'
    AFTER `expenses_mapping_status`,
    
ADD COLUMN `expenses_mapping_version` VARCHAR(50) DEFAULT NULL 
    COMMENT 'e.g., 2026-prelim, 2026-official'
    AFTER `expenses_mapping_confidence`,
    
ADD COLUMN `expenses_original_tax_category` INT DEFAULT NULL 
    COMMENT 'Store original prelim category before remap'
    AFTER `expenses_mapping_version`,
    
ADD COLUMN `expenses_mapping_date` DATETIME DEFAULT NULL 
    COMMENT 'When category was assigned'
    AFTER `expenses_original_tax_category`;

-- Add foreign key for original tax category
ALTER TABLE `account_expenses`
ADD CONSTRAINT `fk_expenses_original_tax` 
    FOREIGN KEY (`expenses_original_tax_category`) 
    REFERENCES `tax_category` (`tax_id`) 
    ON DELETE SET NULL;

-- Add indexes for better query performance
ALTER TABLE `account_expenses`
ADD INDEX `idx_mapping_status` (`expenses_mapping_status`, `expenses_year`),
ADD INDEX `idx_mapping_version` (`expenses_mapping_version`),
ADD INDEX `idx_mapping_date` (`expenses_mapping_date`);

-- Backfill existing data with default values
UPDATE `account_expenses`
SET 
    `expenses_mapping_status` = CASE 
        WHEN `expenses_tax_category` IS NOT NULL THEN 'Confirmed'
        ELSE 'Pending'
    END,
    `expenses_mapping_confidence` = CASE 
        WHEN `expenses_tax_category` IS NOT NULL THEN 90.00
        ELSE NULL
    END,
    `expenses_mapping_version` = CASE 
        WHEN `expenses_tax_category` IS NOT NULL THEN CONCAT(`expenses_year`, '-legacy')
        ELSE NULL
    END,
    `expenses_mapping_date` = `created_date`
WHERE `status` = 'Active';

-- Verify changes
SELECT 
    'Migration Complete: account_expenses' as status,
    COUNT(*) as total_records,
    SUM(CASE WHEN expenses_mapping_status IS NOT NULL THEN 1 ELSE 0 END) as records_with_status,
    SUM(CASE WHEN expenses_mapping_status = 'Confirmed' THEN 1 ELSE 0 END) as confirmed_records,
    SUM(CASE WHEN expenses_mapping_status = 'Pending' THEN 1 ELSE 0 END) as pending_records
FROM `account_expenses`;

COMMIT;

-- ============================================================
-- Verification Queries (Run after migration)
-- ============================================================
-- DESCRIBE account_expenses;
-- SELECT expenses_id, expenses_mapping_status, expenses_mapping_confidence, 
--        expenses_mapping_version FROM account_expenses LIMIT 10;
-- ============================================================