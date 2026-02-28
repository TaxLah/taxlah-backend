-- ============================================================
-- Migration: Add Mapping Metadata to tax_category
-- Description: Track whether tax categories are draft,
--              preliminary, or officially published by LHDN
-- Author: TaxLah Development Team
-- Date: 2026-02-28
-- ============================================================

USE taxlah_development;

START TRANSACTION;

-- Add mapping metadata columns
ALTER TABLE `tax_category`
ADD COLUMN `tax_mapping_status` ENUM('Draft', 'Preliminary', 'Official', 'Archived') 
    DEFAULT 'Draft'
    COMMENT 'Draft=not ready, Preliminary=based on prev year, Official=LHDN published'
    AFTER `tax_year`,
    
ADD COLUMN `tax_published_date` DATE DEFAULT NULL 
    COMMENT 'Date LHDN officially published this year mapping'
    AFTER `tax_mapping_status`,
    
ADD COLUMN `tax_based_on_year` YEAR DEFAULT NULL 
    COMMENT 'If preliminary, which year was used as reference'
    AFTER `tax_published_date`;

-- Add indexes
ALTER TABLE `tax_category`
ADD INDEX `idx_mapping_status` (`tax_mapping_status`, `tax_year`),
ADD INDEX `idx_published_date` (`tax_published_date`);

-- Backfill existing data
-- Mark all existing tax categories as 'Official' (historical data)
UPDATE `tax_category`
SET 
    `tax_mapping_status` = CASE 
        WHEN `tax_year` <= 2025 THEN 'Official'
        WHEN `tax_year` = 2026 THEN 'Preliminary'
        ELSE 'Draft'
    END,
    `tax_published_date` = CASE 
        WHEN `tax_year` <= 2025 THEN CONCAT(`tax_year`, '-10-01')
        ELSE NULL
    END,
    `tax_based_on_year` = CASE 
        WHEN `tax_year` = 2026 THEN 2025
        ELSE NULL
    END
WHERE `status` = 'Active';

-- Verify changes
SELECT 
    'Migration Complete: tax_category' as status,
    tax_year,
    tax_mapping_status,
    COUNT(*) as category_count
FROM `tax_category`
GROUP BY tax_year, tax_mapping_status
ORDER BY tax_year DESC;

COMMIT;

-- ============================================================
-- Verification Queries
-- ============================================================
-- DESCRIBE tax_category;
-- SELECT tax_id, tax_code, tax_year, tax_mapping_status, 
--        tax_published_date, tax_based_on_year 
-- FROM tax_category ORDER BY tax_year DESC LIMIT 10;
-- ============================================================