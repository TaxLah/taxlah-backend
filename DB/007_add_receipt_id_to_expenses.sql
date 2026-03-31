-- Migration: Add receipt_id to account_expenses table
-- Date: 2026-03-31
-- Purpose: Link expenses to receipt records for file attachments

-- Add receipt_id column to account_expenses
ALTER TABLE `account_expenses` 
ADD COLUMN `receipt_id` INT DEFAULT NULL AFTER `expenses_receipt_no`,
ADD INDEX `idx_receipt_id` (`receipt_id`),
ADD CONSTRAINT `fk_expenses_receipt` 
    FOREIGN KEY (`receipt_id`) 
    REFERENCES `receipt` (`receipt_id`) 
    ON DELETE SET NULL;

-- Update existing stored procedure comment if needed
-- sp_upload_receipt_with_mapping now can optionally handle receipt_id
