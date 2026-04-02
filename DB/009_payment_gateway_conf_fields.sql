-- ============================================================
-- Migration 009: Extend payment_gateway_conf table
-- Adds provider type, environment, default flag,
-- payment methods list, and auto-update timestamp.
-- ============================================================

ALTER TABLE `payment_gateway_conf`
    -- Gateway provider type (separate from the display name)
    ADD COLUMN `pg_provider`        ENUM('ToyyibPay','Chip','Stripe','Manual')
                                    NOT NULL DEFAULT 'Manual'
                                    AFTER `pg_name`,

    -- Production vs Sandbox environment
    ADD COLUMN `pg_environment`     ENUM('Production','Sandbox')
                                    NOT NULL DEFAULT 'Production'
                                    AFTER `pg_provider`,

    -- Whether this is the default gateway (only one allowed)
    ADD COLUMN `pg_is_default`      TINYINT(1) NOT NULL DEFAULT 0
                                    AFTER `pg_environment`,

    -- Supported payment method tags (JSON array of strings)
    ADD COLUMN `pg_payment_methods` JSON DEFAULT NULL
                                    AFTER `pg_config`,

    -- Ensure last_modified auto-updates on every row change
    MODIFY COLUMN `last_modified`   DATETIME NOT NULL
                                    DEFAULT CURRENT_TIMESTAMP
                                    ON UPDATE CURRENT_TIMESTAMP,

    ADD INDEX `idx_pg_provider_env` (`pg_provider`, `pg_environment`),
    ADD INDEX `idx_pg_default`      (`pg_is_default`),
    ADD INDEX `idx_pg_status`       (`status`);
