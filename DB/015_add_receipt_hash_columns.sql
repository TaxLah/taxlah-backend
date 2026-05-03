-- Migration 015: Add receipt hash columns for duplicate detection
-- receipt_hash  : SHA-256 hex of the raw image bytes  → catches exact same-file re-uploads
-- receipt_phash : 64-bit perceptual (average) hash     → catches same receipt photographed multiple times
--
-- Hamming-distance query pattern (same account, similar image):
--   SELECT receipt_id FROM receipt
--   WHERE account_id = ? AND BIT_COUNT(receipt_phash ^ ?) <= 10

ALTER TABLE `receipt`
    ADD COLUMN `receipt_hash`  VARCHAR(64)      DEFAULT NULL COMMENT 'SHA-256 hex of raw image bytes; NULL for non-image files',
    ADD COLUMN `receipt_phash` BIGINT UNSIGNED  DEFAULT NULL COMMENT '64-bit average perceptual hash; NULL for PDFs/non-image files',
    ADD INDEX  `idx_receipt_exact_hash`  (`account_id`, `receipt_hash`),
    ADD INDEX  `idx_receipt_phash`       (`account_id`, `receipt_phash`);
