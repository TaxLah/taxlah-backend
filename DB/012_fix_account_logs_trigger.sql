-- ============================================================
-- Migration 012: Fix account_logs + account_ai trigger
--
-- Fixes two bugs introduced by migration 010 (company_name):
--
--   1. account_logs was missing company_name column, causing
--      the account_ai AFTER INSERT trigger to fail with
--      ER_WRONG_VALUE_COUNT_ON_ROW because it uses SELECT *
--      which now returns one extra column.
--
--   2. The original account_ai trigger used:
--          INSERT INTO account_logs SELECT * FROM account
--      with NO WHERE clause — this copies every row in the
--      entire account table on each INSERT (catastrophic for
--      larger datasets). Fixed to scope by NEW.account_id.
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. Add missing company_name column to account_logs
--    (must match position in account table: AFTER account_fullname)
-- ─────────────────────────────────────────────────────────────
ALTER TABLE `account_logs`
    ADD COLUMN `company_name` VARCHAR(200) DEFAULT NULL
        AFTER `account_fullname`;

-- ─────────────────────────────────────────────────────────────
-- 2. Replace the broken trigger with a scoped version
-- ─────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS `account_ai`;

CREATE TRIGGER `account_ai`
AFTER INSERT ON `account`
FOR EACH ROW
INSERT INTO account_logs SELECT * FROM account WHERE account_id = NEW.account_id;
