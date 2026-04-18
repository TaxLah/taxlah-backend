-- Migration 014: Add AI processing status to account_expenses
-- Tracks async OpenAI receipt analysis progress
-- ai_processing_status: 'None' | 'Queued' | 'Processing' | 'Completed' | 'Failed'

ALTER TABLE `account_expenses`
    ADD COLUMN `ai_processing_status` ENUM('None','Queued','Processing','Completed','Failed') NOT NULL DEFAULT 'None' AFTER `expenses_mapping_date`,
    ADD COLUMN `ai_processing_result` JSON NULL AFTER `ai_processing_status`,
    ADD INDEX `idx_ai_processing_status` (`ai_processing_status`);
