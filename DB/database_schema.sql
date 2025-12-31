-- Adminer 5.4.1 MySQL 8.0.44-0ubuntu0.24.04.1 dump
SET
	NAMES utf8;

SET
	time_zone = '+00:00';

SET
	foreign_key_checks = 0;

SET
	sql_mode = 'NO_AUTO_VALUE_ON_ZERO';

CREATE TABLE
	`account` (
		`account_id` int NOT NULL AUTO_INCREMENT,
		`account_secret_key` varchar(256) NOT NULL DEFAULT 'uuid()',
		`account_name` varchar(256) NOT NULL,
		`account_fullname` varchar(256) NOT NULL,
		`account_email` varchar(100) NOT NULL,
		`account_contact` varchar(20) DEFAULT NULL,
		`account_address_1` text,
		`account_address_2` text,
		`account_address_3` text,
		`account_address_postcode` varchar(10) DEFAULT NULL,
		`account_address_city` varchar(100) DEFAULT NULL,
		`account_address_state` varchar(100) DEFAULT NULL,
		`account_profile_image` text,
		`account_status` enum ('Pending', 'Active', 'Suspended', 'Others') NOT NULL DEFAULT 'Pending',
		`created_date` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
		`last_modified` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
		PRIMARY KEY (`account_id`),
		KEY `account_search_index` (
			`account_id`,
			`account_secret_key`,
			`account_name`,
			`account_email`,
			`account_status`
		)
	) ENGINE = InnoDB AUTO_INCREMENT = 3 DEFAULT CHARSET = latin1;

DELIMITER;

;

CREATE TRIGGER `account_ai` AFTER INSERT ON `account` FOR EACH ROW
INSERT INTO
	account_logs
SELECT
	*
FROM
	account;

;

CREATE TRIGGER `account_au` AFTER
UPDATE ON `account` FOR EACH ROW
INSERT INTO
	account_logs (
		account_id,
		account_secret_key,
		account_name,
		account_fullname,
		account_email,
		account_contact,
		account_address_1,
		account_address_2,
		account_address_3,
		account_address_postcode,
		account_address_city,
		account_address_state,
		account_profile_image,
		account_status,
		created_date,
		last_modified
	)
VALUES
	(
		NEW.account_id,
		NEW.account_secret_key,
		NEW.account_name,
		NEW.account_fullname,
		NEW.account_email,
		NEW.account_contact,
		NEW.account_address_1,
		NEW.account_address_2,
		NEW.account_address_3,
		NEW.account_address_postcode,
		NEW.account_address_city,
		NEW.account_address_state,
		NEW.account_profile_image,
		NEW.account_status,
		NEW.created_date,
		NEW.last_modified
	);

;

DELIMITER;

CREATE TABLE
	`account_device` (
		`device_id` int NOT NULL AUTO_INCREMENT,
		`account_id` int NOT NULL,
		`device_uuid` varchar(256) NOT NULL,
		`device_name` varchar(256) NOT NULL,
		`device_os` enum ('Android', 'IOS') NOT NULL,
		`device_enable_fcm` enum ('Yes', 'No') NOT NULL DEFAULT 'Yes',
		`device_fcm_token` text,
		`device_status` enum ('Active', 'Inactive') NOT NULL DEFAULT 'Active',
		`created_date` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
		`last_modified` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
		PRIMARY KEY (`device_id`),
		KEY `account_id` (`account_id`),
		CONSTRAINT `account_device_ibfk_1` FOREIGN KEY (`account_id`) REFERENCES `account` (`account_id`) ON DELETE CASCADE
	) ENGINE = InnoDB AUTO_INCREMENT = 2 DEFAULT CHARSET = latin1;

CREATE TABLE
	`account_expenses` (
		`expenses_id` int NOT NULL AUTO_INCREMENT,
		`expenses_tags` varchar(100) DEFAULT NULL,
		`expenses_tax_category` int DEFAULT NULL,
		`expenses_tax_subcategory` int DEFAULT NULL,
		`expenses_receipt_no` varchar(256) DEFAULT NULL,
		`expenses_merchant_id` varchar(100) DEFAULT NULL,
		`expenses_merchant_name` varchar(256) DEFAULT NULL,
		`expenses_total_amount` decimal(15, 2) NOT NULL DEFAULT '0.00',
		`expenses_date` date NOT NULL,
		`expenses_year` date NOT NULL,
		`expenses_tax_eligible` enum ('No', 'Yes') NOT NULL DEFAULT 'Yes',
		`status` enum ('Active', 'Inactive', 'Deleted', 'Others') NOT NULL DEFAULT 'Active',
		`created_date` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
		`last_modified` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
		`account_id` int NOT NULL,
		PRIMARY KEY (`expenses_id`),
		KEY `expenses_tax_category` (`expenses_tax_category`),
		KEY `expenses_tax_subcategory` (`expenses_tax_subcategory`),
		KEY `account_id` (`account_id`),
		KEY `expenses_idx` (
			`expenses_id`,
			`expenses_tags`,
			`expenses_tax_category`,
			`expenses_tax_subcategory`,
			`expenses_receipt_no`,
			`expenses_date`,
			`expenses_year`,
			`expenses_tax_eligible`,
			`status`,
			`account_id`
		),
		CONSTRAINT `account_expenses_ibfk_1` FOREIGN KEY (`expenses_tax_category`) REFERENCES `tax_category` (`tax_id`) ON DELETE SET NULL,
		CONSTRAINT `account_expenses_ibfk_2` FOREIGN KEY (`expenses_tax_subcategory`) REFERENCES `tax_subcategory` (`taxsub_id`) ON DELETE SET NULL,
		CONSTRAINT `account_expenses_ibfk_3` FOREIGN KEY (`account_id`) REFERENCES `account` (`account_id`) ON DELETE CASCADE
	) ENGINE = InnoDB DEFAULT CHARSET = latin1;

CREATE TABLE
	`account_expenses_item` (
		`item_id` int NOT NULL AUTO_INCREMENT,
		`item_sku_unit` varchar(256) DEFAULT NULL,
		`item_name` varchar(256) DEFAULT NULL,
		`item_unit_price` decimal(15, 2) NOT NULL DEFAULT '0.00',
		`item_quantity` int NOT NULL DEFAULT '0',
		`item_total_price` decimal(10, 0) NOT NULL DEFAULT '0',
		`status` enum ('Active', 'Inactive', 'Deleted') NOT NULL DEFAULT 'Active',
		`created_date` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
		`last_modified` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
		`expenses_id` int NOT NULL,
		PRIMARY KEY (`item_id`),
		KEY `expenses_id` (`expenses_id`),
		KEY `expenses_item_idx` (`item_id`, `item_name`, `status`, `expenses_id`),
		CONSTRAINT `account_expenses_item_ibfk_1` FOREIGN KEY (`expenses_id`) REFERENCES `account_expenses` (`expenses_id`) ON DELETE CASCADE
	) ENGINE = InnoDB DEFAULT CHARSET = latin1;

