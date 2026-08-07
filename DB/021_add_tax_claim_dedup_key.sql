-- ============================================================
-- Migration 021: Make the account_tax_claim upsert actually work
--
-- The existing UNIQUE KEY unique_claim (account_id, tax_year, tax_id, taxsub_id,
-- dependant_id) never fires, because the worker writes NULL into taxsub_id and
-- dependant_id and MySQL treats every NULL in a unique index as distinct. So
-- `ON DUPLICATE KEY UPDATE` in queue/worker.js has never run: every tax-eligible
-- receipt inserts a brand new claim row instead of updating the existing one, and
-- each row carries the running total at the moment it was written.
--
-- The obvious fix — making those columns NOT NULL DEFAULT 0 — is not available:
-- both carry foreign keys (fk_claim_taxsub, fk_claim_dependant) and there is no row
-- with id 0 in tax_subcategory or account_dependant, so the constraints would break.
--
-- Instead this adds two generated columns that fold NULL to 0, to be used in a
-- replacement unique key. NULLs stay NULL, both foreign keys stay intact.
--
-- VIRTUAL, not STORED, and that is not a style choice. A STORED generated column forces
-- ALGORITHM=COPY, which rebuilds the table and recreates every foreign key on it — and
-- that fails here with "Cannot add foreign key constraint". VIRTUAL is an in-place
-- change: no rebuild, no FK recreation, and no long lock on a table with live data.
-- MySQL 8 indexes virtual columns fine, which is all this needs.
--
-- This file only adds the columns. The unique index is created by
-- scripts/repair-tax-claims.js AFTER the existing duplicates have been collapsed —
-- adding it first would fail, because with these columns in place the duplicates
-- finally do collide.
--
-- Additive only: two new columns. Nothing is dropped, deleted or modified.
-- ============================================================

USE taxlah_development;

ALTER TABLE `account_tax_claim`
    ADD COLUMN `taxsub_key`    INT AS (COALESCE(`taxsub_id`, 0))    VIRTUAL
        COMMENT 'NULL-folded taxsub_id, for the dedup unique key',
    ADD COLUMN `dependant_key` INT AS (COALESCE(`dependant_id`, 0)) VIRTUAL
        COMMENT 'NULL-folded dependant_id, for the dedup unique key';
