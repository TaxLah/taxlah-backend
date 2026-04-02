-- ============================================================
-- Migration 010: Bill & Billing Transaction tables
--
-- Creates:
--   1. billing_sequence     — sequential number generator for
--                             BILL-YYYYMM-NNNNN, INV-YYYY-NNNNNN,
--                             TXN-YYYYMM-NNNNN
--   2. bill                 — invoice/demand document sent to user
--   3. billing_transaction  — full gateway audit record per payment
--                             attempt (CHIP / ToyyibPay / Stripe)
--
-- Alters:
--   4. account              — adds company_name for billing display
--
-- NOTE: The legacy `payment_transaction` table is NOT dropped.
--       It remains for historical data. New code writes to
--       `billing_transaction` only.
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. SEQUENCE TABLE
--    Tracks the last issued sequence number per type+period so
--    numbers are always sequential and never repeat.
--    Application calls: SELECT ... FOR UPDATE → increment → format.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `billing_sequence` (
    `seq_type`    ENUM('BILL','INV','TXN')   NOT NULL,
    `seq_period`  VARCHAR(7)                 NOT NULL
                  COMMENT 'BILL/TXN: YYYYMM  |  INV: YYYY',
    `last_seq`    INT UNSIGNED               NOT NULL DEFAULT 0,
    `updated_at`  DATETIME                   NOT NULL
                  DEFAULT CURRENT_TIMESTAMP
                  ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`seq_type`, `seq_period`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Monotonically increasing counters for bill/invoice/txn numbers';

-- ─────────────────────────────────────────────────────────────
-- 2. BILL TABLE
--    The demand document / invoice.  Created when a subscription
--    period is about to be charged.  checkout_url is populated
--    after CHIP /purchases/ is called.  invoice_no is assigned
--    only once payment is confirmed.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `bill` (
    -- ── Identity ──────────────────────────────────────────────
    `bill_id`               INT            NOT NULL AUTO_INCREMENT,
    `bill_no`               VARCHAR(30)    NOT NULL
                            COMMENT 'BILL-YYYYMM-NNNNN  e.g. BILL-202501-00302',
    `invoice_no`            VARCHAR(30)    DEFAULT NULL
                            COMMENT 'INV-YYYY-NNNNNN  assigned only on payment',

    -- ── Parties ───────────────────────────────────────────────
    `account_id`            INT            NOT NULL,
    `subscription_id`       INT            DEFAULT NULL
                            COMMENT 'NULL for one-off bills',

    -- ── Bill classification ───────────────────────────────────
    `bill_type`             ENUM(
                                'Subscription',
                                'Renewal',
                                'TaxReliefReport',
                                'StorageAddon',
                                'UserSeatsAddon',
                                'EnterpriseLicense'
                            ) NOT NULL DEFAULT 'Subscription',
    `bill_description`      VARCHAR(255)   NOT NULL
                            COMMENT 'e.g. Premium Yearly Renewal',

    -- ── Billing period ────────────────────────────────────────
    `billing_year`          YEAR           NOT NULL
                            COMMENT 'For year-tab filtering (2025|2024|2023)',
    `billing_month`         TINYINT UNSIGNED NOT NULL
                            COMMENT '1-12  for mobile monthly display',
    `billing_period_start`  DATETIME       DEFAULT NULL
                            COMMENT 'Start of the subscription period being billed',
    `billing_period_end`    DATETIME       DEFAULT NULL
                            COMMENT 'End   of the subscription period being billed',

    -- ── Dates ─────────────────────────────────────────────────
    `bill_date`             DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP
                            COMMENT 'When the bill was issued',
    `due_date`              DATETIME       NOT NULL
                            COMMENT 'Payment deadline; UI highlights in red when past',
    `paid_at`               DATETIME       DEFAULT NULL
                            COMMENT 'Populated by processSuccessfulPayment()',

    -- ── Amounts ───────────────────────────────────────────────
    `subtotal`              DECIMAL(10,2)  NOT NULL DEFAULT 0.00,
    `sst_rate`              DECIMAL(5,4)   NOT NULL DEFAULT 0.0600
                            COMMENT '0.0600 = 6% Malaysian SST',
    `sst_amount`            DECIMAL(10,2)  NOT NULL DEFAULT 0.00
                            COMMENT 'subtotal × sst_rate (computed on insert)',
    `total_amount`          DECIMAL(10,2)  NOT NULL DEFAULT 0.00
                            COMMENT 'subtotal + sst_amount  — incl. SST shown in UI',
    `currency`              VARCHAR(3)     NOT NULL DEFAULT 'MYR',

    -- ── CHIP gateway pre-payment data ─────────────────────────
    `chip_purchase_id`      VARCHAR(100)   DEFAULT NULL
                            COMMENT 'CHIP purchase UUID returned by /purchases/ API',
    `checkout_url`          TEXT           DEFAULT NULL
                            COMMENT 'CHIP hosted payment page URL sent to user',

    -- ── Status & reminders ────────────────────────────────────
    `status`                ENUM(
                                'Draft',
                                'Pending',
                                'Paid',
                                'Overdue',
                                'Cancelled',
                                'Refunded'
                            ) NOT NULL DEFAULT 'Draft',
    `reminder_count`        TINYINT UNSIGNED NOT NULL DEFAULT 0
                            COMMENT 'Number of push/email reminders sent',
    `reminder_sent_at`      DATETIME       DEFAULT NULL
                            COMMENT 'Timestamp of most recent reminder',

    -- ── Misc ──────────────────────────────────────────────────
    `notes`                 TEXT           DEFAULT NULL
                            COMMENT 'Admin notes, cancellation reason, etc.',
    `created_at`            DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `last_modified`         DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP
                            ON UPDATE CURRENT_TIMESTAMP,

    -- ── Constraints ───────────────────────────────────────────
    PRIMARY KEY (`bill_id`),
    UNIQUE  KEY `uq_bill_no`      (`bill_no`),
    UNIQUE  KEY `uq_invoice_no`   (`invoice_no`),
    UNIQUE  KEY `uq_chip_purchase` (`chip_purchase_id`),

    -- ── Query indexes ─────────────────────────────────────────
    KEY `idx_bill_account`       (`account_id`),
    KEY `idx_bill_subscription`  (`subscription_id`),
    KEY `idx_bill_year_month`    (`billing_year`, `billing_month`),
    KEY `idx_bill_status`        (`status`),
    KEY `idx_bill_due`           (`due_date`),
    KEY `idx_bill_type`          (`bill_type`),
    KEY `idx_bill_paid_at`       (`paid_at`),

    -- Composite: admin dashboard filters (year + status + type)
    KEY `idx_bill_dashboard`     (`billing_year`, `status`, `bill_type`),

    CONSTRAINT `fk_bill_account`
        FOREIGN KEY (`account_id`)       REFERENCES `account`               (`account_id`)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT `fk_bill_subscription`
        FOREIGN KEY (`subscription_id`)  REFERENCES `account_subscription`  (`subscription_id`)
        ON DELETE SET NULL ON UPDATE CASCADE,

    CONSTRAINT `chk_bill_month`   CHECK (`billing_month` BETWEEN 1 AND 12),
    CONSTRAINT `chk_bill_amounts` CHECK (`total_amount` >= 0 AND `subtotal` >= 0)

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Invoice / demand document — one row per billing event';

-- ─────────────────────────────────────────────────────────────
-- 3. BILLING TRANSACTION TABLE
--    Full gateway audit record.  One row per payment ATTEMPT
--    (a single bill may have multiple attempts, e.g. first card
--    declined, second attempt succeeds).
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `billing_transaction` (
    -- ── Identity ──────────────────────────────────────────────
    `txn_id`                INT            NOT NULL AUTO_INCREMENT,
    `txn_ref`               VARCHAR(30)    NOT NULL
                            COMMENT 'TXN-YYYYMM-NNNNN  e.g. TXN-202501-00271',

    -- ── Links ─────────────────────────────────────────────────
    `bill_id`               INT            NOT NULL,
    `account_id`            INT            NOT NULL,
    `subscription_id`       INT            DEFAULT NULL
                            COMMENT 'Denormalised from bill for fast joins',

    -- ── Period (denormalised for admin filter performance) ────
    `bill_year`             YEAR           NOT NULL,
    `bill_month`            TINYINT UNSIGNED NOT NULL,

    -- ── Gateway identification ────────────────────────────────
    `payment_gateway`       ENUM(
                                'Chip',
                                'ToyyibPay',
                                'Stripe',
                                'Manual'
                            ) NOT NULL DEFAULT 'Chip',
    `gateway_purchase_id`   VARCHAR(100)   DEFAULT NULL
                            COMMENT 'CHIP purchase UUID / ToyyibPay bill code',
    `gateway_ref`           VARCHAR(100)   DEFAULT NULL
                            COMMENT 'orderId / bill_no passed as reference to gateway',
    `gateway_event_type`    VARCHAR(50)    DEFAULT NULL
                            COMMENT 'e.g. purchase.paid / purchase.failed',
    `gateway_status_raw`    VARCHAR(50)    DEFAULT NULL
                            COMMENT 'Raw status string from gateway: paid/failed/pending',

    -- ── Payment method detail ─────────────────────────────────
    `payment_method`        VARCHAR(80)    DEFAULT NULL
                            COMMENT 'FPX Online Banking / E-Wallet / Debit Card / QR Pay',
    `bank_name`             VARCHAR(100)   DEFAULT NULL
                            COMMENT 'Maybank / CIMB / RHB etc',

    -- ── Amounts ───────────────────────────────────────────────
    `amount`                DECIMAL(10,2)  NOT NULL,
    `currency`              VARCHAR(3)     NOT NULL DEFAULT 'MYR',

    -- ── Customer snapshot ─────────────────────────────────────
    `client_email`          VARCHAR(150)   DEFAULT NULL
                            COMMENT 'Email from CHIP client object at time of payment',
    `client_name`           VARCHAR(256)   DEFAULT NULL
                            COMMENT 'Full name from CHIP client object at time of payment',

    -- ── URLs (audit trail of what was sent to user) ───────────
    `checkout_url`          TEXT           DEFAULT NULL,
    `success_redirect_url`  TEXT           DEFAULT NULL,
    `failure_redirect_url`  TEXT           DEFAULT NULL,
    `callback_url`          TEXT           DEFAULT NULL,

    -- ── Timestamps ────────────────────────────────────────────
    `paid_at`               DATETIME       DEFAULT NULL,
    `failed_at`             DATETIME       DEFAULT NULL,
    `refunded_at`           DATETIME       DEFAULT NULL,

    -- ── Raw gateway data ──────────────────────────────────────
    `chip_payload`          JSON           DEFAULT NULL
                            COMMENT 'Full purchase object from CHIP /purchases/ on creation',
    `chip_callback`         JSON           DEFAULT NULL
                            COMMENT 'Full raw webhook / callback body from CHIP',

    -- ── Outcome ───────────────────────────────────────────────
    `status`                ENUM(
                                'Pending',
                                'Success',
                                'Failed',
                                'Refunded',
                                'Cancelled'
                            ) NOT NULL DEFAULT 'Pending',
    `failure_reason`        TEXT           DEFAULT NULL,
    `is_test`               TINYINT(1)     NOT NULL DEFAULT 0
                            COMMENT '1 = test/sandbox transaction',

    -- ── Audit ─────────────────────────────────────────────────
    `created_at`            DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `last_modified`         DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP
                            ON UPDATE CURRENT_TIMESTAMP,

    -- ── Constraints ───────────────────────────────────────────
    PRIMARY KEY (`txn_id`),
    UNIQUE KEY `uq_txn_ref`              (`txn_ref`),
    UNIQUE KEY `uq_gateway_purchase_id`  (`payment_gateway`, `gateway_purchase_id`),

    -- ── Query indexes ─────────────────────────────────────────
    KEY `idx_btxn_bill`          (`bill_id`),
    KEY `idx_btxn_account`       (`account_id`),
    KEY `idx_btxn_subscription`  (`subscription_id`),
    KEY `idx_btxn_year_month`    (`bill_year`, `bill_month`),
    KEY `idx_btxn_status`        (`status`),
    KEY `idx_btxn_gateway`       (`payment_gateway`),
    KEY `idx_btxn_paid_at`       (`paid_at`),
    KEY `idx_btxn_created`       (`created_at`),

    -- Composite: transaction list page filters
    KEY `idx_btxn_dashboard`     (`bill_year`, `payment_gateway`, `status`),

    CONSTRAINT `fk_btxn_bill`
        FOREIGN KEY (`bill_id`)          REFERENCES `bill`                  (`bill_id`)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT `fk_btxn_account`
        FOREIGN KEY (`account_id`)       REFERENCES `account`               (`account_id`)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT `fk_btxn_subscription`
        FOREIGN KEY (`subscription_id`)  REFERENCES `account_subscription`  (`subscription_id`)
        ON DELETE SET NULL ON UPDATE CASCADE,

    CONSTRAINT `chk_btxn_month`  CHECK (`bill_month` BETWEEN 1 AND 12),
    CONSTRAINT `chk_btxn_amount` CHECK (`amount` >= 0)

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Full gateway audit record — one row per payment attempt';

-- ─────────────────────────────────────────────────────────────
-- 4. ADD company_name TO account
--    Shown on every bill row in the UI ("IT Consulting Sdn Bhd")
-- ─────────────────────────────────────────────────────────────
ALTER TABLE `account`
    ADD COLUMN `company_name` VARCHAR(200) DEFAULT NULL
        COMMENT 'Organisation / company name for billing display'
    AFTER `account_fullname`;
