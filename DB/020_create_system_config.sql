-- ============================================================
-- Migration 020: Runtime configuration store
--
-- Moves service credentials (CHIP, Gmail, OpenAI) out of env.yaml and into the database
-- so a superadmin can rotate them without a deploy.
--
-- Additive only: creates two new tables. Nothing is dropped, deleted or modified.
-- Values are written by the application, encrypted with AES-256-GCM (utils/secretbox.js);
-- the master key stays in CONFIG_ENCRYPTION_KEY and never enters the database.
--
-- Each environment has its own database, so no environment column is needed here.
-- ============================================================

USE taxlah_development;

CREATE TABLE IF NOT EXISTS `system_config` (
    `config_id`     INT NOT NULL AUTO_INCREMENT,

    -- Logical grouping, e.g. 'chip', 'gmail', 'openai'. One admin screen section each.
    `config_group`  VARCHAR(64)  NOT NULL,
    `config_key`    VARCHAR(128) NOT NULL,

    -- TEXT rather than VARCHAR: the GCM envelope adds ~60 bytes of overhead, and some
    -- values (the CHIP webhook public key) are multi-line PEM blocks.
    `config_value`  TEXT DEFAULT NULL,

    -- When 1, config_value holds an encrypted envelope and the plaintext is never
    -- returned to the browser — only a masked hint.
    `is_secret`     TINYINT(1) NOT NULL DEFAULT 0,

    -- Drives the form control the admin screen renders.
    `value_type`    ENUM('string','multiline','number','boolean','url','email') NOT NULL DEFAULT 'string',

    `label`         VARCHAR(255) DEFAULT NULL,
    `description`   VARCHAR(512) DEFAULT NULL,
    `is_required`   TINYINT(1) NOT NULL DEFAULT 0,
    `sort_order`    INT NOT NULL DEFAULT 0,

    `status`        ENUM('Active','Inactive') NOT NULL DEFAULT 'Active',
    `updated_by`    INT DEFAULT NULL COMMENT 'admin.admin_id of the last editor',

    `created_at`    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `last_modified` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (`config_id`),
    UNIQUE KEY `uniq_group_key` (`config_group`, `config_key`),
    KEY `idx_group_status` (`config_group`, `status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;


-- Audit trail. Deliberately stores MASKED values only: a history table holding plaintext
-- credentials would undo the point of encrypting the live ones.
CREATE TABLE IF NOT EXISTS `system_config_audit` (
    `audit_id`         INT NOT NULL AUTO_INCREMENT,

    `config_group`     VARCHAR(64)  NOT NULL,
    `config_key`       VARCHAR(128) NOT NULL,

    `action`           ENUM('Create','Update','Test') NOT NULL DEFAULT 'Update',
    `old_value_masked` VARCHAR(255) DEFAULT NULL,
    `new_value_masked` VARCHAR(255) DEFAULT NULL,

    `changed_by`       INT DEFAULT NULL COMMENT 'admin.admin_id',
    `changed_by_name`  VARCHAR(255) DEFAULT NULL,
    `ip_address`       VARCHAR(64)  DEFAULT NULL,
    `notes`            VARCHAR(512) DEFAULT NULL,

    `created_at`       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (`audit_id`),
    KEY `idx_group_key_time` (`config_group`, `config_key`, `created_at`),
    KEY `idx_changed_by` (`changed_by`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;


-- Register the keys the application expects, without any values. Seeding the actual
-- credentials is done by scripts/seed-system-config.js, which reads the current
-- environment and encrypts each value — plaintext secrets must not sit in a .sql file.
--
-- INSERT IGNORE so re-running this migration never overwrites a value an admin has since
-- changed through the portal.
INSERT IGNORE INTO `system_config`
    (`config_group`, `config_key`, `is_secret`, `value_type`, `label`, `description`, `is_required`, `sort_order`)
VALUES
    -- ── CHIP payment gateway ──────────────────────────────────────────────
    ('chip', 'CHIP_API_URL',            0, 'url',       'API Base URL',        'CHIP API endpoint, e.g. https://gate.chip-in.asia/api/v1', 1, 10),
    ('chip', 'CHIP_BRAND_ID',           0, 'string',    'Brand ID',            'CHIP brand identifier (UUID)',                              1, 20),
    ('chip', 'CHIP_API_KEY',            1, 'string',    'API Key',             'Secret key used to authenticate against the CHIP API',      1, 30),
    ('chip', 'CHIP_WEBHOOK_PUBLIC_KEY', 0, 'multiline', 'Webhook Public Key',  'PEM public key used to verify webhook signatures',          1, 40),
    ('chip', 'CHIP_CALLBACK_URL',       0, 'url',       'Callback URL',        'Where CHIP posts payment webhooks',                         0, 50),

    -- ── Gmail (transactional email) ───────────────────────────────────────
    ('gmail', 'GMAIL_USER',             0, 'email',     'Sender Address',      'Address transactional email is sent from',                  1, 10),
    ('gmail', 'GMAIL_CLIENT_ID',        0, 'string',    'OAuth Client ID',     'Google OAuth 2.0 client ID',                                1, 20),
    ('gmail', 'GMAIL_CLIENT_SECRET',    1, 'string',    'OAuth Client Secret', 'Google OAuth 2.0 client secret',                            1, 30),
    ('gmail', 'GMAIL_REFRESH_TOKEN',    1, 'string',    'OAuth Refresh Token', 'Long-lived token used to mint access tokens',               1, 40),

    -- ── OpenAI ────────────────────────────────────────────────────────────
    ('openai', 'OPENAI_API_KEY',        1, 'string',    'API Key',             'Used for receipt OCR and tax categorisation',               1, 10);
