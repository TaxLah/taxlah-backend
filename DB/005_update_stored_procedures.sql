-- ============================================================
-- Migration: Update Stored Procedures for Mapping
-- Description: Create new stored procedures for handling
--              deferred tax categorization
-- Author: TaxLah Development Team
-- Date: 2026-02-28
-- ============================================================

USE taxlah_development;

DELIMITER ;;

-- ============================================================
-- SP: Check if Official Tax Mapping Exists
-- ============================================================
DROP PROCEDURE IF EXISTS `sp_check_official_mapping_exists`;;
CREATE PROCEDURE `sp_check_official_mapping_exists` (
    IN `p_tax_year` YEAR,
    OUT `p_exists` BOOLEAN,
    OUT `p_published_date` DATE
)
BEGIN
    SELECT 
        COUNT(*) > 0,
        MAX(tax_published_date)
    INTO p_exists, p_published_date
    FROM tax_category
    WHERE tax_year = p_tax_year 
      AND tax_mapping_status = 'Official'
      AND status = 'Active';
END;;

-- ============================================================
-- SP: Preliminary AI Categorization (Placeholder)
-- ============================================================
DROP PROCEDURE IF EXISTS `sp_ai_categorize_expense_preliminary`;;
CREATE PROCEDURE `sp_ai_categorize_expense_preliminary` (
    IN `p_merchant_name` VARCHAR(256),
    IN `p_merchant_id` VARCHAR(100),
    IN `p_amount` DECIMAL(15,2),
    IN `p_tax_year` YEAR,
    OUT `p_tax_id` INT,
    OUT `p_taxsub_id` INT,
    OUT `p_confidence` DECIMAL(5,2)
)
BEGIN
    DECLARE v_previous_year YEAR;
    
    SET v_previous_year = p_tax_year - 1;
    
    -- Priority 1: Check merchant_tax_category mapping
    SELECT mtc.tax_id, mtc.taxsub_id, 85.00
    INTO p_tax_id, p_taxsub_id, p_confidence
    FROM merchant_tax_category mtc
    JOIN merchant m ON mtc.merchant_id = m.merchant_id
    WHERE m.merchant_uniq_no = p_merchant_id
      AND mtc.status = 'Active'
    ORDER BY mtc.priority ASC
    LIMIT 1;
    
    IF p_tax_id IS NOT NULL THEN
        -- Use previous year's tax_id as reference
        SELECT tax_id INTO p_tax_id
        FROM tax_category
        WHERE tax_code = (SELECT tax_code FROM tax_category WHERE tax_id = p_tax_id LIMIT 1)
          AND tax_year = v_previous_year
          AND status = 'Active'
        LIMIT 1;
        
        LEAVE sp_ai_categorize_expense_preliminary;
    END IF;
    
    -- Priority 2: Simple pattern matching (use previous year's categories)
    IF p_merchant_name LIKE '%POPULAR%' OR p_merchant_name LIKE '%MPH%' OR p_merchant_name LIKE '%BOOKSTORE%' THEN
        SELECT tax_id INTO p_tax_id
        FROM tax_category
        WHERE tax_code = 'LIFESTYLE' AND tax_year = v_previous_year AND status = 'Active'
        LIMIT 1;
        SET p_confidence = 75.00;
        
    ELSEIF p_merchant_name LIKE '%CLINIC%' OR p_merchant_name LIKE '%HOSPITAL%' OR p_merchant_name LIKE '%PHARMACY%' THEN
        SELECT tax_id INTO p_tax_id
        FROM tax_category
        WHERE tax_code = 'MEDICAL' AND tax_year = v_previous_year AND status = 'Active'
        LIMIT 1;
        SET p_confidence = 70.00;
        
    ELSEIF p_merchant_name LIKE '%GYM%' OR p_merchant_name LIKE '%FITNESS%' OR p_merchant_name LIKE '%SPORT%' THEN
        SELECT tax_id INTO p_tax_id
        FROM tax_category
        WHERE tax_code = 'LIFESTYLE' AND tax_year = v_previous_year AND status = 'Active'
        LIMIT 1;
        SET p_confidence = 70.00;
        
    ELSE
        -- Default: Lifestyle (lowest confidence)
        SELECT tax_id INTO p_tax_id
        FROM tax_category
        WHERE tax_code = 'LIFESTYLE' AND tax_year = v_previous_year AND status = 'Active'
        LIMIT 1;
        SET p_confidence = 50.00;
    END IF;
    
    -- Try to find matching subcategory
    SET p_taxsub_id = NULL;
    
END;;

-- ============================================================
-- SP: Official AI Categorization
-- ============================================================
DROP PROCEDURE IF EXISTS `sp_ai_categorize_expense`;;
CREATE PROCEDURE `sp_ai_categorize_expense` (
    IN `p_merchant_name` VARCHAR(256),
    IN `p_merchant_id` VARCHAR(100),
    IN `p_amount` DECIMAL(15,2),
    IN `p_tax_year` YEAR,
    OUT `p_tax_id` INT,
    OUT `p_taxsub_id` INT,
    OUT `p_confidence` DECIMAL(5,2)
)
BEGIN
    -- Priority 1: Check merchant_tax_category mapping
    SELECT mtc.tax_id, mtc.taxsub_id, 95.00
    INTO p_tax_id, p_taxsub_id, p_confidence
    FROM merchant_tax_category mtc
    JOIN merchant m ON mtc.merchant_id = m.merchant_id
    WHERE m.merchant_uniq_no = p_merchant_id
      AND mtc.status = 'Active'
    ORDER BY mtc.priority ASC
    LIMIT 1;
    
    IF p_tax_id IS NOT NULL THEN
        LEAVE sp_ai_categorize_expense;
    END IF;
    
    -- Priority 2: Pattern matching with current year categories
    IF p_merchant_name LIKE '%POPULAR%' OR p_merchant_name LIKE '%MPH%' OR p_merchant_name LIKE '%BOOKSTORE%' THEN
        SELECT tax_id INTO p_tax_id
        FROM tax_category
        WHERE tax_code = 'LIFESTYLE' AND tax_year = p_tax_year AND status = 'Active'
        LIMIT 1;
        
        SELECT taxsub_id INTO p_taxsub_id
        FROM tax_subcategory
        WHERE tax_id = p_tax_id AND taxsub_code = 'BOOKS' AND status = 'Active'
        LIMIT 1;
        
        SET p_confidence = 85.00;
        
    ELSEIF p_merchant_name LIKE '%CLINIC%' OR p_merchant_name LIKE '%HOSPITAL%' OR p_merchant_name LIKE '%PHARMACY%' THEN
        SELECT tax_id INTO p_tax_id
        FROM tax_category
        WHERE tax_code = 'MEDICAL' AND tax_year = p_tax_year AND status = 'Active'
        LIMIT 1;
        
        SET p_taxsub_id = NULL;
        SET p_confidence = 80.00;
        
    ELSEIF p_merchant_name LIKE '%GYM%' OR p_merchant_name LIKE '%FITNESS%' OR p_merchant_name LIKE '%SPORT%' THEN
        SELECT tax_id INTO p_tax_id
        FROM tax_category
        WHERE tax_code = 'LIFESTYLE' AND tax_year = p_tax_year AND status = 'Active'
        LIMIT 1;
        
        SELECT taxsub_id INTO p_taxsub_id
        FROM tax_subcategory
        WHERE tax_id = p_tax_id AND taxsub_code = 'GYM' AND status = 'Active'
        LIMIT 1;
        
        SET p_confidence = 80.00;
        
    ELSE
        -- Default: Lifestyle
        SELECT tax_id INTO p_tax_id
        FROM tax_category
        WHERE tax_code = 'LIFESTYLE' AND tax_year = p_tax_year AND status = 'Active'
        LIMIT 1;
        
        SET p_taxsub_id = NULL;
        SET p_confidence = 50.00;
    END IF;
    
END;;

-- ============================================================
-- SP: Upload Receipt with Smart Mapping
-- ============================================================
DROP PROCEDURE IF EXISTS `sp_upload_receipt_with_mapping`;;
CREATE PROCEDURE `sp_upload_receipt_with_mapping` (
    IN `p_account_id` INT,
    IN `p_receipt_date` DATE,
    IN `p_merchant_name` VARCHAR(256),
    IN `p_amount` DECIMAL(15,2),
    IN `p_merchant_id` VARCHAR(100),
    IN `p_receipt_no` VARCHAR(256),
    OUT `p_expenses_id` INT,
    OUT `p_mapping_status` VARCHAR(20),
    OUT `p_tax_category_name` VARCHAR(256),
    OUT `p_confidence` DECIMAL(5,2),
    OUT `p_message` VARCHAR(500)
)
BEGIN
    DECLARE v_tax_year YEAR;
    DECLARE v_official_mapping_exists BOOLEAN DEFAULT FALSE;
    DECLARE v_tax_id INT DEFAULT NULL;
    DECLARE v_taxsub_id INT DEFAULT NULL;
    DECLARE v_confidence DECIMAL(5,2) DEFAULT NULL;
    DECLARE v_mapping_version VARCHAR(50);
    DECLARE v_published_date DATE;
    
    SET v_tax_year = YEAR(p_receipt_date);
    
    -- Check if official LHDN mapping exists
    CALL sp_check_official_mapping_exists(v_tax_year, v_official_mapping_exists, v_published_date);
    
    IF v_official_mapping_exists THEN
        -- Use official mapping
        SET v_mapping_version = CONCAT(v_tax_year, '-official');
        
        CALL sp_ai_categorize_expense(
            p_merchant_name, p_merchant_id, p_amount, v_tax_year,
            v_tax_id, v_taxsub_id, v_confidence
        );
        
        INSERT INTO account_expenses (
            account_id, expenses_merchant_name, expenses_merchant_id,
            expenses_receipt_no, expenses_total_amount, 
            expenses_date, expenses_year,
            expenses_tax_category, expenses_tax_subcategory,
            expenses_mapping_status, expenses_mapping_confidence,
            expenses_mapping_version, expenses_mapping_date,
            expenses_tax_eligible, status
        ) VALUES (
            p_account_id, p_merchant_name, p_merchant_id,
            p_receipt_no, p_amount,
            p_receipt_date, v_tax_year,
            v_tax_id, v_taxsub_id,
            'Confirmed', v_confidence, v_mapping_version, NOW(),
            'Yes', 'Active'
        );
        
        SET p_expenses_id = LAST_INSERT_ID();
        SET p_mapping_status = 'Confirmed';
        SET p_confidence = v_confidence;
        
        SELECT tax_title INTO p_tax_category_name
        FROM tax_category WHERE tax_id = v_tax_id;
        
        SET p_message = CONCAT('Receipt categorized as "', p_tax_category_name, '" using official LHDN mapping');
        
    ELSE
        -- Use preliminary mapping
        SET v_mapping_version = CONCAT(v_tax_year, '-preliminary');
        
        CALL sp_ai_categorize_expense_preliminary(
            p_merchant_name, p_merchant_id, p_amount, v_tax_year,
            v_tax_id, v_taxsub_id, v_confidence
        );
        
        INSERT INTO account_expenses (
            account_id, expenses_merchant_name, expenses_merchant_id,
            expenses_receipt_no, expenses_total_amount,
            expenses_date, expenses_year,
            expenses_tax_category, expenses_tax_subcategory,
            expenses_mapping_status, expenses_mapping_confidence,
            expenses_mapping_version, expenses_mapping_date,
            expenses_original_tax_category,
            expenses_tax_eligible, status
        ) VALUES (
            p_account_id, p_merchant_name, p_merchant_id,
            p_receipt_no, p_amount,
            p_receipt_date, v_tax_year,
            v_tax_id, v_taxsub_id,
            'Estimated', v_confidence, v_mapping_version, NOW(),
            v_tax_id,
            'Yes', 'Active'
        );
        
        SET p_expenses_id = LAST_INSERT_ID();
        SET p_mapping_status = 'Estimated';
        SET p_confidence = v_confidence;
        
        SELECT tax_title INTO p_tax_category_name
        FROM tax_category WHERE tax_id = v_tax_id;
        
        SET p_message = CONCAT(
            'Receipt saved with estimated category "', p_tax_category_name, 
            '". Official ', v_tax_year, ' LHDN tax categories will be available in October.'
        );
    END IF;
    
    -- Log initial categorization in history
    INSERT INTO account_expenses_mapping_history (
        expenses_id, new_tax_category, new_tax_subcategory,
        change_reason, confidence_after, mapping_version_after,
        changed_by, changed_date
    ) VALUES (
        p_expenses_id, v_tax_id, v_taxsub_id,
        'Initial', v_confidence, v_mapping_version,
        'System', NOW()
    );
    
END;;

DELIMITER ;

-- Verify stored procedures
SELECT 
    'Migration Complete: Stored Procedures' as status,
    COUNT(*) as procedure_count
FROM information_schema.ROUTINES
WHERE ROUTINE_SCHEMA = 'taxlah_development'
  AND ROUTINE_NAME LIKE 'sp_%mapping%'
  OR ROUTINE_NAME LIKE 'sp_ai_categorize%'
  OR ROUTINE_NAME LIKE 'sp_upload_receipt%';

-- ============================================================
-- Verification Queries
-- ============================================================
-- SHOW PROCEDURE STATUS WHERE Db = 'taxlah_development';
-- SHOW CREATE PROCEDURE sp_upload_receipt_with_mapping;
-- ============================================================