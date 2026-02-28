-- ============================================================
-- Migration: Create Mapping History Table
-- Description: Track all changes to expense categorization
--              for audit trail and user transparency
-- Author: TaxLah Development Team
-- Date: 2026-02-28
-- ============================================================

USE taxlah_development;

START TRANSACTION;

-- Create mapping history table
CREATE TABLE IF NOT EXISTS `account_expenses_mapping_history` (
  `history_id` INT NOT NULL AUTO_INCREMENT,
  `expenses_id` INT NOT NULL COMMENT 'FK to account_expenses',
  
  -- Track category changes
  `old_tax_category` INT DEFAULT NULL,
  `new_tax_category` INT DEFAULT NULL,
  `old_tax_subcategory` INT DEFAULT NULL,
  `new_tax_subcategory` INT DEFAULT NULL,
  
  -- Track why change happened
  `change_reason` ENUM('Initial', 'LHDN_Update', 'User_Override', 'AI_Refinement', 'Admin_Correction', 'Merchant_Pattern') 
    NOT NULL DEFAULT 'Initial'
    COMMENT 'Reason for categorization change',
  
  -- Track confidence scores
  `confidence_before` DECIMAL(5,2) DEFAULT NULL COMMENT 'AI confidence before change',
  `confidence_after` DECIMAL(5,2) DEFAULT NULL COMMENT 'AI confidence after change',
  
  -- Track mapping versions
  `mapping_version_before` VARCHAR(50) DEFAULT NULL,
  `mapping_version_after` VARCHAR(50) DEFAULT NULL,
  
  -- Track who made the change
  `changed_by` ENUM('System', 'User', 'Admin', 'AI') DEFAULT 'System',
  `changed_by_user_id` INT DEFAULT NULL COMMENT 'account_id or admin_id',
  
  -- Additional metadata
  `change_notes` TEXT DEFAULT NULL,
  `change_metadata` JSON DEFAULT NULL COMMENT 'Extra data (merchant info, AI reasoning, etc.)',
  
  -- Timestamps
  `changed_date` DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  PRIMARY KEY (`history_id`),
  
  -- Indexes for common queries
  KEY `idx_expenses` (`expenses_id`),
  KEY `idx_change_reason` (`change_reason`),
  KEY `idx_changed_date` (`changed_date`),
  KEY `idx_expenses_date` (`expenses_id`, `changed_date`),
  KEY `idx_changed_by` (`changed_by`, `changed_by_user_id`),
  
  -- Foreign key constraints
  CONSTRAINT `fk_mapping_history_expenses` 
    FOREIGN KEY (`expenses_id`) 
    REFERENCES `account_expenses` (`expenses_id`) 
    ON DELETE CASCADE,
    
  CONSTRAINT `fk_mapping_history_old_tax` 
    FOREIGN KEY (`old_tax_category`) 
    REFERENCES `tax_category` (`tax_id`) 
    ON DELETE SET NULL,
    
  CONSTRAINT `fk_mapping_history_new_tax` 
    FOREIGN KEY (`new_tax_category`) 
    REFERENCES `tax_category` (`tax_id`) 
    ON DELETE SET NULL,
    
  CONSTRAINT `fk_mapping_history_old_taxsub` 
    FOREIGN KEY (`old_tax_subcategory`) 
    REFERENCES `tax_subcategory` (`taxsub_id`) 
    ON DELETE SET NULL,
    
  CONSTRAINT `fk_mapping_history_new_taxsub` 
    FOREIGN KEY (`new_tax_subcategory`) 
    REFERENCES `tax_subcategory` (`taxsub_id`) 
    ON DELETE SET NULL
    
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Audit trail for all expense categorization changes';

-- Create trigger to auto-log category changes
DELIMITER ;;

DROP TRIGGER IF EXISTS `trg_expenses_category_change`;;
CREATE TRIGGER `trg_expenses_category_change`
AFTER UPDATE ON `account_expenses`
FOR EACH ROW
BEGIN
    -- Only log if tax category actually changed
    IF (OLD.expenses_tax_category != NEW.expenses_tax_category 
        OR OLD.expenses_tax_subcategory != NEW.expenses_tax_subcategory) THEN
        
        INSERT INTO `account_expenses_mapping_history` (
            expenses_id,
            old_tax_category,
            new_tax_category,
            old_tax_subcategory,
            new_tax_subcategory,
            change_reason,
            confidence_before,
            confidence_after,
            mapping_version_before,
            mapping_version_after,
            changed_by,
            changed_date
        ) VALUES (
            NEW.expenses_id,
            OLD.expenses_tax_category,
            NEW.expenses_tax_category,
            OLD.expenses_tax_subcategory,
            NEW.expenses_tax_subcategory,
            CASE 
                WHEN NEW.expenses_mapping_status = 'Manual' THEN 'User_Override'
                WHEN OLD.expenses_mapping_version != NEW.expenses_mapping_version THEN 'LHDN_Update'
                ELSE 'AI_Refinement'
            END,
            OLD.expenses_mapping_confidence,
            NEW.expenses_mapping_confidence,
            OLD.expenses_mapping_version,
            NEW.expenses_mapping_version,
            CASE 
                WHEN NEW.expenses_mapping_status = 'Manual' THEN 'User'
                ELSE 'System'
            END,
            NOW()
        );
    END IF;
END;;

DELIMITER ;

-- Verify table creation
SELECT 
    'Migration Complete: account_expenses_mapping_history' as status,
    COUNT(*) as total_records
FROM `account_expenses_mapping_history`;

COMMIT;

-- ============================================================
-- Verification Queries
-- ============================================================
-- DESCRIBE account_expenses_mapping_history;
-- SHOW TRIGGERS LIKE 'account_expenses';
-- ============================================================