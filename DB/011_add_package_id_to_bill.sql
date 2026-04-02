-- ============================================================
-- Migration 011: Add sub_package_id to bill table
--
-- Adds a direct FK column from bill → subscription_package so
-- that:
--   1. Package info is available on the bill row without
--      chaining through account_subscription first.
--   2. One-off bills (subscription_id IS NULL) can still
--      carry a package reference.
-- ============================================================

ALTER TABLE `bill`
    ADD COLUMN `sub_package_id` INT DEFAULT NULL
        COMMENT 'FK to subscription_package — which plan is being billed'
        AFTER `subscription_id`,
    ADD KEY `idx_bill_package` (`sub_package_id`),
    ADD CONSTRAINT `fk_bill_sub_package`
        FOREIGN KEY (`sub_package_id`)
        REFERENCES `subscription_package` (`sub_package_id`)
        ON DELETE SET NULL ON UPDATE CASCADE;
