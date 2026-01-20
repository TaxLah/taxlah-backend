-- Adminer 5.4.1 MySQL 8.0.44-0ubuntu0.24.04.1 dump

SET NAMES utf8;
SET time_zone = '+00:00';
SET foreign_key_checks = 0;
SET sql_mode = 'NO_AUTO_VALUE_ON_ZERO';

DELIMITER ;;

DROP PROCEDURE IF EXISTS `sp_add_credits`;;
CREATE PROCEDURE `sp_add_credits` (IN `p_account_id` int, IN `p_package_id` int, IN `p_credits` int, IN `p_bonus` int, IN `p_validity_days` int, IN `p_source_type` varchar(20), IN `p_source_reference` varchar(100), IN `p_payment_amount` decimal(10,2), IN `p_payment_method` varchar(50), IN `p_payment_reference` varchar(100), OUT `p_batch_id` int, OUT `p_transaction_id` int)
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
END;;

DROP PROCEDURE IF EXISTS `sp_expire_credits`;;
CREATE PROCEDURE `sp_expire_credits` ()
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
END;;

DROP PROCEDURE IF EXISTS `sp_init_account_credit`;;
CREATE PROCEDURE `sp_init_account_credit` (IN `p_account_id` int)
BEGIN
    INSERT IGNORE INTO account_credit (account_id, credit_balance, free_tier_reset_date)
    VALUES (p_account_id, 0, DATE_ADD(CURDATE(), INTERVAL 1 YEAR));
END;;

DROP PROCEDURE IF EXISTS `sp_recalculate_tax_claims`;;
CREATE PROCEDURE `sp_recalculate_tax_claims` (IN `p_account_id` int, IN `p_tax_year` year)
BEGIN
  -- For each tax category, sum up eligible expenses
  INSERT INTO account_tax_claim (
    account_id, tax_year, tax_id, claimed_amount, max_claimable, claim_status
  )
  SELECT 
    ae.account_id,
    p_tax_year,
    ae.expenses_tax_category,
    LEAST(SUM(ae.expenses_total_amount), tc.tax_max_claim),
    tc.tax_max_claim,
    'Draft'
  FROM account_expenses ae
  JOIN tax_category tc ON ae.expenses_tax_category = tc.tax_id
  WHERE ae.account_id = p_account_id
    AND ae.expenses_year = p_tax_year
    AND ae.expenses_tax_eligible = 'Yes'
    AND ae.status = 'Active'
    AND tc.tax_year = p_tax_year
  GROUP BY ae.account_id, ae.expenses_tax_category
  ON DUPLICATE KEY UPDATE
    claimed_amount = LEAST(VALUES(claimed_amount), max_claimable),
    last_modified = CURRENT_TIMESTAMP;
    
  -- Add auto-claim reliefs (like Individual relief)
  INSERT INTO account_tax_claim (
    account_id, tax_year, tax_id, claimed_amount, max_claimable, claim_status
  )
  SELECT 
    p_account_id,
    p_tax_year,
    tc.tax_id,
    tc.tax_max_claim,
    tc.tax_max_claim,
    'Verified'
  FROM tax_category tc
  WHERE tc.tax_year = p_tax_year
    AND tc.tax_is_auto_claim = 'Yes'
    AND tc.status = 'Active'
  ON DUPLICATE KEY UPDATE
    claimed_amount = max_claimable;
    
END;;

DROP PROCEDURE IF EXISTS `sp_use_credits`;;
CREATE PROCEDURE `sp_use_credits` (IN `p_account_id` int, IN `p_amount` int, IN `p_description` varchar(255), IN `p_reference_type` varchar(50), IN `p_reference_id` int, OUT `p_success` boolean, OUT `p_message` varchar(255))
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
END;;

DROP EVENT IF EXISTS `evt_daily_credit_expiry`;;
CREATE EVENT `evt_daily_credit_expiry` ON SCHEDULE EVERY 1 DAY STARTS '2026-01-01 01:00:00' ON COMPLETION NOT PRESERVE ENABLE DO CALL sp_expire_credits();;

DELIMITER ;

CREATE TABLE `account` (
  `account_id` int NOT NULL AUTO_INCREMENT,
  `account_secret_key` varchar(256) NOT NULL DEFAULT 'uuid()',
  `account_name` varchar(256) NOT NULL,
  `account_fullname` varchar(256) NOT NULL,
  `account_email` varchar(100) NOT NULL,
  `account_contact` varchar(20) DEFAULT NULL,
  `account_ic` varchar(20) CHARACTER SET latin1 COLLATE latin1_swedish_ci DEFAULT NULL,
  `account_gender` enum('Male','Female') CHARACTER SET latin1 COLLATE latin1_swedish_ci DEFAULT NULL,
  `account_dob` datetime DEFAULT NULL,
  `account_age` int DEFAULT NULL,
  `account_nationality` varchar(100) CHARACTER SET latin1 COLLATE latin1_swedish_ci DEFAULT 'Malaysia',
  `account_salary_range` decimal(15,2) DEFAULT '0.00',
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
) ENGINE=InnoDB DEFAULT CHARSET=latin1;


DELIMITER ;;

CREATE TRIGGER `account_ai` AFTER INSERT ON `account` FOR EACH ROW
INSERT INTO account_logs SELECT * FROM account;;

CREATE TRIGGER `account_ai_uuid` AFTER INSERT ON `account` FOR EACH ROW
UPDATE account SET account_secret_key = UUID() WHERE account_id = NEW.account_id;;

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

SET NAMES utf8mb4;

