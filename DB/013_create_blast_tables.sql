-- ============================================================
-- Migration 013: Message Blaster Tables
-- Creates blast_template and blast_message tables for the
-- admin Message Blaster feature (push notification + email)
-- ============================================================

-- ── blast_template: pre-defined and custom message templates ──
CREATE TABLE IF NOT EXISTS `blast_template` (
    `blast_template_id` int NOT NULL AUTO_INCREMENT,
    `template_name`     varchar(100) NOT NULL COMMENT 'Display name of the template',
    `template_tag`      varchar(50)  DEFAULT NULL COMMENT 'Category label e.g. Reminder, Notification, Announcement, Alert, Onboarding, Custom',
    `template_channel`  enum('Push','Email','Both') NOT NULL DEFAULT 'Push',
    `template_title`    varchar(65)  DEFAULT NULL COMMENT 'Push notification title or email subject (max 65 chars)',
    `template_body`     text         DEFAULT NULL COMMENT 'Message body supporting {{variable}} placeholders',
    `status`            enum('Active','Inactive') NOT NULL DEFAULT 'Active',
    `created_at`        datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`        datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`blast_template_id`),
    KEY `idx_bt_status`   (`status`),
    KEY `idx_bt_channel`  (`template_channel`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── blast_message: log of every sent / drafted blast ──
CREATE TABLE IF NOT EXISTS `blast_message` (
    `blast_id`              int          NOT NULL AUTO_INCREMENT,
    `blast_ref`             varchar(30)  NOT NULL COMMENT 'Unique reference e.g. BLAST-202501-00001',
    `blast_channel`         enum('Push','Email') NOT NULL,
    `blast_title`           varchar(65)  NOT NULL COMMENT 'Push title or email subject',
    `blast_body`            text         NOT NULL COMMENT 'Message body (plain text; may contain resolved variables)',
    `blast_recipient_type`  enum('Group','Individual') NOT NULL DEFAULT 'Group',
    `blast_recipient_group` varchar(50)  DEFAULT NULL COMMENT 'Group key e.g. all_users, active_users, pending_claims',
    `blast_recipient_ids`   json         DEFAULT NULL COMMENT 'Array of account_ids when type=Individual',
    `blast_recipient_count` int          NOT NULL DEFAULT 0 COMMENT 'Number of resolved recipients at send time',
    `blast_sent_count`      int          NOT NULL DEFAULT 0 COMMENT 'Successful deliveries',
    `blast_failed_count`    int          NOT NULL DEFAULT 0 COMMENT 'Failed deliveries',
    `blast_template_id`     int          DEFAULT NULL COMMENT 'Source template if used',
    `blast_status`          enum('Draft','Pending','Sent','Failed') NOT NULL DEFAULT 'Draft',
    `blast_scheduled_at`    datetime     DEFAULT NULL COMMENT 'Reserved for future scheduled sends',
    `blast_sent_at`         datetime     DEFAULT NULL,
    `blast_sent_by`         int          DEFAULT NULL COMMENT 'admin_id of the sender',
    `created_at`            datetime     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`            datetime     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`blast_id`),
    UNIQUE KEY `blast_ref` (`blast_ref`),
    KEY `idx_bm_status`    (`blast_status`),
    KEY `idx_bm_channel`   (`blast_channel`),
    KEY `idx_bm_sent_at`   (`blast_sent_at`),
    KEY `idx_bm_sent_by`   (`blast_sent_by`),
    CONSTRAINT `fk_bm_template` FOREIGN KEY (`blast_template_id`) REFERENCES `blast_template` (`blast_template_id`) ON DELETE SET NULL,
    CONSTRAINT `fk_bm_admin`    FOREIGN KEY (`blast_sent_by`)     REFERENCES `admin` (`admin_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Seed: default quick templates ──
INSERT INTO `blast_template` (`template_name`, `template_tag`, `template_channel`, `template_title`, `template_body`)
VALUES
    ('Expense Reminder',    'Reminder',     'Push', 'Submit Your Expenses! 🧾',
    'Hi {{name}}! Don''t forget to submit your expense claims before the end of the month. Keep your TaxLah record up to date!'),
    ('Claim Approved',      'Notification', 'Push', 'Tax Claim Approved ✅',
    'Great news {{name}}! Your tax claim of RM{{amount}} has been reviewed and approved.'),
    ('Policy Update',       'Announcement', 'Both', 'New Policy Update 📋',
    'Important: We''ve updated our tax claim policy. Please review the latest changes in the TaxLah app.'),
    ('Budget Alert',        'Alert',        'Push', 'Budget Warning ⚠️',
    'Hi {{name}}, you''ve used {{percentage}}% of your monthly expense budget. Please review your spending.'),
    ('Welcome Message',     'Onboarding',   'Both', 'Welcome to TaxLah! 🎉',
    'Hi {{name}}! Your TaxLah account is ready. Start tracking your expenses and maximise your tax relief today!'),
    ('Subscription Expiry', 'Reminder',     'Both', 'Your Subscription Expires Soon ⏰',
    'Hi {{name}}, your TaxLah subscription expires on {{deadline}}. Renew now to keep enjoying full access.');