CREATE TABLE
	`account_file` (
		`file_id` int NOT NULL AUTO_INCREMENT,
		`file_sku_unit` varchar(256) DEFAULT NULL,
		`file_name` varchar(256) DEFAULT NULL,
		`file_mime` varchar(100) DEFAULT NULL,
		`file_size` bigint DEFAULT '0',
		`file_ext` varchar(100) DEFAULT NULL,
		`file_path` varchar(256) DEFAULT NULL,
		`status` enum ('Active', 'Inactive', 'Deleted', 'Others') NOT NULL DEFAULT 'Active',
		`created_date` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
		`last_modified` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
		`account_id` int NOT NULL,
		`storage_id` int NOT NULL,
		PRIMARY KEY (`file_id`),
		KEY `account_id` (`account_id`),
		KEY `storage_id` (`storage_id`),
		KEY `get_file_idx1` (
			`file_id`,
			`file_sku_unit`,
			`status`,
			`created_date`,
			`account_id`,
			`storage_id`
		),
		CONSTRAINT `account_file_ibfk_1` FOREIGN KEY (`account_id`) REFERENCES `account` (`account_id`) ON DELETE CASCADE,
		CONSTRAINT `account_file_ibfk_2` FOREIGN KEY (`storage_id`) REFERENCES `account_storage` (`storage_id`) ON DELETE CASCADE
	) ENGINE = InnoDB DEFAULT CHARSET = latin1;

CREATE TABLE
	`account_logs` (
		`account_id` int NOT NULL DEFAULT '0',
		`account_secret_key` varchar(256) NOT NULL DEFAULT 'uuid()',
		`account_name` varchar(256) NOT NULL,
		`account_fullname` varchar(256) NOT NULL,
		`account_email` varchar(100) NOT NULL,
		`account_contact` varchar(20) DEFAULT NULL,
		`account_address_1` text,
		`account_address_2` text,
		`account_address_3` text,
		`account_address_postcode` varchar(10) DEFAULT NULL,
		`account_address_city` varchar(100) DEFAULT NULL,
		`account_address_state` varchar(100) DEFAULT NULL,
		`account_profile_image` text,
		`account_status` enum ('Pending', 'Active', 'Suspended', 'Others') NOT NULL DEFAULT 'Pending',
		`created_date` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
		`last_modified` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP
	) ENGINE = InnoDB DEFAULT CHARSET = latin1;