CREATE TABLE `account_credit` (
  `credit_id` int NOT NULL AUTO_INCREMENT,
  `account_id` int NOT NULL,
  `credit_balance` int NOT NULL DEFAULT '0' COMMENT 'Current available credits',
  `lifetime_credits` int NOT NULL DEFAULT '0' COMMENT 'Total credits ever purchased',
  `lifetime_spent` int NOT NULL DEFAULT '0' COMMENT 'Total credits ever used',
  `free_receipts_used` int DEFAULT '0' COMMENT 'Free receipts used this year',
  `free_receipts_limit` int DEFAULT '50' COMMENT 'Free receipts per year',
  `free_tier_reset_date` date DEFAULT NULL COMMENT 'When free tier resets',
  `status` enum('Active','Suspended','Inactive') COLLATE utf8mb4_unicode_ci DEFAULT 'Active',
  `created_date` datetime DEFAULT CURRENT_TIMESTAMP,
  `modified_date` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`credit_id`),
  UNIQUE KEY `unique_account` (`account_id`),
  KEY `idx_balance` (`credit_balance`),
  KEY `idx_status` (`status`),
  CONSTRAINT `fk_account_credit_account` FOREIGN KEY (`account_id`) REFERENCES `account` (`account_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE `account_dependant` (
  `dependant_id` int NOT NULL AUTO_INCREMENT,
  `dependant_name` varchar(256) NOT NULL,
  `dependant_fullname` varchar(256) DEFAULT NULL,
  `dependant_email` varchar(100) DEFAULT NULL,
  `dependant_phone` varchar(20) DEFAULT NULL,
  `dependant_ic` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `dependant_age` int DEFAULT NULL,
  `dependant_dob` datetime DEFAULT NULL,
  `dependant_gender` enum('Male','Female') DEFAULT NULL,
  `dependant_type` enum('Spouse','Child','Sibling','Parent','Relative','Other') DEFAULT NULL,
  `dependant_is_disabled` enum('No','Yes') CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT 'No',
  `dependant_disability_type` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `dependant_education_level` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `dependant_is_studying` enum('No','Yes') CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT 'No',
  `dependant_institution_name` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `dependant_institution_country` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT 'Malaysia',
  `status` enum('Active','Inactive','Deleted','Others') NOT NULL DEFAULT 'Active',
  `created_date` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `last_modified` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `account_id` int NOT NULL,
  PRIMARY KEY (`dependant_id`),
  KEY `account_id` (`account_id`),
  CONSTRAINT `account_dependant_ibfk_1` FOREIGN KEY (`account_id`) REFERENCES `account` (`account_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;


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
) ENGINE=InnoDB DEFAULT CHARSET=latin1;


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
  `expenses_year` year NOT NULL,
  `expenses_tax_eligible` enum('No','Yes') NOT NULL DEFAULT 'Yes',
  `expenses_for` enum('Self','Spouse','Child','Parent','Sibling') DEFAULT 'Self',
  `dependant_id` int DEFAULT NULL,
  `claim_id` int DEFAULT NULL,
  `status` enum('Active','Inactive','Deleted','Others') NOT NULL DEFAULT 'Active',
  `created_date` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `last_modified` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `account_id` int NOT NULL,
  PRIMARY KEY (`expenses_id`),
  KEY `expenses_tax_category` (`expenses_tax_category`),
  KEY `expenses_tax_subcategory` (`expenses_tax_subcategory`),
  KEY `account_id` (`account_id`),
  KEY `expenses_idx` (`expenses_id`,`expenses_tags`,`expenses_tax_category`,`expenses_tax_subcategory`,`expenses_receipt_no`,`expenses_date`,`expenses_year`,`expenses_tax_eligible`,`status`,`account_id`),
  KEY `fk_expenses_claim` (`claim_id`),
  KEY `fk_expenses_dependant` (`dependant_id`),
  CONSTRAINT `account_expenses_ibfk_1` FOREIGN KEY (`expenses_tax_category`) REFERENCES `tax_category` (`tax_id`) ON DELETE SET NULL,
  CONSTRAINT `account_expenses_ibfk_2` FOREIGN KEY (`expenses_tax_subcategory`) REFERENCES `tax_subcategory` (`taxsub_id`) ON DELETE SET NULL,
  CONSTRAINT `account_expenses_ibfk_3` FOREIGN KEY (`account_id`) REFERENCES `account` (`account_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_expenses_claim` FOREIGN KEY (`claim_id`) REFERENCES `account_tax_claim` (`claim_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_expenses_dependant` FOREIGN KEY (`dependant_id`) REFERENCES `account_dependant` (`dependant_id`) ON DELETE SET NULL
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
  `account_ic` varchar(20) CHARACTER SET latin1 COLLATE latin1_swedish_ci DEFAULT NULL,
  `account_gender` enum('Male','Female') CHARACTER SET latin1 COLLATE latin1_swedish_ci DEFAULT NULL,
  `account_dob` date DEFAULT NULL,
  `account_age` int DEFAULT NULL,
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
) ENGINE=InnoDB DEFAULT CHARSET=latin1;


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
) ENGINE=InnoDB DEFAULT CHARSET=latin1;


