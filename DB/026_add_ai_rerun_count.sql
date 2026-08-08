-- ============================================================
-- Migration 026: track AI re-runs per expense
--
-- Users may re-run the AI tax analysis on an expense once — a paid-subscriber
-- feature with a hard limit, so the count has to live on the row rather than be
-- inferred. A separate log table would also work, but the question the endpoint
-- asks is simply "has this expense used its re-run", which one small column
-- answers without a join.
--
-- Additive only: one NOT NULL column with a default, no data touched.
-- ============================================================

USE taxlah_development;

ALTER TABLE `account_expenses`
    ADD COLUMN `ai_rerun_count` TINYINT UNSIGNED NOT NULL DEFAULT 0
        COMMENT 'How many times the AI analysis has been re-run for this expense';
