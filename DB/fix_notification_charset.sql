-- Fix account_notification table charset to support emojis
-- Run this SQL to permanently fix the collation issue

-- 1. Alter the table to use utf8mb4
ALTER TABLE `account_notification` 
CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 2. Specifically alter the text columns
ALTER TABLE `account_notification` 
MODIFY COLUMN `notification_title` VARCHAR(256) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
MODIFY COLUMN `notification_description` TEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Verify the change
SHOW FULL COLUMNS FROM `account_notification`;