CREATE TABLE `account_subscription` (
  `subscription_id` int NOT NULL AUTO_INCREMENT,
  `account_id` int NOT NULL,
  `sub_package_id` int NOT NULL,
  `subscription_ref` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `billing_period` enum('Monthly','Yearly') COLLATE utf8mb4_unicode_ci NOT NULL,
  `price_amount` decimal(10,2) NOT NULL,
  `start_date` datetime NOT NULL,
  `current_period_start` datetime NOT NULL,
  `current_period_end` datetime NOT NULL,
  `next_billing_date` datetime DEFAULT NULL,
  `trial_end_date` datetime DEFAULT NULL,
  `cancelled_at` datetime DEFAULT NULL,
  `ended_at` datetime DEFAULT NULL,
  `status` enum('Trial','Active','Past_Due','Cancelled','Expired','Suspended') COLLATE utf8mb4_unicode_ci DEFAULT 'Trial',
  `auto_renew` enum('Yes','No') COLLATE utf8mb4_unicode_ci DEFAULT 'Yes',
  `payment_method` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `cancel_reason` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `cancel_at_period_end` enum('Yes','No') COLLATE utf8mb4_unicode_ci DEFAULT 'No',
  `created_date` datetime DEFAULT CURRENT_TIMESTAMP,
  `last_modified` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`subscription_id`),
  UNIQUE KEY `subscription_ref` (`subscription_ref`),
  KEY `idx_account` (`account_id`),
  KEY `idx_package` (`sub_package_id`),
  KEY `idx_status` (`status`),
  KEY `idx_next_billing` (`next_billing_date`),
  KEY `idx_active` (`account_id`,`status`),
  CONSTRAINT `fk_account_subscription_account` FOREIGN KEY (`account_id`) REFERENCES `account` (`account_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_account_subscription_package` FOREIGN KEY (`sub_package_id`) REFERENCES `subscription_package` (`sub_package_id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE `account_tax_claim` (
  `claim_id` int NOT NULL AUTO_INCREMENT,
  `claim_reference` varchar(50) DEFAULT NULL,
  `account_id` int NOT NULL,
  `tax_year` year NOT NULL,
  `tax_id` int NOT NULL,
  `taxsub_id` int DEFAULT NULL,
  `claimed_amount` decimal(15,2) NOT NULL DEFAULT '0.00',
  `max_claimable` decimal(15,2) NOT NULL DEFAULT '0.00',
  `claim_for` enum('Self','Spouse','Child','Parent','Dependant') DEFAULT 'Self',
  `dependant_id` int DEFAULT NULL,
  `claim_status` enum('Draft','Pending','Submitted','Verified','Rejected') DEFAULT 'Draft',
  `verification_notes` text,
  `status` enum('Active','Inactive','Deleted') DEFAULT 'Active',
  `created_date` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `last_modified` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`claim_id`),
  UNIQUE KEY `unique_claim` (`account_id`,`tax_year`,`tax_id`,`taxsub_id`,`dependant_id`),
  KEY `idx_account_year` (`account_id`,`tax_year`),
  KEY `idx_tax_category` (`tax_id`),
  KEY `idx_tax_subcategory` (`taxsub_id`),
  KEY `fk_claim_dependant` (`dependant_id`),
  CONSTRAINT `fk_claim_account` FOREIGN KEY (`account_id`) REFERENCES `account` (`account_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_claim_dependant` FOREIGN KEY (`dependant_id`) REFERENCES `account_dependant` (`dependant_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_claim_tax` FOREIGN KEY (`tax_id`) REFERENCES `tax_category` (`tax_id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_claim_taxsub` FOREIGN KEY (`taxsub_id`) REFERENCES `tax_subcategory` (`taxsub_id`) ON DELETE SET NULL,
  CONSTRAINT `chk_claimed_amount` CHECK ((`claimed_amount` >= 0)),
  CONSTRAINT `chk_claimed_not_exceed_max` CHECK ((`claimed_amount` <= `max_claimable`))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;


CREATE TABLE `account_tax_summary` (
  `summary_id` int NOT NULL AUTO_INCREMENT,
  `account_id` int NOT NULL,
  `tax_year` year NOT NULL,
  `total_income` decimal(15,2) DEFAULT '0.00',
  `total_relief` decimal(15,2) DEFAULT '0.00',
  `chargeable_income` decimal(15,2) DEFAULT '0.00',
  `tax_payable` decimal(15,2) DEFAULT '0.00',
  `summary_status` enum('Draft','Calculating','Completed','Filed') DEFAULT 'Draft',
  `status` enum('Active','Inactive','Deleted') DEFAULT 'Active',
  `created_date` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `last_modified` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`summary_id`),
  UNIQUE KEY `unique_account_year` (`account_id`,`tax_year`),
  CONSTRAINT `fk_summary_account` FOREIGN KEY (`account_id`) REFERENCES `account` (`account_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;


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
) ENGINE=InnoDB DEFAULT CHARSET=latin1;


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
) ENGINE=InnoDB DEFAULT CHARSET=latin1;


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
) ENGINE=InnoDB DEFAULT CHARSET=latin1;


DELIMITER ;;

CREATE TRIGGER `auth_access_ai` AFTER INSERT ON `auth_access` FOR EACH ROW
INSERT INTO auth_access_logs SELECT * FROM auth_access;;

CREATE TRIGGER `auth_access_ai_uuid` AFTER INSERT ON `auth_access` FOR EACH ROW
UPDATE auth_access SET auth_reference_key = UUID() WHERE auth_id = NEW.auth_id;;

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


