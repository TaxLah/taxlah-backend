-- Adminer 5.4.1 MySQL 8.0.44-0ubuntu0.24.04.1 dump

SET NAMES utf8;
SET time_zone = '+00:00';
SET foreign_key_checks = 0;
SET sql_mode = 'NO_AUTO_VALUE_ON_ZERO';

CREATE TABLE `account` (
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
  `account_status` enum('Pending','Active','Suspended','Others') NOT NULL DEFAULT 'Pending',
  `created_date` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `last_modified` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`account_id`),
  KEY `account_search_index` (`account_id`,`account_secret_key`,`account_name`,`account_email`,`account_status`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=latin1;


DELIMITER ;;

CREATE TRIGGER `account_ai` AFTER INSERT ON `account` FOR EACH ROW
INSERT INTO account_logs SELECT * FROM account;;

CREATE TRIGGER `account_au` AFTER UPDATE ON `account` FOR EACH ROW
INSERT INTO account_logs (
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
    ) VALUES (
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
    );;

DELIMITER ;

CREATE TABLE `account_device` (
  `device_id` int NOT NULL AUTO_INCREMENT,
  `account_id` int NOT NULL,
  `device_uuid` varchar(256) NOT NULL,
  `device_name` varchar(256) NOT NULL,
  `device_os` enum('Android','IOS') NOT NULL,
  `device_enable_fcm` enum('Yes','No') NOT NULL DEFAULT 'Yes',
  `device_fcm_token` text,
  `device_status` enum('Active','Inactive') NOT NULL DEFAULT 'Active',
  `created_date` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `last_modified` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`device_id`),
  KEY `account_id` (`account_id`),
  CONSTRAINT `account_device_ibfk_1` FOREIGN KEY (`account_id`) REFERENCES `account` (`account_id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=latin1;


CREATE TABLE `account_expenses` (
  `expenses_id` int NOT NULL AUTO_INCREMENT,
  `expenses_tags` varchar(100) DEFAULT NULL,
  `expenses_tax_category` int DEFAULT NULL,
  `expenses_tax_subcategory` int DEFAULT NULL,
  `expenses_receipt_no` varchar(256) DEFAULT NULL,
  `expenses_merchant_id` varchar(100) DEFAULT NULL,
  `expenses_merchant_name` varchar(256) DEFAULT NULL,
  `expenses_total_amount` decimal(15,2) NOT NULL DEFAULT '0.00',
  `expenses_date` date NOT NULL,
  `expenses_year` date NOT NULL,
  `expenses_tax_eligible` enum('No','Yes') NOT NULL DEFAULT 'Yes',
  `status` enum('Active','Inactive','Deleted','Others') NOT NULL DEFAULT 'Active',
  `created_date` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `last_modified` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `account_id` int NOT NULL,
  PRIMARY KEY (`expenses_id`),
  KEY `expenses_tax_category` (`expenses_tax_category`),
  KEY `expenses_tax_subcategory` (`expenses_tax_subcategory`),
  KEY `account_id` (`account_id`),
  KEY `expenses_idx` (`expenses_id`,`expenses_tags`,`expenses_tax_category`,`expenses_tax_subcategory`,`expenses_receipt_no`,`expenses_date`,`expenses_year`,`expenses_tax_eligible`,`status`,`account_id`),
  CONSTRAINT `account_expenses_ibfk_1` FOREIGN KEY (`expenses_tax_category`) REFERENCES `tax_category` (`tax_id`) ON DELETE SET NULL,
  CONSTRAINT `account_expenses_ibfk_2` FOREIGN KEY (`expenses_tax_subcategory`) REFERENCES `tax_subcategory` (`taxsub_id`) ON DELETE SET NULL,
  CONSTRAINT `account_expenses_ibfk_3` FOREIGN KEY (`account_id`) REFERENCES `account` (`account_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=latin1;


CREATE TABLE `account_expenses_item` (
  `item_id` int NOT NULL AUTO_INCREMENT,
  `item_sku_unit` varchar(256) DEFAULT NULL,
  `item_name` varchar(256) DEFAULT NULL,
  `item_unit_price` decimal(15,2) NOT NULL DEFAULT '0.00',
  `item_quantity` int NOT NULL DEFAULT '0',
  `item_total_price` decimal(10,0) NOT NULL DEFAULT '0',
  `status` enum('Active','Inactive','Deleted') NOT NULL DEFAULT 'Active',
  `created_date` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `last_modified` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `expenses_id` int NOT NULL,
  PRIMARY KEY (`item_id`),
  KEY `expenses_id` (`expenses_id`),
  KEY `expenses_item_idx` (`item_id`,`item_name`,`status`,`expenses_id`),
  CONSTRAINT `account_expenses_item_ibfk_1` FOREIGN KEY (`expenses_id`) REFERENCES `account_expenses` (`expenses_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=latin1;


CREATE TABLE `account_file` (
  `file_id` int NOT NULL AUTO_INCREMENT,
  `file_sku_unit` varchar(256) DEFAULT NULL,
  `file_name` varchar(256) DEFAULT NULL,
  `file_mime` varchar(100) DEFAULT NULL,
  `file_size` bigint DEFAULT '0',
  `file_ext` varchar(100) DEFAULT NULL,
  `file_path` varchar(256) DEFAULT NULL,
  `status` enum('Active','Inactive','Deleted','Others') NOT NULL DEFAULT 'Active',
  `created_date` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `last_modified` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `account_id` int NOT NULL,
  `storage_id` int NOT NULL,
  PRIMARY KEY (`file_id`),
  KEY `account_id` (`account_id`),
  KEY `storage_id` (`storage_id`),
  KEY `get_file_idx1` (`file_id`,`file_sku_unit`,`status`,`created_date`,`account_id`,`storage_id`),
  CONSTRAINT `account_file_ibfk_1` FOREIGN KEY (`account_id`) REFERENCES `account` (`account_id`) ON DELETE CASCADE,
  CONSTRAINT `account_file_ibfk_2` FOREIGN KEY (`storage_id`) REFERENCES `account_storage` (`storage_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=latin1;


CREATE TABLE `account_logs` (
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
  `account_status` enum('Pending','Active','Suspended','Others') NOT NULL DEFAULT 'Pending',
  `created_date` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `last_modified` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=latin1;


CREATE TABLE `account_notification` (
  `notification_id` int NOT NULL AUTO_INCREMENT,
  `account_id` int NOT NULL,
  `notification_title` varchar(256) NOT NULL,
  `notification_description` text,
  `read_status` enum('No','Yes') NOT NULL DEFAULT 'No',
  `archive_status` enum('No','Yes') NOT NULL DEFAULT 'No',
  `status` enum('Active','Inactive','Deleted','Others') NOT NULL DEFAULT 'Active',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `last_modified` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`notification_id`),
  KEY `account_id` (`account_id`),
  CONSTRAINT `account_notification_ibfk_1` FOREIGN KEY (`account_id`) REFERENCES `account` (`account_id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=latin1;


CREATE TABLE `account_storage` (
  `storage_id` int NOT NULL AUTO_INCREMENT,
  `storage_sku_unit` varchar(100) DEFAULT NULL,
  `storage_default_space` decimal(15,2) NOT NULL DEFAULT '0.00',
  `storage_current_space` decimal(15,2) NOT NULL DEFAULT '0.00',
  `storage_path` varchar(256) DEFAULT NULL,
  `status` enum('Active','Inactive','Suspended','Deleted','Other') NOT NULL DEFAULT 'Active',
  `created_date` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `last_modified` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `account_id` int NOT NULL,
  PRIMARY KEY (`storage_id`),
  KEY `account_id` (`account_id`),
  KEY `get_account_storage_idx` (`storage_id`,`storage_current_space`,`status`,`account_id`),
  CONSTRAINT `account_storage_ibfk_1` FOREIGN KEY (`account_id`) REFERENCES `account` (`account_id`) ON DELETE CASCADE,
  CONSTRAINT `BALANCE_MOST_NOT_NEGATIVE` CHECK ((`storage_current_space` > 0.00))
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=latin1;


CREATE TABLE `admin` (
  `admin_id` int NOT NULL AUTO_INCREMENT,
  `admin_name` varchar(256) NOT NULL,
  `admin_fullname` varchar(256) NOT NULL,
  `admin_email` varchar(100) NOT NULL,
  `admin_phone` varchar(100) NOT NULL,
  `admin_role` enum('Super Admin','Administrator','Manager','Accountant','Billing') NOT NULL DEFAULT 'Administrator',
  `admin_image` text,
  `admin_status` enum('Active','Pending','Inactive','Suspended','Deleted','Others') NOT NULL DEFAULT 'Pending',
  `create_date` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `last_modified` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`admin_id`),
  UNIQUE KEY `admin_email` (`admin_email`),
  KEY `admin_id_admin_name_admin_email_admin_role_admin_status` (`admin_id`,`admin_name`,`admin_email`,`admin_role`,`admin_status`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=latin1;


CREATE TABLE `admin_auth` (
  `aauth_id` int NOT NULL AUTO_INCREMENT,
  `aauth_reference_no` varchar(256) NOT NULL DEFAULT 'uuid()',
  `aauth_username` varchar(256) NOT NULL,
  `aauth_usermail` varchar(256) NOT NULL,
  `aauth_password` varchar(256) NOT NULL,
  `aauth_role` enum('Super Admin','Administrator','Manager','Accountant','Billing') NOT NULL DEFAULT 'Administrator',
  `aauth_status` enum('Active','Pending','Inactive','Suspended','Deleted','Others') NOT NULL DEFAULT 'Pending',
  `created_date` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `last_modified` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `admin_id` int NOT NULL,
  PRIMARY KEY (`aauth_id`),
  UNIQUE KEY `aauth_reference_no` (`aauth_reference_no`),
  UNIQUE KEY `aauth_username` (`aauth_username`),
  UNIQUE KEY `aauth_usermail` (`aauth_usermail`),
  KEY `admin_id` (`admin_id`),
  KEY `aauth_login_idx` (`aauth_id`,`aauth_username`,`aauth_usermail`,`aauth_password`,`aauth_role`,`aauth_status`,`admin_id`),
  CONSTRAINT `admin_auth_ibfk_1` FOREIGN KEY (`admin_id`) REFERENCES `admin` (`admin_id`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=latin1;


CREATE TABLE `auth_access` (
  `auth_id` int NOT NULL AUTO_INCREMENT,
  `auth_reference_key` varchar(256) NOT NULL DEFAULT 'uuid()',
  `auth_username` varchar(256) NOT NULL,
  `auth_usermail` varchar(100) NOT NULL,
  `auth_password` varchar(256) NOT NULL,
  `auth_role` enum('Individual','Business') NOT NULL DEFAULT 'Individual',
  `auth_socmed` enum('Yes','No') DEFAULT 'No',
  `auth_is_verified` enum('Yes','No') NOT NULL DEFAULT 'No',
  `auth_otp` varchar(10) DEFAULT NULL,
  `auth_status` enum('Pending','Active','Inactive','Suspended','Others') NOT NULL DEFAULT 'Pending',
  `account_id` int NOT NULL,
  `created_date` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `last_modified` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`auth_id`),
  KEY `account_id` (`account_id`),
  KEY `search_login` (`auth_id`,`auth_reference_key`,`auth_username`,`auth_usermail`,`auth_password`,`auth_is_verified`,`auth_status`),
  CONSTRAINT `auth_access_ibfk_1` FOREIGN KEY (`account_id`) REFERENCES `account` (`account_id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=latin1;


DELIMITER ;;

CREATE TRIGGER `auth_access_ai` AFTER INSERT ON `auth_access` FOR EACH ROW
INSERT INTO auth_access_logs SELECT * FROM auth_access;;

CREATE TRIGGER `auth_access_au` AFTER UPDATE ON `auth_access` FOR EACH ROW
INSERT INTO auth_access_logs (
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
    ) VALUES (
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
    );;

DELIMITER ;

CREATE TABLE `auth_access_logs` (
  `auth_id` int NOT NULL DEFAULT '0',
  `auth_reference_key` varchar(256) NOT NULL DEFAULT 'uuid()',
  `auth_username` varchar(256) NOT NULL,
  `auth_usermail` varchar(100) NOT NULL,
  `auth_password` varchar(256) NOT NULL,
  `auth_role` enum('Individual','Business') NOT NULL DEFAULT 'Individual',
  `auth_socmed` enum('Yes','No') DEFAULT 'No',
  `auth_is_verified` enum('Yes','No') NOT NULL DEFAULT 'No',
  `auth_otp` varchar(10) DEFAULT NULL,
  `auth_status` enum('Pending','Active','Inactive','Suspended','Others') NOT NULL DEFAULT 'Pending',
  `account_id` int NOT NULL,
  `created_date` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `last_modified` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=latin1;


CREATE TABLE `merchant` (
  `merchant_id` int NOT NULL AUTO_INCREMENT,
  `merchant_uniq_no` varchar(256) NOT NULL DEFAULT 'uuid()',
  `merchant_name` int NOT NULL,
  `merchant_category` varchar(256) NOT NULL,
  `merchant_image` text NOT NULL,
  `status` enum('Active','Inactive','Deleted','Others') NOT NULL DEFAULT 'Active',
  `created_date` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `last_modified` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`merchant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;


CREATE TABLE `package` (
  `package_id` int NOT NULL AUTO_INCREMENT,
  `package_uniq_no` varchar(256) NOT NULL DEFAULT 'uuid()',
  `package_name` varchar(256) NOT NULL,
  `package_description` text NOT NULL,
  `package_content` json DEFAULT NULL,
  `package_item` json DEFAULT NULL,
  `package_base_price` decimal(15,2) NOT NULL DEFAULT '0.00',
  `package_discount_price` decimal(15,2) NOT NULL DEFAULT '0.00',
  `package_is_discount` enum('No','Yes') NOT NULL DEFAULT 'No',
  `status` enum('Active','Inactive','Deleted','Others') NOT NULL DEFAULT 'Active',
  `created_date` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `last_modified` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`package_id`),
  KEY `package_idx` (`package_id`,`package_name`,`package_base_price`,`package_discount_price`,`package_is_discount`,`status`),
  CONSTRAINT `package_chk_1` CHECK (json_valid(`package_content`)),
  CONSTRAINT `package_chk_2` CHECK (json_valid(`package_item`)),
  CONSTRAINT `package_content` CHECK (json_valid(`package_content`))
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=latin1;


SET NAMES utf8mb4;

CREATE TABLE `payment_gateway_conf` (
  `pg_id` int NOT NULL AUTO_INCREMENT,
  `pg_name` varchar(256) DEFAULT NULL,
  `pg_apikey` varchar(256) DEFAULT NULL,
  `pg_secretkey` varchar(256) DEFAULT NULL,
  `pg_baseurl` varchar(256) DEFAULT NULL,
  `pg_config` json DEFAULT NULL,
  `status` enum('Active','Inactive') NOT NULL DEFAULT 'Active',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `last_modified` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`pg_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;


CREATE TABLE `payment_transaction` (
  `transaction_id` int NOT NULL AUTO_INCREMENT,
  `transaction_ref_no` varchar(256) NOT NULL DEFAULT 'uuid()',
  `transaction_billname` varchar(256) NOT NULL,
  `transaction_billdescription` text NOT NULL,
  `transaction_billamount` decimal(15,2) NOT NULL DEFAULT '0.00',
  `transaction_data` json DEFAULT NULL,
  `transaction_status` enum('Created','Pending','Approved','Unsuccess','Others') NOT NULL DEFAULT 'Created',
  `transaction_callback` json DEFAULT NULL,
  `transaction_flag` int NOT NULL DEFAULT '0',
  `status` enum('Active','Inactive','Deleted','Others') NOT NULL DEFAULT 'Active',
  `created_date` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `last_modified` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `account_id` int NOT NULL,
  PRIMARY KEY (`transaction_id`),
  UNIQUE KEY `transaction_ref_no` (`transaction_ref_no`),
  KEY `account_id` (`account_id`),
  KEY `transaction_ref_idx` (`transaction_id`,`transaction_ref_no`,`transaction_status`,`transaction_flag`,`status`,`account_id`),
  CONSTRAINT `payment_transaction_ibfk_1` FOREIGN KEY (`account_id`) REFERENCES `account` (`account_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;


CREATE TABLE `tax_category` (
  `tax_id` int NOT NULL AUTO_INCREMENT,
  `tax_title` varchar(256) NOT NULL,
  `tax_description` text,
  `tax_max_claim` decimal(15,2) NOT NULL DEFAULT '0.00',
  `tax_content` json DEFAULT NULL,
  `status` enum('Active','Inactive','Deleted','Others') NOT NULL DEFAULT 'Active',
  `created_date` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `last_modified` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`tax_id`)
) ENGINE=InnoDB AUTO_INCREMENT=10 DEFAULT CHARSET=latin1;


CREATE TABLE `tax_subcategory` (
  `taxsub_id` int NOT NULL AUTO_INCREMENT,
  `taxsub_tags` json DEFAULT NULL,
  `taxsub_title` varchar(256) NOT NULL,
  `taxsub_description` text,
  `taxsub_content` json DEFAULT NULL,
  `taxsub_max_claim` decimal(15,2) NOT NULL DEFAULT '0.00',
  `status` enum('Active','Inactive','Deleted','Others') NOT NULL DEFAULT 'Active',
  `created_date` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `last_modified` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `tax_id` int NOT NULL,
  PRIMARY KEY (`taxsub_id`),
  KEY `tax_id` (`tax_id`),
  CONSTRAINT `tax_subcategory_ibfk_1` FOREIGN KEY (`tax_id`) REFERENCES `tax_category` (`tax_id`) ON DELETE SET DEFAULT
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

CREATE TABLE `receipt` (
  `receipt_id` int NOT NULL AUTO_INCREMENT,
  `receipt_name` varchar(256) DEFAULT NULL,
  `receipt_description` text,
  `receipt_amount` decimal(15,2) NOT NULL DEFAULT '0.00',
  `receipt_items` json DEFAULT (_utf8mb4'[]'),
  `receipt_image_url` text NOT NULL,
  `status` enum('Active','Inactive','Deleted','Others') NOT NULL DEFAULT 'Active',
  `created_date` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `last_modified` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `account_id` int NOT NULL,
  `rc_id` int NOT NULL,
  PRIMARY KEY (`receipt_id`),
  KEY `rc_id` (`rc_id`),
  KEY `account_id` (`account_id`),
  CONSTRAINT `receipt_ibfk_1` FOREIGN KEY (`rc_id`) REFERENCES `receipt_category` (`rc_id`) ON DELETE SET DEFAULT,
  CONSTRAINT `receipt_ibfk_2` FOREIGN KEY (`account_id`) REFERENCES `account` (`account_id`) ON DELETE SET DEFAULT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;


CREATE TABLE `receipt_category` (
  `rc_id` int NOT NULL AUTO_INCREMENT,
  `rc_name` varchar(256) NOT NULL,
  `rc_description` text,
  `status` enum('Active','Inactive') NOT NULL DEFAULT 'Active',
  `created_date` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `last_modified` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`rc_id`)
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;


-- 2025-12-05 01:17:54 UTC
