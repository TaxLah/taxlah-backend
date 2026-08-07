-- ============================================================
-- Migration 023: admin-managed advertisements + app mode configuration
--
-- Two things the app currently hardcodes move into the database so an admin can change
-- them without a release:
--
--   1. The "Explore" carousel on the dashboard. Its cards are a literal array in
--      DashboardScreen.tsx, so changing a promotion means shipping a new build — and
--      for users on older versions, never.
--
--   2. The beta banner. Same problem: it is hardcoded copy, and there is no way to end
--      the beta without a release.
--
-- Additive only. One new table, four new system_config rows. Nothing is dropped,
-- deleted or altered, and nothing reads either until the API is wired up, so applying
-- this on its own changes no behaviour.
-- ============================================================

USE taxlah_development;

-- ── Advertisements ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS `advertisement` (
    `ad_id`           INT AUTO_INCREMENT PRIMARY KEY,

    `ad_title`        VARCHAR(120)  NOT NULL,
    `ad_description`  VARCHAR(500)      NULL,

    -- Presentation. With no image the app renders an icon + accent colour card, which
    -- keeps the carousel usable before any artwork exists.
    `ad_image_url`    VARCHAR(500)      NULL COMMENT 'Banner image; falls back to icon + accent when empty',
    `ad_icon`         VARCHAR(60)       NULL COMMENT 'lucide-react-native icon name, e.g. Sparkles',
    `ad_accent_color` VARCHAR(9)        NULL COMMENT 'Hex, e.g. #17739B',

    -- What tapping the card does.
    `ad_cta_label`    VARCHAR(60)       NULL,
    `ad_action_type`  ENUM('None','Screen','Url') NOT NULL DEFAULT 'None',
    `ad_action_value` VARCHAR(255)      NULL COMMENT 'Route name when Screen, absolute https URL when Url',

    -- Ordering decides which ones reach the dashboard: the app takes the first
    -- DASHBOARD_AD_LIMIT active rows by sort_order, and the rest appear under "See all".
    `sort_order`      INT           NOT NULL DEFAULT 0,

    -- Optional scheduling. NULL on either side means unbounded in that direction, so a
    -- row with both NULL behaves exactly as an always-on advert.
    `start_date`      DATE              NULL,
    `end_date`        DATE              NULL,

    `status`          ENUM('Active','Inactive') NOT NULL DEFAULT 'Active',

    `created_by`      INT               NULL COMMENT 'admin.admin_id',
    `created_date`    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `last_modified`   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    -- Soft delete, matching the convention used by auth_access and friends. Removing an
    -- advert must not break any audit trail that references it.
    `is_deleted`      TINYINT       NOT NULL DEFAULT 0,

    -- The app's list query filters on status + is_deleted and orders by sort_order.
    KEY `idx_ad_live` (`is_deleted`, `status`, `sort_order`),
    KEY `idx_ad_window` (`start_date`, `end_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Admin-managed promotional cards shown in the app';

-- ── App configuration ───────────────────────────────────────────────────────
-- is_secret = 0 throughout: none of these are credentials, so they stay readable in
-- plain text and do not need the encryption path that the chip/gmail/openai groups use.

INSERT INTO `system_config`
    (`config_group`, `config_key`, `config_value`, `is_secret`, `value_type`, `label`, `description`, `is_required`, `sort_order`, `status`)
VALUES
    ('app', 'APP_MODE', 'Beta', 0, 'string',
     'Application mode',
     'Beta or Live. Switching from Beta to Live notifies every active user that the beta has ended.',
     1, 1, 'Active'),

    ('app', 'BETA_BANNER_TEXT',
     'We are in beta — most features are free to use, including AI tax categorisation. Enjoy exploring!',
     0, 'multiline',
     'Beta banner text',
     'Shown on the dashboard while APP_MODE is Beta. Hidden entirely once the mode is Live.',
     0, 2, 'Active'),

    ('app', 'DASHBOARD_AD_LIMIT', '5', 0, 'number',
     'Adverts on dashboard',
     'How many active adverts appear on the dashboard carousel, taken in sort_order. The remainder are reachable via "See all".',
     1, 3, 'Active'),

    ('app', 'LIVE_ANNOUNCEMENT_TEXT',
     'Our beta has ended — TaxLah is now live. Thank you for helping us get here.',
     0, 'multiline',
     'Go-live announcement',
     'Body of the notification broadcast to all users when APP_MODE switches from Beta to Live.',
     0, 4, 'Active')

-- Re-running the migration must not clobber values an admin has since edited.
ON DUPLICATE KEY UPDATE `config_key` = `config_key`;
