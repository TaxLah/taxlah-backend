-- Migration: 008_super_admin_password_reset.sql
-- Adds admin_password_reset table for forgot password OTP flow (Super Admin module)

CREATE TABLE IF NOT EXISTS `admin_password_reset` (
  `reset_id`      int NOT NULL AUTO_INCREMENT,
  `admin_id`      int NOT NULL,
  `reset_token`   varchar(64) NOT NULL COMMENT 'Secure random token (SHA-256 hex)',
  `reset_otp`     varchar(6) NOT NULL COMMENT '6-digit OTP',
  `expires_at`    datetime NOT NULL COMMENT 'Token expires after 15 minutes',
  `is_used`       enum('Yes','No') NOT NULL DEFAULT 'No',
  `created_date`  datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`reset_id`),
  UNIQUE KEY `reset_token` (`reset_token`),
  KEY `admin_id` (`admin_id`),
  CONSTRAINT `admin_password_reset_ibfk_1`
    FOREIGN KEY (`admin_id`) REFERENCES `admin` (`admin_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