CREATE TABLE `credit_batch` (
  `batch_id` int NOT NULL AUTO_INCREMENT,
  `account_id` int NOT NULL,
  `package_id` int DEFAULT NULL,
  `credits_purchased` int NOT NULL COMMENT 'Original credits in this batch',
  `credits_remaining` int NOT NULL COMMENT 'Remaining credits in this batch',
  `bonus_credits` int DEFAULT '0',
  `source_type` enum('Purchase','Bonus','Referral','Promotion','Refund','Admin') COLLATE utf8mb4_unicode_ci DEFAULT 'Purchase',
  `source_reference` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Order ID, promo code, etc.',
  `purchase_date` datetime DEFAULT CURRENT_TIMESTAMP,
  `expiry_date` datetime NOT NULL,
  `status` enum('Active','Depleted','Expired','Cancelled') COLLATE utf8mb4_unicode_ci DEFAULT 'Active',
  `created_date` datetime DEFAULT CURRENT_TIMESTAMP,
  `modified_date` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`batch_id`),
  KEY `idx_account` (`account_id`),
  KEY `idx_status` (`status`),
  KEY `idx_expiry` (`expiry_date`),
  KEY `idx_account_active` (`account_id`,`status`,`expiry_date`),
  KEY `fk_credit_batch_package` (`package_id`),
  CONSTRAINT `fk_credit_batch_account` FOREIGN KEY (`account_id`) REFERENCES `account` (`account_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_credit_batch_package` FOREIGN KEY (`package_id`) REFERENCES `credit_package` (`package_id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE `credit_package` (
  `package_id` int NOT NULL AUTO_INCREMENT,
  `package_code` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `package_name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `package_description` text COLLATE utf8mb4_unicode_ci,
  `credit_amount` int NOT NULL COMMENT 'Number of credits in package',
  `price_amount` decimal(10,2) NOT NULL COMMENT 'Price in MYR',
  `price_per_credit` decimal(10,4) GENERATED ALWAYS AS ((`price_amount` / `credit_amount`)) STORED,
  `package_badge` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'e.g., BEST VALUE, POPULAR',
  `package_color` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT '#1a5f7a' COMMENT 'Hex color for UI',
  `package_icon` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `sort_order` int DEFAULT '0',
  `validity_days` int DEFAULT '548' COMMENT 'Credits expire after X days (default 18 months)',
  `bonus_credits` int DEFAULT '0' COMMENT 'Extra bonus credits',
  `bonus_description` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `is_featured` enum('Yes','No') COLLATE utf8mb4_unicode_ci DEFAULT 'No',
  `is_recurring` enum('Yes','No') COLLATE utf8mb4_unicode_ci DEFAULT 'No' COMMENT 'Auto-renew subscription',
  `max_purchase_per_user` int DEFAULT NULL COMMENT 'NULL = unlimited',
  `status` enum('Active','Inactive','Hidden') COLLATE utf8mb4_unicode_ci DEFAULT 'Active',
  `created_date` datetime DEFAULT CURRENT_TIMESTAMP,
  `modified_date` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`package_id`),
  UNIQUE KEY `package_code` (`package_code`),
  KEY `idx_status` (`status`),
  KEY `idx_sort` (`sort_order`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE `credit_transaction` (
  `transaction_id` int NOT NULL AUTO_INCREMENT,
  `account_id` int NOT NULL,
  `batch_id` int DEFAULT NULL,
  `transaction_type` enum('Purchase','Usage','Bonus','Referral','Promotion','Refund','Expiry','Adjustment') COLLATE utf8mb4_unicode_ci NOT NULL,
  `credit_amount` int NOT NULL COMMENT 'Positive = credit in, Negative = credit out',
  `balance_before` int NOT NULL,
  `balance_after` int NOT NULL,
  `description` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `reference_type` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'e.g., Report, Receipt, Package',
  `reference_id` int DEFAULT NULL COMMENT 'ID of related record',
  `payment_amount` decimal(10,2) DEFAULT NULL,
  `payment_method` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'e.g., FPX, Card, E-Wallet',
  `payment_reference` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Payment gateway reference',
  `status` enum('Pending','Completed','Failed','Cancelled','Refunded') COLLATE utf8mb4_unicode_ci DEFAULT 'Completed',
  `created_date` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`transaction_id`),
  KEY `idx_account` (`account_id`),
  KEY `idx_type` (`transaction_type`),
  KEY `idx_status` (`status`),
  KEY `idx_created` (`created_date`),
  KEY `idx_reference` (`reference_type`,`reference_id`),
  KEY `idx_account_date` (`account_id`,`created_date`),
  KEY `fk_credit_trans_batch` (`batch_id`),
  CONSTRAINT `fk_credit_trans_account` FOREIGN KEY (`account_id`) REFERENCES `account` (`account_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_credit_trans_batch` FOREIGN KEY (`batch_id`) REFERENCES `credit_batch` (`batch_id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE `credit_usage_rate` (
  `rate_id` int NOT NULL AUTO_INCREMENT,
  `rate_code` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `rate_name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `rate_description` text COLLATE utf8mb4_unicode_ci,
  `credit_cost` int NOT NULL COMMENT 'Credits required',
  `feature_category` enum('Receipt','Report','Feature','Subscription') COLLATE utf8mb4_unicode_ci NOT NULL,
  `is_active` enum('Yes','No') COLLATE utf8mb4_unicode_ci DEFAULT 'Yes',
  `created_date` datetime DEFAULT CURRENT_TIMESTAMP,
  `modified_date` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`rate_id`),
  UNIQUE KEY `rate_code` (`rate_code`),
  KEY `idx_code` (`rate_code`),
  KEY `idx_category` (`feature_category`),
  KEY `idx_active` (`is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE `inquiry` (
  `inquiry_id` int NOT NULL AUTO_INCREMENT,
  `inquiry_name` varchar(256) NOT NULL,
  `inquiry_email` varchar(100) DEFAULT NULL,
  `inquiry_subject` varchar(299) DEFAULT NULL,
  `inquiry_message` text,
  `inquiry_status` enum('Active','Pending','In-Progress','Completed','Rejected','Deleted','Others') NOT NULL DEFAULT 'Active',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `last_modified` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`inquiry_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;


CREATE TABLE `merchant` (
  `merchant_id` int NOT NULL AUTO_INCREMENT,
  `merchant_uniq_no` varchar(256) CHARACTER SET latin1 COLLATE latin1_swedish_ci NOT NULL DEFAULT 'UUID()',
  `merchant_name` varchar(256) NOT NULL,
  `merchant_email` varchar(100) CHARACTER SET latin1 COLLATE latin1_swedish_ci DEFAULT NULL,
  `merchant_phone` varchar(20) CHARACTER SET latin1 COLLATE latin1_swedish_ci DEFAULT NULL,
  `merchant_address` text CHARACTER SET latin1 COLLATE latin1_swedish_ci,
  `merchant_category` varchar(256) NOT NULL,
  `merchant_image` text CHARACTER SET latin1 COLLATE latin1_swedish_ci,
  `status` enum('Active','Inactive','Deleted','Others') NOT NULL DEFAULT 'Active',
  `created_date` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `last_modified` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`merchant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;


CREATE TABLE `merchant_tax_category` (
  `mtc_id` int NOT NULL AUTO_INCREMENT,
  `merchant_id` int NOT NULL,
  `tax_id` int NOT NULL,
  `taxsub_id` int DEFAULT NULL,
  `priority` int DEFAULT '1' COMMENT 'Lower = higher priority',
  `status` enum('Active','Inactive') DEFAULT 'Active',
  `created_date` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`mtc_id`),
  UNIQUE KEY `unique_merchant_tax` (`merchant_id`,`tax_id`,`taxsub_id`),
  KEY `fk_mtc_tax` (`tax_id`),
  KEY `fk_mtc_taxsub` (`taxsub_id`),
  CONSTRAINT `fk_mtc_merchant` FOREIGN KEY (`merchant_id`) REFERENCES `merchant` (`merchant_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_mtc_tax` FOREIGN KEY (`tax_id`) REFERENCES `tax_category` (`tax_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_mtc_taxsub` FOREIGN KEY (`taxsub_id`) REFERENCES `tax_subcategory` (`taxsub_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;


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
) ENGINE=InnoDB DEFAULT CHARSET=latin1;


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


CREATE TABLE `payment_order` (
  `order_id` int NOT NULL AUTO_INCREMENT,
  `order_uuid` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Public order reference',
  `account_id` int NOT NULL,
  `package_id` int NOT NULL,
  `credit_amount` int NOT NULL,
  `bonus_credits` int DEFAULT '0',
  `order_amount` decimal(10,2) NOT NULL,
  `payment_gateway` enum('Chip','ToyyibPay','Stripe','Manual') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT 'Chip',
  `gateway_bill_code` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `gateway_reference` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `gateway_response` text COLLATE utf8mb4_unicode_ci,
  `payment_url` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `callback_url` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `order_status` enum('Pending','Processing','Completed','Failed','Cancelled','Expired') COLLATE utf8mb4_unicode_ci DEFAULT 'Pending',
  `payment_status` enum('Unpaid','Paid','Failed','Refunded') COLLATE utf8mb4_unicode_ci DEFAULT 'Unpaid',
  `created_date` datetime DEFAULT CURRENT_TIMESTAMP,
  `paid_date` datetime DEFAULT NULL,
  `expired_date` datetime DEFAULT NULL,
  `modified_date` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`order_id`),
  UNIQUE KEY `order_uuid` (`order_uuid`),
  KEY `idx_uuid` (`order_uuid`),
  KEY `idx_account` (`account_id`),
  KEY `idx_status` (`order_status`,`payment_status`),
  KEY `idx_gateway` (`payment_gateway`,`gateway_bill_code`),
  KEY `idx_created` (`created_date`),
  KEY `fk_payment_order_package` (`package_id`),
  CONSTRAINT `fk_payment_order_account` FOREIGN KEY (`account_id`) REFERENCES `account` (`account_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_payment_order_package` FOREIGN KEY (`package_id`) REFERENCES `credit_package` (`package_id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


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


CREATE TABLE `promo_code` (
  `promo_id` int NOT NULL AUTO_INCREMENT,
  `promo_code` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `promo_name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `promo_description` text COLLATE utf8mb4_unicode_ci,
  `promo_type` enum('Discount','Bonus','FreeCredits') COLLATE utf8mb4_unicode_ci NOT NULL,
  `discount_type` enum('Percentage','Fixed') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `discount_value` decimal(10,2) DEFAULT NULL COMMENT 'Percentage or fixed amount',
  `bonus_credits` int DEFAULT NULL COMMENT 'Extra credits to add',
  `free_credits` int DEFAULT NULL COMMENT 'Free credits (no purchase needed)',
  `min_purchase_amount` decimal(10,2) DEFAULT NULL,
  `applicable_packages` text COLLATE utf8mb4_unicode_ci COMMENT 'JSON array of package_ids, NULL = all',
  `max_uses_total` int DEFAULT NULL COMMENT 'NULL = unlimited',
  `max_uses_per_user` int DEFAULT '1',
  `current_uses` int DEFAULT '0',
  `start_date` datetime DEFAULT CURRENT_TIMESTAMP,
  `end_date` datetime DEFAULT NULL,
  `status` enum('Active','Inactive','Expired') COLLATE utf8mb4_unicode_ci DEFAULT 'Active',
  `created_date` datetime DEFAULT CURRENT_TIMESTAMP,
  `modified_date` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`promo_id`),
  UNIQUE KEY `promo_code` (`promo_code`),
  KEY `idx_code` (`promo_code`),
  KEY `idx_status` (`status`),
  KEY `idx_dates` (`start_date`,`end_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE `promo_code_usage` (
  `usage_id` int NOT NULL AUTO_INCREMENT,
  `promo_id` int NOT NULL,
  `account_id` int NOT NULL,
  `order_id` int DEFAULT NULL,
  `discount_applied` decimal(10,2) DEFAULT NULL,
  `bonus_applied` int DEFAULT NULL,
  `used_date` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`usage_id`),
  KEY `idx_promo` (`promo_id`),
  KEY `idx_account` (`account_id`),
  KEY `idx_promo_account` (`promo_id`,`account_id`),
  KEY `fk_promo_usage_order` (`order_id`),
  CONSTRAINT `fk_promo_usage_account` FOREIGN KEY (`account_id`) REFERENCES `account` (`account_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_promo_usage_order` FOREIGN KEY (`order_id`) REFERENCES `payment_order` (`order_id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_promo_usage_promo` FOREIGN KEY (`promo_id`) REFERENCES `promo_code` (`promo_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE `receipt` (
  `receipt_id` int NOT NULL AUTO_INCREMENT,
  `receipt_name` varchar(256) DEFAULT NULL,
  `receipt_description` text,
  `receipt_amount` decimal(15,2) NOT NULL DEFAULT '0.00',
  `receipt_items` json DEFAULT (_utf8mb4'[]'),
  `receipt_image_url` text NOT NULL,
  `receipt_metadata` json DEFAULT NULL,
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;


CREATE TABLE `receipt_tax_mapping` (
  `mapping_id` int NOT NULL AUTO_INCREMENT,
  `receipt_id` int NOT NULL,
  `tax_id` int NOT NULL,
  `taxsub_id` int DEFAULT NULL,
  `mapped_amount` decimal(15,2) NOT NULL DEFAULT '0.00',
  `confidence_score` decimal(5,2) DEFAULT '0.00' COMMENT 'AI confidence score 0-100',
  `is_verified` enum('Yes','No') DEFAULT 'No',
  `status` enum('Active','Inactive','Deleted') DEFAULT 'Active',
  `created_date` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `last_modified` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`mapping_id`),
  KEY `idx_receipt` (`receipt_id`),
  KEY `idx_tax` (`tax_id`),
  KEY `fk_mapping_taxsub` (`taxsub_id`),
  CONSTRAINT `fk_mapping_receipt` FOREIGN KEY (`receipt_id`) REFERENCES `receipt` (`receipt_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_mapping_tax` FOREIGN KEY (`tax_id`) REFERENCES `tax_category` (`tax_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_mapping_taxsub` FOREIGN KEY (`taxsub_id`) REFERENCES `tax_subcategory` (`taxsub_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;


CREATE TABLE `subscription_history` (
  `history_id` int NOT NULL AUTO_INCREMENT,
  `subscription_id` int NOT NULL,
  `account_id` int NOT NULL,
  `event_type` enum('Created','Activated','Renewed','Upgraded','Downgraded','Cancelled','Expired','Suspended','Resumed','Payment_Failed','Payment_Succeeded') COLLATE utf8mb4_unicode_ci NOT NULL,
  `event_description` text COLLATE utf8mb4_unicode_ci,
  `old_status` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `new_status` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `metadata` json DEFAULT NULL,
  `event_date` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`history_id`),
  KEY `idx_subscription` (`subscription_id`),
  KEY `idx_account` (`account_id`),
  KEY `idx_event` (`event_type`),
  KEY `idx_date` (`event_date`),
  CONSTRAINT `fk_subscription_history_account` FOREIGN KEY (`account_id`) REFERENCES `account` (`account_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_subscription_history_subscription` FOREIGN KEY (`subscription_id`) REFERENCES `account_subscription` (`subscription_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE `subscription_package` (
  `sub_package_id` int NOT NULL AUTO_INCREMENT,
  `package_code` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'PRO, PREMIUM',
  `package_name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `package_description` text COLLATE utf8mb4_unicode_ci,
  `billing_period` enum('Monthly','Yearly') COLLATE utf8mb4_unicode_ci NOT NULL,
  `price_amount` decimal(10,2) NOT NULL,
  `currency` varchar(3) COLLATE utf8mb4_unicode_ci DEFAULT 'MYR',
  `features` json DEFAULT NULL COMMENT 'List of features included',
  `max_receipts` int DEFAULT NULL COMMENT 'NULL = unlimited',
  `max_reports` int DEFAULT NULL COMMENT 'NULL = unlimited',
  `storage_limit_mb` int DEFAULT NULL COMMENT 'NULL = unlimited',
  `package_badge` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `package_color` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT '#1a5f7a',
  `is_featured` enum('Yes','No') COLLATE utf8mb4_unicode_ci DEFAULT 'No',
  `sort_order` int DEFAULT '0',
  `trial_days` int DEFAULT '0',
  `status` enum('Active','Inactive','Archived') COLLATE utf8mb4_unicode_ci DEFAULT 'Active',
  `created_date` datetime DEFAULT CURRENT_TIMESTAMP,
  `last_modified` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`sub_package_id`),
  UNIQUE KEY `package_code` (`package_code`),
  KEY `idx_code` (`package_code`),
  KEY `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE `subscription_payment` (
  `payment_id` int NOT NULL AUTO_INCREMENT,
  `subscription_id` int DEFAULT NULL,
  `account_id` int NOT NULL,
  `payment_ref` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `amount` decimal(10,2) NOT NULL,
  `currency` varchar(3) COLLATE utf8mb4_unicode_ci DEFAULT 'MYR',
  `period_start` datetime NOT NULL,
  `period_end` datetime NOT NULL,
  `payment_gateway` enum('ToyyibPay','Stripe','Chip','Manual') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT 'Chip',
  `gateway_transaction_id` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `gateway_response` json DEFAULT NULL,
  `payment_status` enum('Pending','Processing','Paid','Failed','Refunded','Cancelled') COLLATE utf8mb4_unicode_ci DEFAULT 'Pending',
  `created_date` datetime DEFAULT CURRENT_TIMESTAMP,
  `paid_date` datetime DEFAULT NULL,
  `failed_date` datetime DEFAULT NULL,
  `refunded_date` datetime DEFAULT NULL,
  PRIMARY KEY (`payment_id`),
  UNIQUE KEY `payment_ref` (`payment_ref`),
  KEY `idx_subscription` (`subscription_id`),
  KEY `idx_account` (`account_id`),
  KEY `idx_status` (`payment_status`),
  KEY `idx_gateway` (`payment_gateway`,`gateway_transaction_id`),
  CONSTRAINT `fk_subscription_payment_account` FOREIGN KEY (`account_id`) REFERENCES `account` (`account_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_subscription_payment_subscription` FOREIGN KEY (`subscription_id`) REFERENCES `account_subscription` (`subscription_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE `tax_category` (
  `tax_id` int NOT NULL AUTO_INCREMENT,
  `tax_code` varchar(100) CHARACTER SET latin1 COLLATE latin1_swedish_ci DEFAULT NULL,
  `tax_title` varchar(256) NOT NULL,
  `tax_description` text,
  `tax_max_claim` decimal(15,2) NOT NULL DEFAULT '0.00',
  `tax_content` json DEFAULT NULL,
  `tax_year` year DEFAULT NULL COMMENT 'ax reliefs change yearly',
  `tax_eligibility_criteria` json DEFAULT NULL COMMENT 'Who qualifies (e.g., disabled, senior)',
  `tax_requires_receipt` enum('No','Yes') DEFAULT NULL COMMENT 'Some reliefs need proof',
  `tax_claim_for` set('Self','Spouse','Child','Parent','Dependant') DEFAULT 'Self',
  `tax_frequency` enum('Yearly','Once Every 2 Years','Lifetime') DEFAULT 'Yearly',
  `tax_sort_order` int DEFAULT '0',
  `tax_claim_type` enum('Self','Spouse','Child','Parent','Combined') DEFAULT 'Self',
  `tax_is_auto_claim` enum('No','Yes') DEFAULT NULL COMMENT 'e.g., RM9,000 individual relief is automatic',
  `status` enum('Active','Inactive','Deleted','Others') NOT NULL DEFAULT 'Active',
  `created_date` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `last_modified` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`tax_id`),
  UNIQUE KEY `unique_tax_code_year` (`tax_code`,`tax_year`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;


CREATE TABLE `tax_subcategory` (
  `taxsub_id` int NOT NULL AUTO_INCREMENT,
  `taxsub_code` varchar(100) CHARACTER SET latin1 COLLATE latin1_swedish_ci DEFAULT NULL,
  `taxsub_tags` json DEFAULT NULL,
  `taxsub_title` varchar(256) NOT NULL,
  `taxsub_description` text,
  `taxsub_content` json DEFAULT NULL,
  `taxsub_max_claim` decimal(15,2) NOT NULL DEFAULT '0.00',
  `taxsub_claim_for` set('Self','Spouse','Child','Parent','Dependant') DEFAULT 'Self',
  `taxsub_requires_receipt` enum('Yes','No') DEFAULT 'Yes',
  `taxsub_sort_order` int DEFAULT '0',
  `status` enum('Active','Inactive','Deleted','Others') NOT NULL DEFAULT 'Active',
  `created_date` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `last_modified` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `tax_id` int NOT NULL,
  PRIMARY KEY (`taxsub_id`),
  KEY `tax_id` (`tax_id`),
  CONSTRAINT `tax_subcategory_ibfk_1` FOREIGN KEY (`tax_id`) REFERENCES `tax_category` (`tax_id`) ON DELETE SET DEFAULT
) ENGINE=InnoDB DEFAULT CHARSET=latin1;


CREATE TABLE `v_account_credit_summary` (`account_id` int, `account_name` varchar(256), `account_email` varchar(100), `credit_balance` int, `lifetime_credits` int, `lifetime_spent` int, `free_receipts_used` int, `free_receipts_limit` int, `free_receipts_remaining` bigint, `active_batches` bigint, `nearest_expiry` datetime, `status` enum('Active','Suspended','Inactive'), `created_date` datetime);


CREATE TABLE `v_monthly_revenue` (`month` varchar(7), `total_orders` bigint, `unique_buyers` bigint, `total_revenue` decimal(32,2), `total_credits_issued` decimal(33,0), `avg_order_value` decimal(14,6));


CREATE TABLE `v_package_performance` (`package_id` int, `package_code` varchar(50), `package_name` varchar(100), `price_amount` decimal(10,2), `credit_amount` int, `total_orders` bigint, `paid_orders` bigint, `total_revenue` decimal(32,2), `total_credits_sold` decimal(32,0));


CREATE TABLE `vw_tax_relief_full` (`tax_year` year, `tax_id` int, `tax_code` varchar(100), `tax_title` varchar(256), `tax_description` text, `category_max_claim` decimal(15,2), `tax_is_auto_claim` enum('No','Yes'), `tax_requires_receipt` enum('No','Yes'), `tax_claim_for` set('Self','Spouse','Child','Parent','Dependant'), `taxsub_id` int, `taxsub_code` varchar(100), `taxsub_title` varchar(256), `taxsub_description` text, `subcategory_max_claim` decimal(15,2));


CREATE TABLE `vw_tax_relief_full_2024` (`tax_id` int, `tax_code` varchar(100), `tax_title` varchar(256), `tax_description` text, `category_max_claim` decimal(15,2), `tax_is_auto_claim` enum('No','Yes'), `tax_requires_receipt` enum('No','Yes'), `tax_claim_for` set('Self','Spouse','Child','Parent','Dependant'), `taxsub_id` int, `taxsub_code` varchar(100), `taxsub_title` varchar(256), `taxsub_description` text, `subcategory_max_claim` decimal(15,2));


CREATE TABLE `vw_tax_relief_full_2025` (`tax_id` int, `tax_code` varchar(100), `tax_title` varchar(256), `tax_description` text, `category_max_claim` decimal(15,2), `tax_is_auto_claim` enum('No','Yes'), `tax_requires_receipt` enum('No','Yes'), `tax_claim_for` set('Self','Spouse','Child','Parent','Dependant'), `taxsub_id` int, `taxsub_code` varchar(100), `taxsub_title` varchar(256), `taxsub_description` text, `subcategory_max_claim` decimal(15,2));


CREATE TABLE `vw_user_claims_summary` (`account_id` int, `tax_year` year, `tax_code` varchar(100), `tax_title` varchar(256), `tax_max_claim` decimal(15,2), `total_claimed` decimal(37,2), `remaining_claimable` decimal(38,2));


CREATE TABLE `vw_user_expenses_by_category` (`account_id` int, `expense_year` int, `tax_code` varchar(100), `tax_title` varchar(256), `tax_max_claim` decimal(15,2), `total_expenses` decimal(37,2));


DROP TABLE IF EXISTS `v_account_credit_summary`;
CREATE ALGORITHM=UNDEFINED SQL SECURITY DEFINER VIEW `v_account_credit_summary` AS select `ac`.`account_id` AS `account_id`,`a`.`account_name` AS `account_name`,`a`.`account_email` AS `account_email`,`ac`.`credit_balance` AS `credit_balance`,`ac`.`lifetime_credits` AS `lifetime_credits`,`ac`.`lifetime_spent` AS `lifetime_spent`,`ac`.`free_receipts_used` AS `free_receipts_used`,`ac`.`free_receipts_limit` AS `free_receipts_limit`,(`ac`.`free_receipts_limit` - `ac`.`free_receipts_used`) AS `free_receipts_remaining`,(select count(0) from `credit_batch` `cb` where ((`cb`.`account_id` = `ac`.`account_id`) and (`cb`.`status` = 'Active') and (`cb`.`expiry_date` > now()))) AS `active_batches`,(select min(`cb`.`expiry_date`) from `credit_batch` `cb` where ((`cb`.`account_id` = `ac`.`account_id`) and (`cb`.`status` = 'Active') and (`cb`.`credits_remaining` > 0) and (`cb`.`expiry_date` > now()))) AS `nearest_expiry`,`ac`.`status` AS `status`,`ac`.`created_date` AS `created_date` from (`account_credit` `ac` join `account` `a` on((`ac`.`account_id` = `a`.`account_id`)));

DROP TABLE IF EXISTS `v_monthly_revenue`;
CREATE ALGORITHM=UNDEFINED SQL SECURITY DEFINER VIEW `v_monthly_revenue` AS select date_format(`po`.`paid_date`,'%Y-%m') AS `month`,count(distinct `po`.`order_id`) AS `total_orders`,count(distinct `po`.`account_id`) AS `unique_buyers`,sum(`po`.`order_amount`) AS `total_revenue`,sum((`po`.`credit_amount` + `po`.`bonus_credits`)) AS `total_credits_issued`,avg(`po`.`order_amount`) AS `avg_order_value` from `payment_order` `po` where (`po`.`payment_status` = 'Paid') group by date_format(`po`.`paid_date`,'%Y-%m') order by `month` desc;

DROP TABLE IF EXISTS `v_package_performance`;
CREATE ALGORITHM=UNDEFINED SQL SECURITY DEFINER VIEW `v_package_performance` AS select `cp`.`package_id` AS `package_id`,`cp`.`package_code` AS `package_code`,`cp`.`package_name` AS `package_name`,`cp`.`price_amount` AS `price_amount`,`cp`.`credit_amount` AS `credit_amount`,count(distinct `po`.`order_id`) AS `total_orders`,count(distinct (case when (`po`.`payment_status` = 'Paid') then `po`.`order_id` end)) AS `paid_orders`,coalesce(sum((case when (`po`.`payment_status` = 'Paid') then `po`.`order_amount` end)),0) AS `total_revenue`,coalesce(sum((case when (`po`.`payment_status` = 'Paid') then `po`.`credit_amount` end)),0) AS `total_credits_sold` from (`credit_package` `cp` left join `payment_order` `po` on((`cp`.`package_id` = `po`.`package_id`))) group by `cp`.`package_id`;

DROP TABLE IF EXISTS `vw_tax_relief_full`;
CREATE ALGORITHM=UNDEFINED SQL SECURITY DEFINER VIEW `vw_tax_relief_full` AS select `tc`.`tax_year` AS `tax_year`,`tc`.`tax_id` AS `tax_id`,`tc`.`tax_code` AS `tax_code`,`tc`.`tax_title` AS `tax_title`,`tc`.`tax_description` AS `tax_description`,`tc`.`tax_max_claim` AS `category_max_claim`,`tc`.`tax_is_auto_claim` AS `tax_is_auto_claim`,`tc`.`tax_requires_receipt` AS `tax_requires_receipt`,`tc`.`tax_claim_for` AS `tax_claim_for`,`ts`.`taxsub_id` AS `taxsub_id`,`ts`.`taxsub_code` AS `taxsub_code`,`ts`.`taxsub_title` AS `taxsub_title`,`ts`.`taxsub_description` AS `taxsub_description`,`ts`.`taxsub_max_claim` AS `subcategory_max_claim` from (`tax_category` `tc` left join `tax_subcategory` `ts` on(((`tc`.`tax_id` = `ts`.`tax_id`) and (`ts`.`status` = 'Active')))) where (`tc`.`status` = 'Active') order by `tc`.`tax_year` desc,`tc`.`tax_sort_order`,`ts`.`taxsub_sort_order`;

DROP TABLE IF EXISTS `vw_tax_relief_full_2024`;
CREATE ALGORITHM=UNDEFINED SQL SECURITY DEFINER VIEW `vw_tax_relief_full_2024` AS select `tc`.`tax_id` AS `tax_id`,`tc`.`tax_code` AS `tax_code`,`tc`.`tax_title` AS `tax_title`,`tc`.`tax_description` AS `tax_description`,`tc`.`tax_max_claim` AS `category_max_claim`,`tc`.`tax_is_auto_claim` AS `tax_is_auto_claim`,`tc`.`tax_requires_receipt` AS `tax_requires_receipt`,`tc`.`tax_claim_for` AS `tax_claim_for`,`ts`.`taxsub_id` AS `taxsub_id`,`ts`.`taxsub_code` AS `taxsub_code`,`ts`.`taxsub_title` AS `taxsub_title`,`ts`.`taxsub_description` AS `taxsub_description`,`ts`.`taxsub_max_claim` AS `subcategory_max_claim` from (`tax_category` `tc` left join `tax_subcategory` `ts` on(((`tc`.`tax_id` = `ts`.`tax_id`) and (`ts`.`status` = 'Active')))) where ((`tc`.`tax_year` = 2024) and (`tc`.`status` = 'Active')) order by `tc`.`tax_sort_order`,`ts`.`taxsub_sort_order`;

DROP TABLE IF EXISTS `vw_tax_relief_full_2025`;
CREATE ALGORITHM=UNDEFINED SQL SECURITY DEFINER VIEW `vw_tax_relief_full_2025` AS select `tc`.`tax_id` AS `tax_id`,`tc`.`tax_code` AS `tax_code`,`tc`.`tax_title` AS `tax_title`,`tc`.`tax_description` AS `tax_description`,`tc`.`tax_max_claim` AS `category_max_claim`,`tc`.`tax_is_auto_claim` AS `tax_is_auto_claim`,`tc`.`tax_requires_receipt` AS `tax_requires_receipt`,`tc`.`tax_claim_for` AS `tax_claim_for`,`ts`.`taxsub_id` AS `taxsub_id`,`ts`.`taxsub_code` AS `taxsub_code`,`ts`.`taxsub_title` AS `taxsub_title`,`ts`.`taxsub_description` AS `taxsub_description`,`ts`.`taxsub_max_claim` AS `subcategory_max_claim` from (`tax_category` `tc` left join `tax_subcategory` `ts` on(((`tc`.`tax_id` = `ts`.`tax_id`) and (`ts`.`status` = 'Active')))) where ((`tc`.`tax_year` = 2025) and (`tc`.`status` = 'Active')) order by `tc`.`tax_sort_order`,`ts`.`taxsub_sort_order`;

DROP TABLE IF EXISTS `vw_user_claims_summary`;
CREATE ALGORITHM=UNDEFINED SQL SECURITY DEFINER VIEW `vw_user_claims_summary` AS select `atc`.`account_id` AS `account_id`,`atc`.`tax_year` AS `tax_year`,`tc`.`tax_code` AS `tax_code`,`tc`.`tax_title` AS `tax_title`,`tc`.`tax_max_claim` AS `tax_max_claim`,sum(`atc`.`claimed_amount`) AS `total_claimed`,(`tc`.`tax_max_claim` - sum(`atc`.`claimed_amount`)) AS `remaining_claimable` from (`account_tax_claim` `atc` join `tax_category` `tc` on((`atc`.`tax_id` = `tc`.`tax_id`))) where (`atc`.`status` = 'Active') group by `atc`.`account_id`,`atc`.`tax_year`,`tc`.`tax_id`;

DROP TABLE IF EXISTS `vw_user_expenses_by_category`;
CREATE ALGORITHM=UNDEFINED SQL SECURITY DEFINER VIEW `vw_user_expenses_by_category` AS select `ae`.`account_id` AS `account_id`,year(`ae`.`expenses_date`) AS `expense_year`,`tc`.`tax_code` AS `tax_code`,`tc`.`tax_title` AS `tax_title`,`tc`.`tax_max_claim` AS `tax_max_claim`,sum(`ae`.`expenses_total_amount`) AS `total_expenses` from (`account_expenses` `ae` left join `tax_category` `tc` on((`ae`.`expenses_tax_category` = `tc`.`tax_id`))) where ((`ae`.`status` = 'Active') and (`ae`.`expenses_tax_eligible` = 'Yes')) group by `ae`.`account_id`,year(`ae`.`expenses_date`),`tc`.`tax_id`;

-- 2026-01-20 14:57:20 UTC