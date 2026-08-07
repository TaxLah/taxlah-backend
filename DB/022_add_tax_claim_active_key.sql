-- ============================================================
-- Migration 022: third key column, so retired rows are exempt from the unique key
--
-- Migration 021 added taxsub_key and dependant_key so the upsert could finally match.
-- But a plain unique index over those constrains EVERY row, and account_tax_claim
-- already holds rows retired by earlier cleanups — in development, one key had a single
-- Active row alongside ten retired ones. Creating the index failed on those collisions.
--
-- Retiring duplicates rather than deleting them is the right call (nothing is thrown
-- away, and every query that reads claimed_amount filters status='Active'), so the index
-- has to ignore retired rows instead.
--
-- MySQL has no partial indexes, but it does treat every NULL in a unique index as
-- distinct — the same behaviour that caused this bug in the first place. Used
-- deliberately here it gives exactly what is needed: active_key is 1 for live rows and
-- NULL for retired ones, so retired rows can pile up freely while at most one Active row
-- per claim key is ever allowed.
--
-- VIRTUAL for the same reason as 021: a STORED column forces a table rebuild, which
-- fails on this table with "Cannot add foreign key constraint".
--
-- Additive only: one new column.
-- ============================================================

USE taxlah_development;

ALTER TABLE `account_tax_claim`
    ADD COLUMN `active_key` TINYINT AS (CASE WHEN `status` = 'Active' THEN 1 ELSE NULL END) VIRTUAL
        COMMENT '1 while Active, NULL once retired — exempts retired rows from unique_claim_v2';
