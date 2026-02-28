-- ============================================================
-- Migration: Create Mapping Notification Table
-- Description: Queue notifications for users when tax
--              mappings are updated or require review
-- Author: TaxLah Development Team
-- Date: 2026-02-28
-- ============================================================

USE taxlah_development;

START TRANSACTION;

-- Create notification queue table
CREATE TABLE IF NOT EXISTS `account_expenses_mapping_notification` (
  `notification_id` INT NOT NULL AUTO_INCREMENT,
  `account_id` INT NOT NULL,
  `tax_year` YEAR NOT NULL,
  
  -- Notification details
  `notification_type` ENUM(
    'Mapping_Available',      -- Official mapping published
    'Category_Changed',       -- Categories updated after remap
    'Review_Required',        -- Low confidence, needs user review
    'Preliminary_Reminder',   -- Remind user about estimated status
    'Expiry_Warning'          -- Receipts might expire soon
  ) NOT NULL,
  
  -- Notification content
  `notification_title` VARCHAR(256) DEFAULT NULL,
  `notification_message` TEXT DEFAULT NULL,
  `notification_priority` ENUM('Low', 'Normal', 'High') DEFAULT 'Normal',
  
  -- Affected data
  `affected_expenses_count` INT DEFAULT 0,
  `notification_data` JSON DEFAULT NULL COMMENT 'Details of changes, affected categories, etc.',
  
  -- Delivery status
  `notification_status` ENUM('Pending', 'Sent', 'Read', 'Dismissed', 'Failed') DEFAULT 'Pending',
  `delivery_method` SET('Push', 'Email', 'InApp') DEFAULT 'InApp,Push',
  
  -- Action URL
  `action_url` VARCHAR(256) DEFAULT NULL COMMENT 'Deep link to review page',
  
  -- Timestamps
  `created_date` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `sent_date` DATETIME DEFAULT NULL,
  `read_date` DATETIME DEFAULT NULL,
  `dismissed_date` DATETIME DEFAULT NULL,
  
  -- Retry logic
  `retry_count` INT DEFAULT 0,
  `last_retry_date` DATETIME DEFAULT NULL,
  
  PRIMARY KEY (`notification_id`),
  
  -- Indexes
  KEY `idx_account_year` (`account_id`, `tax_year`),
  KEY `idx_status` (`notification_status`),
  KEY `idx_type` (`notification_type`),
  KEY `idx_created` (`created_date`),
  KEY `idx_pending` (`notification_status`, `created_date`),
  
  -- Foreign key
  CONSTRAINT `fk_mapping_notif_account` 
    FOREIGN KEY (`account_id`) 
    REFERENCES `account` (`account_id`) 
    ON DELETE CASCADE
    
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Notification queue for tax mapping updates';

-- Create index on JSON field (MySQL 8.0+)
ALTER TABLE `account_expenses_mapping_notification`
ADD INDEX `idx_notification_data` ((CAST(notification_data->>'$.requires_review' AS UNSIGNED)));

-- Create view for pending notifications
CREATE OR REPLACE VIEW `v_pending_mapping_notifications` AS
SELECT 
    n.notification_id,
    n.account_id,
    a.account_name,
    a.account_email,
    n.tax_year,
    n.notification_type,
    n.notification_title,
    n.notification_message,
    n.notification_priority,
    n.affected_expenses_count,
    n.delivery_method,
    n.action_url,
    n.created_date,
    n.retry_count,
    -- Extract data from JSON
    JSON_UNQUOTE(JSON_EXTRACT(n.notification_data, '$.changed_expenses')) as changed_count,
    JSON_UNQUOTE(JSON_EXTRACT(n.notification_data, '$.requires_review')) as review_count,
    -- Get device info for push notifications
    (SELECT GROUP_CONCAT(device_fcm_token SEPARATOR ',')
     FROM account_device ad
     WHERE ad.account_id = n.account_id 
       AND ad.device_status = 'Active'
       AND ad.device_enable_fcm = 'Yes') as fcm_tokens
FROM account_expenses_mapping_notification n
JOIN account a ON n.account_id = a.account_id
WHERE n.notification_status = 'Pending'
  AND n.retry_count < 3
ORDER BY n.notification_priority DESC, n.created_date ASC;

-- Verify table creation
SELECT 
    'Migration Complete: account_expenses_mapping_notification' as status,
    COUNT(*) as total_records
FROM `account_expenses_mapping_notification`;

COMMIT;

-- ============================================================
-- Verification Queries
-- ============================================================
-- DESCRIBE account_expenses_mapping_notification;
-- SELECT * FROM v_pending_mapping_notifications LIMIT 10;
-- ============================================================