CREATE TABLE
	`account_notification` (
		`notification_id` int NOT NULL AUTO_INCREMENT,
		`account_id` int NOT NULL,
		`notification_title` varchar(256) NOT NULL,
		`notification_description` text,
		`read_status` enum ('No', 'Yes') NOT NULL DEFAULT 'No',
		`archive_status` enum ('No', 'Yes') NOT NULL DEFAULT 'No',
		`status` enum ('Active', 'Inactive', 'Deleted', 'Others') NOT NULL DEFAULT 'Active',
		`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
		`last_modified` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
		PRIMARY KEY (`notification_id`),
		KEY `account_id` (`account_id`),
		CONSTRAINT `account_notification_ibfk_1` FOREIGN KEY (`account_id`) REFERENCES `account` (`account_id`) ON DELETE CASCADE
	) ENGINE = InnoDB AUTO_INCREMENT = 8 DEFAULT CHARSET = latin1;

CREATE TABLE
	`account_storage` (
		`storage_id` int NOT NULL AUTO_INCREMENT,
		`storage_sku_unit` varchar(100) DEFAULT NULL,
		`storage_default_space` decimal(15, 2) NOT NULL DEFAULT '0.00',
		`storage_current_space` decimal(15, 2) NOT NULL DEFAULT '0.00',
		`storage_path` varchar(256) DEFAULT NULL,
		`status` enum (
			'Active',
			'Inactive',
			'Suspended',
			'Deleted',
			'Other'
		) NOT NULL DEFAULT 'Active',
		`created_date` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
		`last_modified` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
		`account_id` int NOT NULL,
		PRIMARY KEY (`storage_id`),
		KEY `account_id` (`account_id`),
		KEY `get_account_storage_idx` (
			`storage_id`,
			`storage_current_space`,
			`status`,
			`account_id`
		),
		CONSTRAINT `account_storage_ibfk_1` FOREIGN KEY (`account_id`) REFERENCES `account` (`account_id`) ON DELETE CASCADE,
		CONSTRAINT `BALANCE_MOST_NOT_NEGATIVE` CHECK ((`storage_current_space` > 0.00))
	) ENGINE = InnoDB AUTO_INCREMENT = 2 DEFAULT CHARSET = latin1;

CREATE TABLE
	`admin` (
		`admin_id` int NOT NULL AUTO_INCREMENT,
		`admin_name` varchar(256) NOT NULL,
		`admin_fullname` varchar(256) NOT NULL,
		`admin_email` varchar(100) NOT NULL,
		`admin_phone` varchar(100) NOT NULL,
		`admin_role` enum (
			'Super Admin',
			'Administrator',
			'Manager',
			'Accountant',
			'Billing'
		) NOT NULL DEFAULT 'Administrator',
		`admin_image` text,
		`admin_status` enum (
			'Active',
			'Pending',
			'Inactive',
			'Suspended',
			'Deleted',
			'Others'
		) NOT NULL DEFAULT 'Pending',
		`create_date` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
		`last_modified` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
		PRIMARY KEY (`admin_id`),
		UNIQUE KEY `admin_email` (`admin_email`),
		KEY `admin_id_admin_name_admin_email_admin_role_admin_status` (
			`admin_id`,
			`admin_name`,
			`admin_email`,
			`admin_role`,
			`admin_status`
		)
	) ENGINE = InnoDB AUTO_INCREMENT = 2 DEFAULT CHARSET = latin1;

CREATE TABLE
	`admin_auth` (
		`aauth_id` int NOT NULL AUTO_INCREMENT,
		`aauth_reference_no` varchar(256) NOT NULL DEFAULT 'uuid()',
		`aauth_username` varchar(256) NOT NULL,
		`aauth_usermail` varchar(256) NOT NULL,
		`aauth_password` varchar(256) NOT NULL,
		`aauth_role` enum (
			'Super Admin',
			'Administrator',
			'Manager',
			'Accountant',
			'Billing'
		) NOT NULL DEFAULT 'Administrator',
		`aauth_status` enum (
			'Active',
			'Pending',
			'Inactive',
			'Suspended',
			'Deleted',
			'Others'
		) NOT NULL DEFAULT 'Pending',
		`created_date` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
		`last_modified` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
		`admin_id` int NOT NULL,
		PRIMARY KEY (`aauth_id`),
		UNIQUE KEY `aauth_reference_no` (`aauth_reference_no`),
		UNIQUE KEY `aauth_username` (`aauth_username`),
		UNIQUE KEY `aauth_usermail` (`aauth_usermail`),
		KEY `admin_id` (`admin_id`),
		KEY `aauth_login_idx` (
			`aauth_id`,
			`aauth_username`,
			`aauth_usermail`,
			`aauth_password`,
			`aauth_role`,
			`aauth_status`,
			`admin_id`
		),
		CONSTRAINT `admin_auth_ibfk_1` FOREIGN KEY (`admin_id`) REFERENCES `admin` (`admin_id`)
	) ENGINE = InnoDB AUTO_INCREMENT = 2 DEFAULT CHARSET = latin1;

CREATE TABLE
	`auth_access` (
		`auth_id` int NOT NULL AUTO_INCREMENT,
		`auth_reference_key` varchar(256) NOT NULL DEFAULT 'uuid()',
		`auth_username` varchar(256) NOT NULL,
		`auth_usermail` varchar(100) NOT NULL,
		`auth_password` varchar(256) NOT NULL,
		`auth_role` enum ('Individual', 'Business') NOT NULL DEFAULT 'Individual',
		`auth_socmed` enum ('Yes', 'No') DEFAULT 'No',
		`auth_is_verified` enum ('Yes', 'No') NOT NULL DEFAULT 'No',
		`auth_otp` varchar(10) DEFAULT NULL,
		`auth_status` enum (
			'Pending',
			'Active',
			'Inactive',
			'Suspended',
			'Others'
		) NOT NULL DEFAULT 'Pending',
		`account_id` int NOT NULL,
		`created_date` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
		`last_modified` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
		PRIMARY KEY (`auth_id`),
		KEY `account_id` (`account_id`),
		KEY `search_login` (
			`auth_id`,
			`auth_reference_key`,
			`auth_username`,
			`auth_usermail`,
			`auth_password`,
			`auth_is_verified`,
			`auth_status`
		),
		CONSTRAINT `auth_access_ibfk_1` FOREIGN KEY (`account_id`) REFERENCES `account` (`account_id`) ON DELETE CASCADE
	) ENGINE = InnoDB AUTO_INCREMENT = 3 DEFAULT CHARSET = latin1;

DELIMITER;

;

CREATE TRIGGER `auth_access_ai` AFTER INSERT ON `auth_access` FOR EACH ROW
INSERT INTO
	auth_access_logs
SELECT
	*
FROM
	auth_access;

;

CREATE TRIGGER `auth_access_au` AFTER
UPDATE ON `auth_access` FOR EACH ROW
INSERT INTO
	auth_access_logs (
		auth_id,
		auth_reference_key,
		auth_username,
		auth_usermail,
		auth_password,
		auth_role,
		auth_socmed,
		auth_is_verified,
		auth_otp,
		auth_status,
		account_id,
		created_date,
		last_modified
	)
VALUES
	(
		NEW.auth_id,
		NEW.auth_reference_key,
		NEW.auth_username,
		NEW.auth_usermail,
		NEW.auth_password,
		NEW.auth_role,
		NEW.auth_socmed,
		NEW.auth_is_verified,
		NEW.auth_otp,
		NEW.auth_status,
		NEW.account_id,
		NEW.created_date,
		NEW.last_modified
	);

;

DELIMITER;

CREATE TABLE
	`auth_access_logs` (
		`auth_id` int NOT NULL DEFAULT '0',
		`auth_reference_key` varchar(256) NOT NULL DEFAULT 'uuid()',
		`auth_username` varchar(256) NOT NULL,
		`auth_usermail` varchar(100) NOT NULL,
		`auth_password` varchar(256) NOT NULL,
		`auth_role` enum ('Individual', 'Business') NOT NULL DEFAULT 'Individual',
		`auth_socmed` enum ('Yes', 'No') DEFAULT 'No',
		`auth_is_verified` enum ('Yes', 'No') NOT NULL DEFAULT 'No',
		`auth_otp` varchar(10) DEFAULT NULL,
		`auth_status` enum (
			'Pending',
			'Active',
			'Inactive',
			'Suspended',
			'Others'
		) NOT NULL DEFAULT 'Pending',
		`account_id` int NOT NULL,
		`created_date` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
		`last_modified` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
	) ENGINE = InnoDB DEFAULT CHARSET = latin1;

CREATE TABLE
	`merchant` (
		`merchant_id` int NOT NULL AUTO_INCREMENT,
		`merchant_uniq_no` varchar(256) NOT NULL DEFAULT 'uuid()',
		`merchant_name` int NOT NULL,
		`merchant_category` varchar(256) NOT NULL,
		`merchant_image` text NOT NULL,
		`status` enum ('Active', 'Inactive', 'Deleted', 'Others') NOT NULL DEFAULT 'Active',
		`created_date` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
		`last_modified` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
		PRIMARY KEY (`merchant_id`)
	) ENGINE = InnoDB DEFAULT CHARSET = latin1;

CREATE TABLE
	`package` (
		`package_id` int NOT NULL AUTO_INCREMENT,
		`package_uniq_no` varchar(256) NOT NULL DEFAULT 'uuid()',
		`package_name` varchar(256) NOT NULL,
		`package_description` text NOT NULL,
		`package_content` json DEFAULT NULL,
		`package_item` json DEFAULT NULL,
		`package_base_price` decimal(15, 2) NOT NULL DEFAULT '0.00',
		`package_discount_price` decimal(15, 2) NOT NULL DEFAULT '0.00',
		`package_is_discount` enum ('No', 'Yes') NOT NULL DEFAULT 'No',
		`status` enum ('Active', 'Inactive', 'Deleted', 'Others') NOT NULL DEFAULT 'Active',
		`created_date` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
		`last_modified` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
		PRIMARY KEY (`package_id`),
		KEY `package_idx` (
			`package_id`,
			`package_name`,
			`package_base_price`,
			`package_discount_price`,
			`package_is_discount`,
			`status`
		),
		CONSTRAINT `package_chk_1` CHECK (json_valid (`package_content`)),
		CONSTRAINT `package_chk_2` CHECK (json_valid (`package_item`)),
		CONSTRAINT `package_content` CHECK (json_valid (`package_content`))
	) ENGINE = InnoDB AUTO_INCREMENT = 2 DEFAULT CHARSET = latin1;

SET
	NAMES utf8mb4;

CREATE TABLE
	`payment_gateway_conf` (
		`pg_id` int NOT NULL AUTO_INCREMENT,
		`pg_name` varchar(256) DEFAULT NULL,
		`pg_apikey` varchar(256) DEFAULT NULL,
		`pg_secretkey` varchar(256) DEFAULT NULL,
		`pg_baseurl` varchar(256) DEFAULT NULL,
		`pg_config` json DEFAULT NULL,
		`status` enum ('Active', 'Inactive') NOT NULL DEFAULT 'Active',
		`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
		`last_modified` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
		PRIMARY KEY (`pg_id`)
	) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci;

