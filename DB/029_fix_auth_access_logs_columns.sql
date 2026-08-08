-- ============================================================
-- Migration 029: realign auth_access_logs with auth_access
--
-- Companion to 028, and it MUST ship together with it.
--
-- The auth_access AFTER INSERT trigger is:
--     INSERT INTO auth_access_logs SELECT * FROM auth_access ...
-- 028 gave auth_access two more columns than auth_access_logs, so SELECT * now
-- returns 16 values into 14 columns — ER_WRONG_VALUE_COUNT_ON_ROW — and every
-- insert into auth_access fails, which breaks registration and social login.
--
-- Appending the same two columns to auth_access_logs, in auth_access's order
-- (both were appended after is_deleted), makes SELECT * line up again. Purely
-- additive — no data touched, no trigger changed.
--
-- Known separate issue, deliberately NOT fixed here: that trigger has no WHERE
-- clause, so it copies the whole auth_access table into the log on every insert
-- (quadratic growth — the same bug migration 012 fixed for account). Correcting
-- it needs DROP TRIGGER, which the migration runner refuses by design, so it is
-- left for a reviewed follow-up. auth_access inserts are rare (registration /
-- first social sign-in), so the cost is bounded until then.
-- ============================================================

USE taxlah_development;

ALTER TABLE `auth_access_logs`
    ADD COLUMN `auth_provider` VARCHAR(20) NOT NULL DEFAULT 'Password',
    ADD COLUMN `auth_provider_uid` VARCHAR(191) NULL;
