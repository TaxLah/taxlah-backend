-- ============================================================
-- Migration 025: remember where a bill's receipt PDF was written
--
-- Receipts are generated on demand. Without somewhere to record the result, every
-- download would rebuild the same document — wasteful, and worse, a receipt rebuilt
-- later could differ from the one the customer already has if any input changed.
--
-- The bill row is the right owner: it already holds the authoritative figures
-- (subtotal, sst_rate, sst_amount, total_amount, invoice_no) captured at billing time.
-- Storing the path beside them means the PDF is written once, on first request, and
-- served from disk after that.
--
-- Additive only: one nullable column.
-- ============================================================

USE taxlah_development;

ALTER TABLE `bill`
    ADD COLUMN `receipt_pdf_path` VARCHAR(500) NULL
        COMMENT 'Relative path of the generated receipt PDF; NULL until first requested';