CREATE TABLE
	`payment_transaction` (
		`transaction_id` int NOT NULL AUTO_INCREMENT,
		`transaction_ref_no` varchar(256) NOT NULL DEFAULT 'uuid()',
		`transaction_billname` varchar(256) NOT NULL,
		`transaction_billdescription` text NOT NULL,
		`transaction_billamount` decimal(15, 2) NOT NULL DEFAULT '0.00',
		`transaction_data` json DEFAULT NULL,
		`transaction_status` enum (
			'Created',
			'Pending',
			'Approved',
			'Unsuccess',
			'Others'
		) NOT NULL DEFAULT 'Created',
		`transaction_callback` json DEFAULT NULL,
		`transaction_flag` int NOT NULL DEFAULT '0',
		`status` enum ('Active', 'Inactive', 'Deleted', 'Others') NOT NULL DEFAULT 'Active',
		`created_date` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
		`last_modified` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
		`account_id` int NOT NULL,
		PRIMARY KEY (`transaction_id`),
		UNIQUE KEY `transaction_ref_no` (`transaction_ref_no`),
		KEY `account_id` (`account_id`),
		KEY `transaction_ref_idx` (
			`transaction_id`,
			`transaction_ref_no`,
			`transaction_status`,
			`transaction_flag`,
			`status`,
			`account_id`
		),
		CONSTRAINT `payment_transaction_ibfk_1` FOREIGN KEY (`account_id`) REFERENCES `account` (`account_id`)
	) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci;

CREATE TABLE
	`tax_category` (
		`tax_id` int NOT NULL AUTO_INCREMENT,
		`tax_title` varchar(256) NOT NULL,
		`tax_description` text,
		`tax_max_claim` decimal(15, 2) NOT NULL DEFAULT '0.00',
		`tax_content` json DEFAULT NULL,
		`status` enum ('Active', 'Inactive', 'Deleted', 'Others') NOT NULL DEFAULT 'Active',
		`created_date` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
		`last_modified` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
		PRIMARY KEY (`tax_id`)
	) ENGINE = InnoDB AUTO_INCREMENT = 10 DEFAULT CHARSET = latin1;

CREATE TABLE
	`tax_subcategory` (
		`taxsub_id` int NOT NULL AUTO_INCREMENT,
		`taxsub_tags` json DEFAULT NULL,
		`taxsub_title` varchar(256) NOT NULL,
		`taxsub_description` text,
		`taxsub_content` json DEFAULT NULL,
		`taxsub_max_claim` decimal(15, 2) NOT NULL DEFAULT '0.00',
		`status` enum ('Active', 'Inactive', 'Deleted', 'Others') NOT NULL DEFAULT 'Active',
		`created_date` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
		`last_modified` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
		`tax_id` int NOT NULL,
		PRIMARY KEY (`taxsub_id`),
		KEY `tax_id` (`tax_id`),
		CONSTRAINT `tax_subcategory_ibfk_1` FOREIGN KEY (`tax_id`) REFERENCES `tax_category` (`tax_id`) ON DELETE SET DEFAULT
	) ENGINE = InnoDB DEFAULT CHARSET = latin1;

CREATE TABLE
	`receipt` (
		`receipt_id` int NOT NULL AUTO_INCREMENT,
		`receipt_name` varchar(256) DEFAULT NULL,
		`receipt_description` text,
		`receipt_amount` decimal(15, 2) NOT NULL DEFAULT '0.00',
		`receipt_items` json DEFAULT (_utf8mb4 '[]'),
		`receipt_image_url` text NOT NULL,
		`status` enum ('Active', 'Inactive', 'Deleted', 'Others') NOT NULL DEFAULT 'Active',
		`created_date` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
		`last_modified` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
		`account_id` int NOT NULL,
		`rc_id` int NOT NULL,
		PRIMARY KEY (`receipt_id`),
		KEY `rc_id` (`rc_id`),
		KEY `account_id` (`account_id`),
		CONSTRAINT `receipt_ibfk_1` FOREIGN KEY (`rc_id`) REFERENCES `receipt_category` (`rc_id`) ON DELETE SET DEFAULT,
		CONSTRAINT `receipt_ibfk_2` FOREIGN KEY (`account_id`) REFERENCES `account` (`account_id`) ON DELETE SET DEFAULT
	) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci;

CREATE TABLE
	`receipt_category` (
		`rc_id` int NOT NULL AUTO_INCREMENT,
		`rc_name` varchar(256) NOT NULL,
		`rc_description` text,
		`status` enum ('Active', 'Inactive') NOT NULL DEFAULT 'Active',
		`created_date` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
		`last_modified` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
		PRIMARY KEY (`rc_id`)
	) ENGINE = InnoDB AUTO_INCREMENT = 6 DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci;

-- ============================================================================
-- TAXLAH CREDIT SYSTEM DATABASE SCHEMA
-- Version: 1.0
-- Description: Complete schema for credit-based monetization system
-- ============================================================================

-- ============================================================================
-- 1. CREDIT PACKAGES - Available packages users can purchase
-- ============================================================================
CREATE TABLE IF NOT EXISTS credit_package (
    package_id INT AUTO_INCREMENT PRIMARY KEY,
    package_code VARCHAR(50) NOT NULL UNIQUE,
    package_name VARCHAR(100) NOT NULL,
    package_description TEXT,
    
    -- Pricing
    credit_amount INT NOT NULL COMMENT 'Number of credits in package',
    price_amount DECIMAL(10,2) NOT NULL COMMENT 'Price in MYR',
    price_per_credit DECIMAL(10,4) GENERATED ALWAYS AS (price_amount / credit_amount) STORED,
    
    -- Display
    package_badge VARCHAR(50) DEFAULT NULL COMMENT 'e.g., BEST VALUE, POPULAR',
    package_color VARCHAR(20) DEFAULT '#1a5f7a' COMMENT 'Hex color for UI',
    package_icon VARCHAR(50) DEFAULT NULL,
    sort_order INT DEFAULT 0,
    
    -- Validity
    validity_days INT DEFAULT 548 COMMENT 'Credits expire after X days (default 18 months)',
    
    -- Bonus
    bonus_credits INT DEFAULT 0 COMMENT 'Extra bonus credits',
    bonus_description VARCHAR(100) DEFAULT NULL,
    
    -- Limits
    is_featured ENUM('Yes', 'No') DEFAULT 'No',
    is_recurring ENUM('Yes', 'No') DEFAULT 'No' COMMENT 'Auto-renew subscription',
    max_purchase_per_user INT DEFAULT NULL COMMENT 'NULL = unlimited',
    
    -- Status
    status ENUM('Active', 'Inactive', 'Hidden') DEFAULT 'Active',
    created_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    modified_date DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    INDEX idx_status (status),
    INDEX idx_sort (sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- 2. ACCOUNT CREDIT - User's current credit balance
-- ============================================================================
CREATE TABLE IF NOT EXISTS account_credit (
    credit_id INT AUTO_INCREMENT PRIMARY KEY,
    account_id INT NOT NULL,
    
    -- Balance
    credit_balance INT NOT NULL DEFAULT 0 COMMENT 'Current available credits',
    lifetime_credits INT NOT NULL DEFAULT 0 COMMENT 'Total credits ever purchased',
    lifetime_spent INT NOT NULL DEFAULT 0 COMMENT 'Total credits ever used',
    
    -- Free tier tracking
    free_receipts_used INT DEFAULT 0 COMMENT 'Free receipts used this year',
    free_receipts_limit INT DEFAULT 50 COMMENT 'Free receipts per year',
    free_tier_reset_date DATE DEFAULT NULL COMMENT 'When free tier resets',
    
    -- Status
    status ENUM('Active', 'Suspended', 'Inactive') DEFAULT 'Active',
    created_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    modified_date DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    UNIQUE KEY unique_account (account_id),
    INDEX idx_balance (credit_balance),
    INDEX idx_status (status),
    
    CONSTRAINT fk_account_credit_account 
        FOREIGN KEY (account_id) REFERENCES account(account_id) 
        ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- 3. CREDIT BATCH - Track credit purchases with expiry
-- ============================================================================
CREATE TABLE IF NOT EXISTS credit_batch (
    batch_id INT AUTO_INCREMENT PRIMARY KEY,
    account_id INT NOT NULL,
    package_id INT DEFAULT NULL,
    
    -- Credit details
    credits_purchased INT NOT NULL COMMENT 'Original credits in this batch',
    credits_remaining INT NOT NULL COMMENT 'Remaining credits in this batch',
    bonus_credits INT DEFAULT 0,
    
    -- Source
    source_type ENUM('Purchase', 'Bonus', 'Referral', 'Promotion', 'Refund', 'Admin') DEFAULT 'Purchase',
    source_reference VARCHAR(100) DEFAULT NULL COMMENT 'Order ID, promo code, etc.',
    
    -- Validity
    purchase_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    expiry_date DATETIME NOT NULL,
    
    -- Status
    status ENUM('Active', 'Depleted', 'Expired', 'Cancelled') DEFAULT 'Active',
    created_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    modified_date DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    INDEX idx_account (account_id),
    INDEX idx_status (status),
    INDEX idx_expiry (expiry_date),
    INDEX idx_account_active (account_id, status, expiry_date),
    
    CONSTRAINT fk_credit_batch_account 
        FOREIGN KEY (account_id) REFERENCES account(account_id) 
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_credit_batch_package 
        FOREIGN KEY (package_id) REFERENCES credit_package(package_id) 
        ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- 4. CREDIT TRANSACTION - All credit movements (purchases, usage, refunds)
-- ============================================================================
CREATE TABLE IF NOT EXISTS credit_transaction (
    transaction_id INT AUTO_INCREMENT PRIMARY KEY,
    account_id INT NOT NULL,
    batch_id INT DEFAULT NULL,
    
    -- Transaction type
    transaction_type ENUM(
        'Purchase',           -- Bought credits
        'Usage',              -- Used credits
        'Bonus',              -- Received bonus
        'Referral',           -- Referral reward
        'Promotion',          -- Promotional credits
        'Refund',             -- Refund
        'Expiry',             -- Credits expired
        'Adjustment'          -- Admin adjustment
    ) NOT NULL,
    
    -- Amount
    credit_amount INT NOT NULL COMMENT 'Positive = credit in, Negative = credit out',
    balance_before INT NOT NULL,
    balance_after INT NOT NULL,
    
    -- Details
    description VARCHAR(255) NOT NULL,
    reference_type VARCHAR(50) DEFAULT NULL COMMENT 'e.g., Report, Receipt, Package',
    reference_id INT DEFAULT NULL COMMENT 'ID of related record',
    
    -- Payment (for purchases)
    payment_amount DECIMAL(10,2) DEFAULT NULL,
    payment_method VARCHAR(50) DEFAULT NULL COMMENT 'e.g., FPX, Card, E-Wallet',
    payment_reference VARCHAR(100) DEFAULT NULL COMMENT 'Payment gateway reference',
    
    -- Status
    status ENUM('Pending', 'Completed', 'Failed', 'Cancelled', 'Refunded') DEFAULT 'Completed',
    created_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    INDEX idx_account (account_id),
    INDEX idx_type (transaction_type),
    INDEX idx_status (status),
    INDEX idx_created (created_date),
    INDEX idx_reference (reference_type, reference_id),
    INDEX idx_account_date (account_id, created_date),
    
    CONSTRAINT fk_credit_trans_account 
        FOREIGN KEY (account_id) REFERENCES account(account_id) 
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_credit_trans_batch 
        FOREIGN KEY (batch_id) REFERENCES credit_batch(batch_id) 
        ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- 5. CREDIT USAGE RATE - Define credit costs for different features
-- ============================================================================
CREATE TABLE IF NOT EXISTS credit_usage_rate (
    rate_id INT AUTO_INCREMENT PRIMARY KEY,
    rate_code VARCHAR(50) NOT NULL UNIQUE,
    rate_name VARCHAR(100) NOT NULL,
    rate_description TEXT,
    
    -- Cost
    credit_cost INT NOT NULL COMMENT 'Credits required',
    
    -- Category
    feature_category ENUM('Receipt', 'Report', 'Feature', 'Subscription') NOT NULL,
    
    -- Status
    is_active ENUM('Yes', 'No') DEFAULT 'Yes',
    created_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    modified_date DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    INDEX idx_code (rate_code),
    INDEX idx_category (feature_category),
    INDEX idx_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- 6. PAYMENT ORDER - Track payment orders before confirmation
-- ============================================================================
CREATE TABLE IF NOT EXISTS payment_order (
    order_id INT AUTO_INCREMENT PRIMARY KEY,
    order_uuid VARCHAR(36) NOT NULL UNIQUE COMMENT 'Public order reference',
    account_id INT NOT NULL,
    package_id INT NOT NULL,
    
    -- Order details
    credit_amount INT NOT NULL,
    bonus_credits INT DEFAULT 0,
    order_amount DECIMAL(10,2) NOT NULL,
    
    -- Payment gateway
    payment_gateway ENUM('ToyyibPay', 'Stripe', 'Manual') DEFAULT 'ToyyibPay',
    gateway_bill_code VARCHAR(100) DEFAULT NULL,
    gateway_reference VARCHAR(100) DEFAULT NULL,
    gateway_response TEXT DEFAULT NULL,
    
    -- URLs
    payment_url VARCHAR(500) DEFAULT NULL,
    callback_url VARCHAR(500) DEFAULT NULL,
    
    -- Status
    order_status ENUM('Pending', 'Processing', 'Completed', 'Failed', 'Cancelled', 'Expired') DEFAULT 'Pending',
    payment_status ENUM('Unpaid', 'Paid', 'Failed', 'Refunded') DEFAULT 'Unpaid',
    
    -- Timestamps
    created_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    paid_date DATETIME DEFAULT NULL,
    expired_date DATETIME DEFAULT NULL,
    modified_date DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    INDEX idx_uuid (order_uuid),
    INDEX idx_account (account_id),
    INDEX idx_status (order_status, payment_status),
    INDEX idx_gateway (payment_gateway, gateway_bill_code),
    INDEX idx_created (created_date),
    
    CONSTRAINT fk_payment_order_account 
        FOREIGN KEY (account_id) REFERENCES account(account_id) 
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_payment_order_package 
        FOREIGN KEY (package_id) REFERENCES credit_package(package_id) 
        ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- 7. PROMO CODE - Promotional codes for discounts or bonus credits
-- ============================================================================
CREATE TABLE IF NOT EXISTS promo_code (
    promo_id INT AUTO_INCREMENT PRIMARY KEY,
    promo_code VARCHAR(50) NOT NULL UNIQUE,
    promo_name VARCHAR(100) NOT NULL,
    promo_description TEXT,
    
    -- Type
    promo_type ENUM('Discount', 'Bonus', 'FreeCredits') NOT NULL,
    
    -- Value
    discount_type ENUM('Percentage', 'Fixed') DEFAULT NULL,
    discount_value DECIMAL(10,2) DEFAULT NULL COMMENT 'Percentage or fixed amount',
    bonus_credits INT DEFAULT NULL COMMENT 'Extra credits to add',
    free_credits INT DEFAULT NULL COMMENT 'Free credits (no purchase needed)',
    
    -- Restrictions
    min_purchase_amount DECIMAL(10,2) DEFAULT NULL,
    applicable_packages TEXT DEFAULT NULL COMMENT 'JSON array of package_ids, NULL = all',
    
    -- Limits
    max_uses_total INT DEFAULT NULL COMMENT 'NULL = unlimited',
    max_uses_per_user INT DEFAULT 1,
    current_uses INT DEFAULT 0,
    
    -- Validity
    start_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    end_date DATETIME DEFAULT NULL,
    
    -- Status
    status ENUM('Active', 'Inactive', 'Expired') DEFAULT 'Active',
    created_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    modified_date DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    INDEX idx_code (promo_code),
    INDEX idx_status (status),
    INDEX idx_dates (start_date, end_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- 8. PROMO CODE USAGE - Track who used which promo codes
-- ============================================================================
CREATE TABLE IF NOT EXISTS promo_code_usage (
    usage_id INT AUTO_INCREMENT PRIMARY KEY,
    promo_id INT NOT NULL,
    account_id INT NOT NULL,
    order_id INT DEFAULT NULL,
    
    -- Applied value
    discount_applied DECIMAL(10,2) DEFAULT NULL,
    bonus_applied INT DEFAULT NULL,
    
    -- Timestamps
    used_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    INDEX idx_promo (promo_id),
    INDEX idx_account (account_id),
    INDEX idx_promo_account (promo_id, account_id),
    
    CONSTRAINT fk_promo_usage_promo 
        FOREIGN KEY (promo_id) REFERENCES promo_code(promo_id) 
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_promo_usage_account 
        FOREIGN KEY (account_id) REFERENCES account(account_id) 
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_promo_usage_order 
        FOREIGN KEY (order_id) REFERENCES payment_order(order_id) 
        ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- SEED DATA: Credit Packages
-- ============================================================================
INSERT INTO credit_package (
    package_code, package_name, package_description, 
    credit_amount, price_amount, validity_days,
    bonus_credits, bonus_description,
    package_badge, package_color, is_featured, sort_order
) VALUES 
-- Starter Package
(
    'STARTER',
    'Starter Pack',
    'Perfect for trying out TaxLah. Includes basic report generation and AI categorization.',
    50,
    19.90,
    548,
    0,
    NULL,
    NULL,
    '#6c757d',
    'No',
    1
),
-- Standard Package
(
    'STANDARD',
    'Standard Pack',
    'Great value for regular users. Ideal for complete tax filing season.',
    150,
    49.90,
    548,
    10,
    '+10 bonus credits',
    'POPULAR',
    '#17a2b8',
    'No',
    2
),
-- Premium Package
(
    'PREMIUM',
    'Premium Pack',
    'Best value! Perfect for power users who want unlimited access throughout the year.',
    400,
    99.90,
    548,
    50,
    '+50 bonus credits',
    'BEST VALUE',
    '#28a745',
    'Yes',
    3
),
-- Business Package
(
    'BUSINESS',
    'Business Pack',
    'For professionals and small businesses managing multiple tax profiles.',
    1000,
    199.90,
    548,
    150,
    '+150 bonus credits',
    'PRO',
    '#6f42c1',
    'No',
    4
);

-- ============================================================================
-- SEED DATA: Credit Usage Rates
-- ============================================================================
INSERT INTO credit_usage_rate (rate_code, rate_name, rate_description, credit_cost, feature_category) VALUES
-- Receipt features
('RECEIPT_AI_CATEGORIZE', 'AI Auto-Categorization', 'Automatic categorization of receipt using AI', 2, 'Receipt'),
('RECEIPT_OCR_EXTRACT', 'OCR Text Extraction', 'Extract text and data from receipt image', 1, 'Receipt'),

-- Report features
('REPORT_BASIC', 'Basic Tax Report', 'Simple summary with category totals', 30, 'Report'),
('REPORT_DETAILED', 'Detailed Tax Report', 'Comprehensive report with breakdown and receipts', 50, 'Report'),
('REPORT_PREMIUM', 'Premium LHDN-Ready Report', 'Full report with LHDN format and all details', 80, 'Report'),
('REPORT_ACCOUNTANT', 'Accountant Export', 'Professional export format for accountants', 100, 'Report'),

-- Subscription features
('UNLIMITED_RECEIPTS_MONTH', 'Unlimited Receipts (Monthly)', 'Unlimited receipt uploads for one month', 20, 'Subscription'),
('UNLIMITED_AI_MONTH', 'Unlimited AI Categorization (Monthly)', 'Unlimited AI categorization for one month', 35, 'Subscription'),

-- Premium features
('FEATURE_MULTI_YEAR', 'Multi-Year Comparison', 'Compare tax reliefs across multiple years', 25, 'Feature'),
('FEATURE_TAX_FORECAST', 'Tax Forecast', 'AI-powered tax savings forecast', 15, 'Feature'),
('FEATURE_FAMILY_PLAN', 'Family Member Addition', 'Add one family member to your account', 50, 'Feature');

-- ============================================================================
-- SEED DATA: Sample Promo Codes
-- ============================================================================
INSERT INTO promo_code (
    promo_code, promo_name, promo_description,
    promo_type, discount_type, discount_value, bonus_credits,
    max_uses_total, max_uses_per_user,
    start_date, end_date, status
) VALUES
-- Welcome discount
(
    'WELCOME2025',
    'Welcome 2025',
    'Welcome discount for new users',
    'Discount',
    'Percentage',
    20.00,
    NULL,
    1000,
    1,
    '2025-01-01 00:00:00',
    '2025-03-31 23:59:59',
    'Active'
),
-- Tax season bonus
(
    'TAXSEASON25',
    'Tax Season 2025',
    'Bonus credits during tax filing season',
    'Bonus',
    NULL,
    NULL,
    30,
    NULL,
    1,
    '2025-02-01 00:00:00',
    '2025-04-30 23:59:59',
    'Active'
),
-- Free trial credits
(
    'FREETRIAL',
    'Free Trial',
    '20 free credits to try TaxLah',
    'FreeCredits',
    NULL,
    NULL,
    NULL,
    5000,
    1,
    '2025-01-01 00:00:00',
    '2025-12-31 23:59:59',
    'Active'
);

-- ============================================================================
-- VIEWS: Useful queries
-- ============================================================================

-- View: User credit summary
CREATE OR REPLACE VIEW v_account_credit_summary AS
SELECT 
    ac.account_id,
    a.account_name,
    a.account_email,
    ac.credit_balance,
    ac.lifetime_credits,
    ac.lifetime_spent,
    ac.free_receipts_used,
    ac.free_receipts_limit,
    (ac.free_receipts_limit - ac.free_receipts_used) as free_receipts_remaining,
    (
        SELECT COUNT(*) FROM credit_batch cb 
        WHERE cb.account_id = ac.account_id 
        AND cb.status = 'Active' 
        AND cb.expiry_date > NOW()
    ) as active_batches,
    (
        SELECT MIN(cb.expiry_date) FROM credit_batch cb 
        WHERE cb.account_id = ac.account_id 
        AND cb.status = 'Active' 
        AND cb.credits_remaining > 0
        AND cb.expiry_date > NOW()
    ) as nearest_expiry,
    ac.status,
    ac.created_date
FROM account_credit ac
JOIN account a ON ac.account_id = a.account_id;

-- View: Package performance
CREATE OR REPLACE VIEW v_package_performance AS
SELECT 
    cp.package_id,
    cp.package_code,
    cp.package_name,
    cp.price_amount,
    cp.credit_amount,
    COUNT(DISTINCT po.order_id) as total_orders,
    COUNT(DISTINCT CASE WHEN po.payment_status = 'Paid' THEN po.order_id END) as paid_orders,
    COALESCE(SUM(CASE WHEN po.payment_status = 'Paid' THEN po.order_amount END), 0) as total_revenue,
    COALESCE(SUM(CASE WHEN po.payment_status = 'Paid' THEN po.credit_amount END), 0) as total_credits_sold
FROM credit_package cp
LEFT JOIN payment_order po ON cp.package_id = po.package_id
GROUP BY cp.package_id;

-- View: Monthly revenue
CREATE OR REPLACE VIEW v_monthly_revenue AS
SELECT 
    DATE_FORMAT(po.paid_date, '%Y-%m') as month,
    COUNT(DISTINCT po.order_id) as total_orders,
    COUNT(DISTINCT po.account_id) as unique_buyers,
    SUM(po.order_amount) as total_revenue,
    SUM(po.credit_amount + po.bonus_credits) as total_credits_issued,
    AVG(po.order_amount) as avg_order_value
FROM payment_order po
WHERE po.payment_status = 'Paid'
GROUP BY DATE_FORMAT(po.paid_date, '%Y-%m')
ORDER BY month DESC;

-- ============================================================================
-- STORED PROCEDURES
-- ============================================================================

DELIMITER //

-- Procedure: Initialize credit account for new user
CREATE PROCEDURE sp_init_account_credit(IN p_account_id INT)
BEGIN
    INSERT IGNORE INTO account_credit (account_id, credit_balance, free_tier_reset_date)
    VALUES (p_account_id, 0, DATE_ADD(CURDATE(), INTERVAL 1 YEAR));
END //

-- Procedure: Use credits (FIFO - oldest expiring first)
CREATE PROCEDURE sp_use_credits(
    IN p_account_id INT,
    IN p_amount INT,
    IN p_description VARCHAR(255),
    IN p_reference_type VARCHAR(50),
    IN p_reference_id INT,
    OUT p_success BOOLEAN,
    OUT p_message VARCHAR(255)
)
BEGIN
    DECLARE v_balance INT;
    DECLARE v_remaining INT;
    DECLARE v_batch_id INT;
    DECLARE v_batch_remaining INT;
    DECLARE v_deduct INT;
    DECLARE done INT DEFAULT FALSE;
    
    -- Cursor for active batches (FIFO by expiry)
    DECLARE batch_cursor CURSOR FOR
        SELECT batch_id, credits_remaining
        FROM credit_batch
        WHERE account_id = p_account_id
        AND status = 'Active'
        AND credits_remaining > 0
        AND expiry_date > NOW()
        ORDER BY expiry_date ASC, batch_id ASC;
    
    DECLARE CONTINUE HANDLER FOR NOT FOUND SET done = TRUE;
    
    -- Start transaction
    START TRANSACTION;
    
    -- Get current balance
    SELECT credit_balance INTO v_balance
    FROM account_credit
    WHERE account_id = p_account_id
    FOR UPDATE;
    
    -- Check sufficient balance
    IF v_balance IS NULL THEN
        SET p_success = FALSE;
        SET p_message = 'Credit account not found';
        ROLLBACK;
    ELSEIF v_balance < p_amount THEN
        SET p_success = FALSE;
        SET p_message = CONCAT('Insufficient credits. Required: ', p_amount, ', Available: ', v_balance);
        ROLLBACK;
    ELSE
        SET v_remaining = p_amount;
        
        -- Deduct from batches (FIFO)
        OPEN batch_cursor;
        
        deduct_loop: LOOP
            FETCH batch_cursor INTO v_batch_id, v_batch_remaining;
            
            IF done OR v_remaining <= 0 THEN
                LEAVE deduct_loop;
            END IF;
            
            -- Calculate deduction for this batch
            SET v_deduct = LEAST(v_remaining, v_batch_remaining);
            
            -- Update batch
            UPDATE credit_batch
            SET credits_remaining = credits_remaining - v_deduct,
                status = CASE WHEN credits_remaining - v_deduct <= 0 THEN 'Depleted' ELSE status END
            WHERE batch_id = v_batch_id;
            
            SET v_remaining = v_remaining - v_deduct;
        END LOOP;
        
        CLOSE batch_cursor;
        
        -- Update account balance
        UPDATE account_credit
        SET credit_balance = credit_balance - p_amount,
            lifetime_spent = lifetime_spent + p_amount
        WHERE account_id = p_account_id;
        
        -- Record transaction
        INSERT INTO credit_transaction (
            account_id, transaction_type, credit_amount,
            balance_before, balance_after, description,
            reference_type, reference_id, status
        ) VALUES (
            p_account_id, 'Usage', -p_amount,
            v_balance, v_balance - p_amount, p_description,
            p_reference_type, p_reference_id, 'Completed'
        );
        
        SET p_success = TRUE;
        SET p_message = 'Credits deducted successfully';
        COMMIT;
    END IF;
END //

-- Procedure: Add credits from purchase
CREATE PROCEDURE sp_add_credits(
    IN p_account_id INT,
    IN p_package_id INT,
    IN p_credits INT,
    IN p_bonus INT,
    IN p_validity_days INT,
    IN p_source_type VARCHAR(20),
    IN p_source_reference VARCHAR(100),
    IN p_payment_amount DECIMAL(10,2),
    IN p_payment_method VARCHAR(50),
    IN p_payment_reference VARCHAR(100),
    OUT p_batch_id INT,
    OUT p_transaction_id INT
)
BEGIN
    DECLARE v_balance INT;
    DECLARE v_total_credits INT;
    DECLARE v_expiry_date DATETIME;
    
    SET v_total_credits = p_credits + COALESCE(p_bonus, 0);
    SET v_expiry_date = DATE_ADD(NOW(), INTERVAL p_validity_days DAY);
    
    START TRANSACTION;
    
    -- Ensure credit account exists
    INSERT IGNORE INTO account_credit (account_id, credit_balance, free_tier_reset_date)
    VALUES (p_account_id, 0, DATE_ADD(CURDATE(), INTERVAL 1 YEAR));
    
    -- Get current balance
    SELECT credit_balance INTO v_balance
    FROM account_credit
    WHERE account_id = p_account_id
    FOR UPDATE;
    
    -- Create credit batch
    INSERT INTO credit_batch (
        account_id, package_id, credits_purchased, credits_remaining,
        bonus_credits, source_type, source_reference, expiry_date
    ) VALUES (
        p_account_id, p_package_id, p_credits, v_total_credits,
        p_bonus, p_source_type, p_source_reference, v_expiry_date
    );
    
    SET p_batch_id = LAST_INSERT_ID();
    
    -- Update account balance
    UPDATE account_credit
    SET credit_balance = credit_balance + v_total_credits,
        lifetime_credits = lifetime_credits + v_total_credits
    WHERE account_id = p_account_id;
    
    -- Record transaction
    INSERT INTO credit_transaction (
        account_id, batch_id, transaction_type, credit_amount,
        balance_before, balance_after, description,
        reference_type, reference_id,
        payment_amount, payment_method, payment_reference, status
    ) VALUES (
        p_account_id, p_batch_id, 'Purchase', v_total_credits,
        v_balance, v_balance + v_total_credits,
        CONCAT('Purchased ', p_credits, ' credits', IF(p_bonus > 0, CONCAT(' + ', p_bonus, ' bonus'), '')),
        'Package', p_package_id,
        p_payment_amount, p_payment_method, p_payment_reference, 'Completed'
    );
    
    SET p_transaction_id = LAST_INSERT_ID();
    
    COMMIT;
END //

-- Procedure: Expire old credits (run daily via cron)
CREATE PROCEDURE sp_expire_credits()
BEGIN
    DECLARE v_account_id INT;
    DECLARE v_batch_id INT;
    DECLARE v_expired_amount INT;
    DECLARE v_balance INT;
    DECLARE done INT DEFAULT FALSE;
    
    DECLARE expired_cursor CURSOR FOR
        SELECT account_id, batch_id, credits_remaining
        FROM credit_batch
        WHERE status = 'Active'
        AND credits_remaining > 0
        AND expiry_date <= NOW();
    
    DECLARE CONTINUE HANDLER FOR NOT FOUND SET done = TRUE;
    
    OPEN expired_cursor;
    
    expire_loop: LOOP
        FETCH expired_cursor INTO v_account_id, v_batch_id, v_expired_amount;
        
        IF done THEN
            LEAVE expire_loop;
        END IF;
        
        -- Get current balance
        SELECT credit_balance INTO v_balance
        FROM account_credit
        WHERE account_id = v_account_id;
        
        -- Mark batch as expired
        UPDATE credit_batch
        SET status = 'Expired', credits_remaining = 0
        WHERE batch_id = v_batch_id;
        
        -- Update account balance
        UPDATE account_credit
        SET credit_balance = credit_balance - v_expired_amount
        WHERE account_id = v_account_id;
        
        -- Record transaction
        INSERT INTO credit_transaction (
            account_id, batch_id, transaction_type, credit_amount,
            balance_before, balance_after, description, status
        ) VALUES (
            v_account_id, v_batch_id, 'Expiry', -v_expired_amount,
            v_balance, v_balance - v_expired_amount,
            CONCAT(v_expired_amount, ' credits expired'),
            'Completed'
        );
    END LOOP;
    
    CLOSE expired_cursor;
END //

DELIMITER ;

-- ============================================================================
-- EVENTS: Scheduled tasks
-- ============================================================================

-- Enable event scheduler (run once on server)
-- SET GLOBAL event_scheduler = ON;

-- Event: Daily credit expiry check
CREATE EVENT IF NOT EXISTS evt_daily_credit_expiry
ON SCHEDULE EVERY 1 DAY
STARTS (TIMESTAMP(CURRENT_DATE) + INTERVAL 1 DAY + INTERVAL 1 HOUR)
DO CALL sp_expire_credits();

-- ============================================================================
-- END OF SCHEMA
-- ============================================================================

-- 2025-12-05 01:17:54 UTC