-- Adminer 5.4.1 MySQL 8.0.45-0ubuntu0.24.04.1 dump

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

DROP PROCEDURE IF EXISTS `sp_ai_categorize_expense`;;
CREATE PROCEDURE `sp_ai_categorize_expense` (IN `p_merchant_name` varchar(256), IN `p_merchant_id` varchar(100), IN `p_amount` decimal(15,2), IN `p_tax_year` year, OUT `p_tax_id` int, OUT `p_taxsub_id` int, OUT `p_confidence` decimal(5,2))
proc_label: BEGIN
    DECLARE v_found BOOLEAN DEFAULT FALSE;
    
    SET p_tax_id = NULL;
    SET p_taxsub_id = NULL;
    SET p_confidence = NULL;
    
    -- Priority 1: Check merchant_tax_category mapping
    SELECT mtc.tax_id, mtc.taxsub_id, 95.00
    INTO p_tax_id, p_taxsub_id, p_confidence
    FROM merchant_tax_category mtc
    JOIN merchant m ON mtc.merchant_id = m.merchant_id
    WHERE m.merchant_uniq_no = p_merchant_id
      AND mtc.status = 'Active'
    ORDER BY mtc.priority ASC
    LIMIT 1;
    
    IF p_tax_id IS NOT NULL THEN
        -- Verify category exists for current year
        SELECT tc.tax_id INTO p_tax_id
        FROM tax_category tc
        WHERE tc.tax_id = p_tax_id
          AND tc.tax_year = p_tax_year
          AND tc.status = 'Active'
        LIMIT 1;
        
        -- If found, exit early
        IF p_tax_id IS NOT NULL THEN
            LEAVE proc_label;
        END IF;
    END IF;
    
    -- Priority 2: Pattern matching with current year categories
    IF p_merchant_name LIKE '%POPULAR%' OR p_merchant_name LIKE '%MPH%' OR p_merchant_name LIKE '%BOOKSTORE%' THEN
        SELECT tax_id INTO p_tax_id
        FROM tax_category
        WHERE tax_code = 'LIFESTYLE' AND tax_year = p_tax_year AND status = 'Active'
        LIMIT 1;
        
        -- Try to find books subcategory
        IF p_tax_id IS NOT NULL THEN
            SELECT taxsub_id INTO p_taxsub_id
            FROM tax_subcategory
            WHERE tax_id = p_tax_id 
              AND (taxsub_code = 'BOOKS' OR taxsub_title LIKE '%Book%')
              AND status = 'Active'
            LIMIT 1;
        END IF;
        
        SET p_confidence = 85.00;
        SET v_found = TRUE;
        
    ELSEIF p_merchant_name LIKE '%CLINIC%' OR p_merchant_name LIKE '%HOSPITAL%' OR p_merchant_name LIKE '%PHARMACY%' THEN
        SELECT tax_id INTO p_tax_id
        FROM tax_category
        WHERE tax_code = 'MEDICAL' AND tax_year = p_tax_year AND status = 'Active'
        LIMIT 1;
        
        SET p_taxsub_id = NULL;
        SET p_confidence = 80.00;
        SET v_found = TRUE;
        
    ELSEIF p_merchant_name LIKE '%GYM%' OR p_merchant_name LIKE '%FITNESS%' OR p_merchant_name LIKE '%SPORT%' THEN
        SELECT tax_id INTO p_tax_id
        FROM tax_category
        WHERE tax_code = 'LIFESTYLE' AND tax_year = p_tax_year AND status = 'Active'
        LIMIT 1;
        
        -- Try to find gym/sports subcategory
        IF p_tax_id IS NOT NULL THEN
            SELECT taxsub_id INTO p_taxsub_id
            FROM tax_subcategory
            WHERE tax_id = p_tax_id 
              AND (taxsub_code = 'GYM' OR taxsub_title LIKE '%Gym%' OR taxsub_title LIKE '%Sport%')
              AND status = 'Active'
            LIMIT 1;
        END IF;
        
        SET p_confidence = 80.00;
        SET v_found = TRUE;
    END IF;
    
    -- If still not found, use default
    IF NOT v_found OR p_tax_id IS NULL THEN
        SELECT tax_id INTO p_tax_id
        FROM tax_category
        WHERE tax_code = 'LIFESTYLE' AND tax_year = p_tax_year AND status = 'Active'
        LIMIT 1;
        
        SET p_taxsub_id = NULL;
        SET p_confidence = 50.00;
    END IF;
    
END proc_label;;

DROP PROCEDURE IF EXISTS `sp_ai_categorize_expense_preliminary`;;
CREATE PROCEDURE `sp_ai_categorize_expense_preliminary` (IN `p_merchant_name` varchar(256), IN `p_merchant_id` varchar(100), IN `p_amount` decimal(15,2), IN `p_tax_year` year, OUT `p_tax_id` int, OUT `p_taxsub_id` int, OUT `p_confidence` decimal(5,2))
proc_label: BEGIN
    DECLARE v_previous_year YEAR;
    DECLARE v_found BOOLEAN DEFAULT FALSE;
    
    SET v_previous_year = p_tax_year - 1;
    SET p_tax_id = NULL;
    SET p_taxsub_id = NULL;
    SET p_confidence = NULL;
    
    -- Priority 1: Check merchant_tax_category mapping
    SELECT mtc.tax_id, mtc.taxsub_id, 85.00
    INTO p_tax_id, p_taxsub_id, p_confidence
    FROM merchant_tax_category mtc
    JOIN merchant m ON mtc.merchant_id = m.merchant_id
    WHERE m.merchant_uniq_no = p_merchant_id
      AND mtc.status = 'Active'
    ORDER BY mtc.priority ASC
    LIMIT 1;
    
    IF p_tax_id IS NOT NULL THEN
        SET v_found = TRUE;
        -- Map to previous year's equivalent category
        SELECT tc2.tax_id INTO p_tax_id
        FROM tax_category tc1
        JOIN tax_category tc2 ON tc1.tax_code = tc2.tax_code
        WHERE tc1.tax_id = p_tax_id
          AND tc2.tax_year = v_previous_year
          AND tc2.status = 'Active'
        LIMIT 1;
        
        -- If found, exit early
        IF p_tax_id IS NOT NULL THEN
            LEAVE proc_label;
        END IF;
    END IF;
    
    -- Priority 2: Simple pattern matching (use previous year's categories)
    IF p_merchant_name LIKE '%POPULAR%' OR p_merchant_name LIKE '%MPH%' OR p_merchant_name LIKE '%BOOKSTORE%' THEN
        SELECT tax_id INTO p_tax_id
        FROM tax_category
        WHERE tax_code = 'LIFESTYLE' AND tax_year = v_previous_year AND status = 'Active'
        LIMIT 1;
        SET p_confidence = 75.00;
        SET v_found = TRUE;
        
    ELSEIF p_merchant_name LIKE '%CLINIC%' OR p_merchant_name LIKE '%HOSPITAL%' OR p_merchant_name LIKE '%PHARMACY%' THEN
        SELECT tax_id INTO p_tax_id
        FROM tax_category
        WHERE tax_code = 'MEDICAL' AND tax_year = v_previous_year AND status = 'Active'
        LIMIT 1;
        SET p_confidence = 70.00;
        SET v_found = TRUE;
        
    ELSEIF p_merchant_name LIKE '%GYM%' OR p_merchant_name LIKE '%FITNESS%' OR p_merchant_name LIKE '%SPORT%' THEN
        SELECT tax_id INTO p_tax_id
        FROM tax_category
        WHERE tax_code = 'LIFESTYLE' AND tax_year = v_previous_year AND status = 'Active'
        LIMIT 1;
        SET p_confidence = 70.00;
        SET v_found = TRUE;
    END IF;
    
    -- If still not found, use default
    IF NOT v_found OR p_tax_id IS NULL THEN
        SELECT tax_id INTO p_tax_id
        FROM tax_category
        WHERE tax_code = 'LIFESTYLE' AND tax_year = v_previous_year AND status = 'Active'
        LIMIT 1;
        SET p_confidence = 50.00;
    END IF;
    
    -- Try to find matching subcategory (optional)
    SET p_taxsub_id = NULL;
    
END proc_label;;

DROP PROCEDURE IF EXISTS `sp_check_official_mapping_exists`;;
CREATE PROCEDURE `sp_check_official_mapping_exists` (IN `p_tax_year` year, OUT `p_exists` boolean, OUT `p_published_date` date)
BEGIN
    SELECT 
        COUNT(*) > 0,
        MAX(tax_published_date)
    INTO p_exists, p_published_date
    FROM tax_category
    WHERE tax_year = p_tax_year 
      AND tax_mapping_status = 'Official'
      AND status = 'Active';
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

DROP PROCEDURE IF EXISTS `sp_upload_receipt_with_mapping`;;
CREATE PROCEDURE `sp_upload_receipt_with_mapping` (IN `p_account_id` int, IN `p_receipt_date` date, IN `p_merchant_name` varchar(256), IN `p_amount` decimal(15,2), IN `p_merchant_id` varchar(100), IN `p_receipt_no` varchar(256), OUT `p_expenses_id` int, OUT `p_mapping_status` varchar(20), OUT `p_tax_category_name` varchar(256), OUT `p_confidence` decimal(5,2), OUT `p_message` varchar(500))
BEGIN
    DECLARE v_tax_year YEAR;
    DECLARE v_official_mapping_exists BOOLEAN DEFAULT FALSE;
    DECLARE v_tax_id INT DEFAULT NULL;
    DECLARE v_taxsub_id INT DEFAULT NULL;
    DECLARE v_confidence DECIMAL(5,2) DEFAULT NULL;
    DECLARE v_mapping_version VARCHAR(50);
    DECLARE v_published_date DATE;
    
    -- Initialize output variables
    SET p_expenses_id = NULL;
    SET p_mapping_status = NULL;
    SET p_tax_category_name = NULL;
    SET p_confidence = NULL;
    SET p_message = NULL;
    
    SET v_tax_year = YEAR(p_receipt_date);
    
    -- Check if official LHDN mapping exists
    CALL sp_check_official_mapping_exists(v_tax_year, v_official_mapping_exists, v_published_date);
    
    IF v_official_mapping_exists THEN
        -- Use official mapping
        SET v_mapping_version = CONCAT(v_tax_year, '-official');
        
        CALL sp_ai_categorize_expense(
            p_merchant_name, p_merchant_id, p_amount, v_tax_year,
            v_tax_id, v_taxsub_id, v_confidence
        );
        
        -- Insert expense with confirmed mapping
        INSERT INTO account_expenses (
            account_id, expenses_merchant_name, expenses_merchant_id,
            expenses_receipt_no, expenses_total_amount, 
            expenses_date, expenses_year,
            expenses_tax_category, expenses_tax_subcategory,
            expenses_mapping_status, expenses_mapping_confidence,
            expenses_mapping_version, expenses_mapping_date,
            expenses_tax_eligible, status
        ) VALUES (
            p_account_id, p_merchant_name, p_merchant_id,
            p_receipt_no, p_amount,
            p_receipt_date, v_tax_year,
            v_tax_id, v_taxsub_id,
            'Confirmed', v_confidence, v_mapping_version, NOW(),
            'Yes', 'Active'
        );
        
        SET p_expenses_id = LAST_INSERT_ID();
        SET p_mapping_status = 'Confirmed';
        SET p_confidence = v_confidence;
        
        -- Get category name
        SELECT tax_title INTO p_tax_category_name
        FROM tax_category WHERE tax_id = v_tax_id;
        
        SET p_message = CONCAT('Receipt categorized as "', COALESCE(p_tax_category_name, 'Unknown'), '" using official LHDN mapping');
        
    ELSE
        -- Use preliminary mapping
        SET v_mapping_version = CONCAT(v_tax_year, '-preliminary');
        
        CALL sp_ai_categorize_expense_preliminary(
            p_merchant_name, p_merchant_id, p_amount, v_tax_year,
            v_tax_id, v_taxsub_id, v_confidence
        );
        
        -- Insert expense with estimated mapping
        INSERT INTO account_expenses (
            account_id, expenses_merchant_name, expenses_merchant_id,
            expenses_receipt_no, expenses_total_amount,
            expenses_date, expenses_year,
            expenses_tax_category, expenses_tax_subcategory,
            expenses_mapping_status, expenses_mapping_confidence,
            expenses_mapping_version, expenses_mapping_date,
            expenses_original_tax_category,
            expenses_tax_eligible, status
        ) VALUES (
            p_account_id, p_merchant_name, p_merchant_id,
            p_receipt_no, p_amount,
            p_receipt_date, v_tax_year,
            v_tax_id, v_taxsub_id,
            'Estimated', v_confidence, v_mapping_version, NOW(),
            v_tax_id,
            'Yes', 'Active'
        );
        
        SET p_expenses_id = LAST_INSERT_ID();
        SET p_mapping_status = 'Estimated';
        SET p_confidence = v_confidence;
        
        -- Get category name (from previous year)
        SELECT tax_title INTO p_tax_category_name
        FROM tax_category WHERE tax_id = v_tax_id;
        
        SET p_message = CONCAT(
            'Receipt saved with estimated category "', COALESCE(p_tax_category_name, 'Unknown'), 
            '". Official ', v_tax_year, ' LHDN tax categories will be available in October.'
        );
    END IF;
    
    -- Log initial categorization in history (only if expense was created)
    IF p_expenses_id IS NOT NULL THEN
        INSERT INTO account_expenses_mapping_history (
            expenses_id, new_tax_category, new_tax_subcategory,
            change_reason, confidence_after, mapping_version_after,
            changed_by, changed_date
        ) VALUES (
            p_expenses_id, v_tax_id, v_taxsub_id,
            'Initial', v_confidence, v_mapping_version,
            'System', NOW()
        );
    END IF;
    
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
  `account_secret_key` varchar(256) DEFAULT (uuid()),
  `account_name` varchar(256) NOT NULL,
  `account_fullname` varchar(256) NOT NULL,
  `company_name` varchar(200) DEFAULT NULL COMMENT 'Organisation / company name for billing display',
  `account_email` varchar(100) NOT NULL,
  `account_contact` varchar(30) CHARACTER SET latin1 COLLATE latin1_swedish_ci DEFAULT NULL,
  `account_ic` varchar(20) CHARACTER SET latin1 COLLATE latin1_swedish_ci DEFAULT NULL,
  `account_gender` enum('Male','Female') CHARACTER SET latin1 COLLATE latin1_swedish_ci DEFAULT NULL,
  `account_dob` date DEFAULT NULL,
  `account_age` int DEFAULT NULL,
  `account_nationality` varchar(100) CHARACTER SET latin1 COLLATE latin1_swedish_ci DEFAULT 'Malaysia',
  `account_salary_range` varchar(100) DEFAULT '0.00',
  `account_is_employed` int DEFAULT '0' COMMENT '0 - Unemployed, 1 - Employed',
  `account_is_tax_declared` int DEFAULT '0' COMMENT '0 - Not Declare, 1 - Declare',
  `account_address_1` text,
  `account_address_2` text,
  `account_address_3` text,
  `account_address_postcode` varchar(10) DEFAULT NULL,
  `account_address_city` varchar(100) DEFAULT NULL,
  `account_address_state` varchar(100) DEFAULT NULL,
  `account_profile_image` text,
  `account_status` enum('Pending','Active','Suspended','Others') CHARACTER SET latin1 COLLATE latin1_swedish_ci NOT NULL DEFAULT 'Active',
  `account_verified` enum('Pending','Approved','Unverified','Others') CHARACTER SET latin1 COLLATE latin1_swedish_ci NOT NULL DEFAULT 'Pending',
  `created_date` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `last_modified` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `is_deleted` int NOT NULL DEFAULT '0' COMMENT '1 - Deleted, 0 - Active',
  PRIMARY KEY (`account_id`),
  KEY `account_search_index` (`account_id`,`account_secret_key`,`account_name`,`account_email`,`account_status`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;


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

SET NAMES utf8mb4;

CREATE TABLE `account_approval` (
  `id` int NOT NULL AUTO_INCREMENT,
  `email` varchar(100) NOT NULL,
  `account` json DEFAULT NULL,
  `dependant` json DEFAULT NULL,
  `is_verified` enum('Pending','Approved','Rejected','Expired','Others') CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL DEFAULT 'Pending',
  `verified_date` datetime DEFAULT NULL,
  `otp_number` int DEFAULT NULL,
  `otp_expired_date` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `last_modified` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `is_deleted` int NOT NULL DEFAULT '0' COMMENT '0 = Deleted, 1 = Active',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;


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
  `dependant_is_employed` enum('No','Yes') CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT 'No',
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
  `receipt_id` int DEFAULT NULL,
  `expenses_merchant_id` varchar(100) DEFAULT NULL,
  `expenses_merchant_name` varchar(256) DEFAULT NULL,
  `expenses_total_amount` decimal(15,2) NOT NULL DEFAULT '0.00',
  `expenses_date` date NOT NULL,
  `expenses_year` year NOT NULL,
  `expenses_tax_eligible` enum('No','Yes') NOT NULL DEFAULT 'Yes',
  `expenses_mapping_status` enum('Pending','Estimated','Confirmed','Manual') DEFAULT 'Pending' COMMENT 'Pending=no mapping yet, Estimated=prelim AI, Confirmed=official LHDN, Manual=user override',
  `expenses_mapping_confidence` decimal(5,2) DEFAULT NULL COMMENT 'AI confidence score 0-100',
  `expenses_mapping_version` varchar(50) DEFAULT NULL COMMENT 'e.g., 2026-prelim, 2026-official',
  `expenses_original_tax_category` int DEFAULT NULL COMMENT 'Store original prelim category before remap',
  `expenses_mapping_date` datetime DEFAULT NULL COMMENT 'When category was assigned',
  `ai_processing_status` enum('None','Queued','Processing','Completed','Failed') NOT NULL DEFAULT 'None',
  `ai_processing_result` json DEFAULT NULL,
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
  KEY `fk_expenses_original_tax` (`expenses_original_tax_category`),
  KEY `idx_mapping_status` (`expenses_mapping_status`,`expenses_year`),
  KEY `idx_mapping_version` (`expenses_mapping_version`),
  KEY `idx_mapping_date` (`expenses_mapping_date`),
  KEY `idx_account_year_status` (`account_id`,`expenses_year`,`expenses_mapping_status`,`status`),
  KEY `idx_confidence_year` (`expenses_mapping_confidence`,`expenses_year`,`status`),
  KEY `idx_account_year_status_mapping` (`account_id`,`expenses_year`,`expenses_mapping_status`,`status`),
  KEY `idx_date_status_mapping` (`expenses_date`,`status`,`expenses_mapping_status`),
  KEY `idx_merchant_mapping` (`expenses_merchant_id`,`expenses_mapping_status`),
  KEY `idx_receipt_id` (`receipt_id`),
  KEY `idx_ai_processing_status` (`ai_processing_status`),
  CONSTRAINT `account_expenses_ibfk_1` FOREIGN KEY (`expenses_tax_category`) REFERENCES `tax_category` (`tax_id`) ON DELETE SET NULL,
  CONSTRAINT `account_expenses_ibfk_2` FOREIGN KEY (`expenses_tax_subcategory`) REFERENCES `tax_subcategory` (`taxsub_id`) ON DELETE SET NULL,
  CONSTRAINT `account_expenses_ibfk_3` FOREIGN KEY (`account_id`) REFERENCES `account` (`account_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_expenses_claim` FOREIGN KEY (`claim_id`) REFERENCES `account_tax_claim` (`claim_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_expenses_dependant` FOREIGN KEY (`dependant_id`) REFERENCES `account_dependant` (`dependant_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_expenses_original_tax` FOREIGN KEY (`expenses_original_tax_category`) REFERENCES `tax_category` (`tax_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_expenses_receipt` FOREIGN KEY (`receipt_id`) REFERENCES `receipt` (`receipt_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=latin1;


DELIMITER ;;

CREATE TRIGGER `trg_expenses_category_change` AFTER UPDATE ON `account_expenses` FOR EACH ROW
BEGIN
    -- Only log if tax category actually changed
    IF (OLD.expenses_tax_category != NEW.expenses_tax_category 
        OR OLD.expenses_tax_subcategory != NEW.expenses_tax_subcategory) THEN
        
        INSERT INTO `account_expenses_mapping_history` (
            expenses_id,
            old_tax_category,
            new_tax_category,
            old_tax_subcategory,
            new_tax_subcategory,
            change_reason,
            confidence_before,
            confidence_after,
            mapping_version_before,
            mapping_version_after,
            changed_by,
            changed_date
        ) VALUES (
            NEW.expenses_id,
            OLD.expenses_tax_category,
            NEW.expenses_tax_category,
            OLD.expenses_tax_subcategory,
            NEW.expenses_tax_subcategory,
            CASE 
                WHEN NEW.expenses_mapping_status = 'Manual' THEN 'User_Override'
                WHEN OLD.expenses_mapping_version != NEW.expenses_mapping_version THEN 'LHDN_Update'
                ELSE 'AI_Refinement'
            END,
            OLD.expenses_mapping_confidence,
            NEW.expenses_mapping_confidence,
            OLD.expenses_mapping_version,
            NEW.expenses_mapping_version,
            CASE 
                WHEN NEW.expenses_mapping_status = 'Manual' THEN 'User'
                ELSE 'System'
            END,
            NOW()
        );
    END IF;
END;;

DELIMITER ;

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


CREATE TABLE `account_expenses_mapping_history` (
  `history_id` int NOT NULL AUTO_INCREMENT,
  `expenses_id` int NOT NULL COMMENT 'FK to account_expenses',
  `old_tax_category` int DEFAULT NULL,
  `new_tax_category` int DEFAULT NULL,
  `old_tax_subcategory` int DEFAULT NULL,
  `new_tax_subcategory` int DEFAULT NULL,
  `change_reason` enum('Initial','LHDN_Update','User_Override','AI_Refinement','Admin_Correction','Merchant_Pattern') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'Initial' COMMENT 'Reason for categorization change',
  `confidence_before` decimal(5,2) DEFAULT NULL COMMENT 'AI confidence before change',
  `confidence_after` decimal(5,2) DEFAULT NULL COMMENT 'AI confidence after change',
  `mapping_version_before` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `mapping_version_after` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `changed_by` enum('System','User','Admin','AI') COLLATE utf8mb4_unicode_ci DEFAULT 'System',
  `changed_by_user_id` int DEFAULT NULL COMMENT 'account_id or admin_id',
  `change_notes` text COLLATE utf8mb4_unicode_ci,
  `change_metadata` json DEFAULT NULL COMMENT 'Extra data (merchant info, AI reasoning, etc.)',
  `changed_date` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`history_id`),
  KEY `idx_expenses` (`expenses_id`),
  KEY `idx_change_reason` (`change_reason`),
  KEY `idx_changed_date` (`changed_date`),
  KEY `idx_expenses_date` (`expenses_id`,`changed_date`),
  KEY `idx_changed_by` (`changed_by`,`changed_by_user_id`),
  KEY `fk_mapping_history_old_tax` (`old_tax_category`),
  KEY `fk_mapping_history_new_tax` (`new_tax_category`),
  KEY `fk_mapping_history_old_taxsub` (`old_tax_subcategory`),
  KEY `fk_mapping_history_new_taxsub` (`new_tax_subcategory`),
  KEY `idx_reason_date` (`change_reason`,`changed_date`),
  KEY `idx_reason_date_expenses` (`change_reason`,`changed_date`,`expenses_id`),
  KEY `idx_changed_date_reason` (`changed_date` DESC,`change_reason`),
  CONSTRAINT `fk_mapping_history_expenses` FOREIGN KEY (`expenses_id`) REFERENCES `account_expenses` (`expenses_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_mapping_history_new_tax` FOREIGN KEY (`new_tax_category`) REFERENCES `tax_category` (`tax_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_mapping_history_new_taxsub` FOREIGN KEY (`new_tax_subcategory`) REFERENCES `tax_subcategory` (`taxsub_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_mapping_history_old_tax` FOREIGN KEY (`old_tax_category`) REFERENCES `tax_category` (`tax_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_mapping_history_old_taxsub` FOREIGN KEY (`old_tax_subcategory`) REFERENCES `tax_subcategory` (`taxsub_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Audit trail for all expense categorization changes';


CREATE TABLE `account_expenses_mapping_notification` (
  `notification_id` int NOT NULL AUTO_INCREMENT,
  `account_id` int NOT NULL,
  `tax_year` year NOT NULL,
  `notification_type` enum('Mapping Available','Category Changed','Review Required','Preliminary Reminder','Expiry Warning') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `notification_title` varchar(256) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `notification_message` text COLLATE utf8mb4_unicode_ci,
  `notification_priority` enum('Low','Normal','High') COLLATE utf8mb4_unicode_ci DEFAULT 'Normal',
  `affected_expenses_count` int DEFAULT '0',
  `notification_data` json DEFAULT NULL COMMENT 'Details of changes, affected categories, etc.',
  `notification_status` enum('Pending','Sent','Read','Dismissed','Failed') COLLATE utf8mb4_unicode_ci DEFAULT 'Pending',
  `delivery_method` set('Push','Email','InApp') COLLATE utf8mb4_unicode_ci DEFAULT 'Push,InApp',
  `action_url` varchar(256) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Deep link to review page',
  `created_date` datetime DEFAULT CURRENT_TIMESTAMP,
  `sent_date` datetime DEFAULT NULL,
  `read_date` datetime DEFAULT NULL,
  `dismissed_date` datetime DEFAULT NULL,
  `retry_count` int DEFAULT '0',
  `last_retry_date` datetime DEFAULT NULL,
  PRIMARY KEY (`notification_id`),
  KEY `idx_account_year` (`account_id`,`tax_year`),
  KEY `idx_status` (`notification_status`),
  KEY `idx_type` (`notification_type`),
  KEY `idx_created` (`created_date`),
  KEY `idx_pending` (`notification_status`,`created_date`),
  KEY `idx_account_year_status_type` (`account_id`,`tax_year`,`notification_status`,`notification_type`),
  KEY `idx_pending_priority` (`notification_status`,`notification_priority`,`created_date`),
  KEY `idx_notification_data` ((cast(json_unquote(json_extract(`notification_data`,_utf8mb4'$.requires_review')) as unsigned))),
  CONSTRAINT `fk_mapping_notif_account` FOREIGN KEY (`account_id`) REFERENCES `account` (`account_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Notification queue for tax mapping updates';


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
  `company_name` varchar(200) CHARACTER SET latin1 COLLATE latin1_swedish_ci DEFAULT NULL COMMENT 'Organisation / company name for billing display',
  `account_email` varchar(100) NOT NULL,
  `account_contact` varchar(20) DEFAULT NULL,
  `account_ic` varchar(20) CHARACTER SET latin1 COLLATE latin1_swedish_ci DEFAULT NULL,
  `account_gender` enum('Male','Female') CHARACTER SET latin1 COLLATE latin1_swedish_ci DEFAULT NULL,
  `account_dob` date DEFAULT NULL,
  `account_age` int DEFAULT NULL,
  `account_nationality` varchar(100) CHARACTER SET latin1 COLLATE latin1_swedish_ci DEFAULT 'Malaysia',
  `account_salary_range` varchar(100) DEFAULT '0.00',
  `account_is_employed` int DEFAULT '0',
  `account_is_tax_declared` int DEFAULT '0',
  `account_address_1` text,
  `account_address_2` text,
  `account_address_3` text,
  `account_address_postcode` varchar(10) DEFAULT NULL,
  `account_address_city` varchar(100) DEFAULT NULL,
  `account_address_state` varchar(100) DEFAULT NULL,
  `account_profile_image` text,
  `account_status` enum('Pending','Active','Suspended','Others') CHARACTER SET latin1 COLLATE latin1_swedish_ci NOT NULL DEFAULT 'Active',
  `account_verified` enum('Pending','Approved','Unverified','Others') CHARACTER SET latin1 COLLATE latin1_swedish_ci NOT NULL DEFAULT 'Pending',
  `created_date` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `last_modified` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `is_deleted` int NOT NULL DEFAULT '0' COMMENT '0 - Deleted, 1 - Active'
) ENGINE=InnoDB DEFAULT CHARSET=latin1;


CREATE TABLE `account_notification` (
  `notification_id` int NOT NULL AUTO_INCREMENT,
  `account_id` int NOT NULL,
  `notification_title` varchar(256) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `notification_description` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `read_status` enum('No','Yes') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'No',
  `archive_status` enum('No','Yes') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'No',
  `status` enum('Active','Inactive','Deleted','Others') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'Active',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `last_modified` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`notification_id`),
  KEY `account_id` (`account_id`),
  CONSTRAINT `account_notification_ibfk_1` FOREIGN KEY (`account_id`) REFERENCES `account` (`account_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


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


CREATE TABLE `app_version` (
  `version_id` int NOT NULL AUTO_INCREMENT,
  `platform` enum('iOS','Android','Both') NOT NULL DEFAULT 'Both',
  `version_number` varchar(20) NOT NULL,
  `build_number` int DEFAULT NULL,
  `minimum_required_version` varchar(20) NOT NULL,
  `is_force_update` tinyint(1) NOT NULL DEFAULT '0',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `update_title` varchar(255) DEFAULT NULL,
  `update_message` text,
  `release_notes` text,
  `ios_download_url` varchar(500) DEFAULT NULL,
  `android_download_url` varchar(500) DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `last_modified` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `created_by` int DEFAULT NULL,
  PRIMARY KEY (`version_id`),
  KEY `created_by` (`created_by`),
  CONSTRAINT `app_version_ibfk_1` FOREIGN KEY (`created_by`) REFERENCES `admin_user` (`admin_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;


CREATE TABLE `auth_access` (
  `auth_id` int NOT NULL AUTO_INCREMENT,
  `auth_reference_key` varchar(256) DEFAULT (uuid()),
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
  `is_deleted` int NOT NULL DEFAULT '0' COMMENT '0 - Active, 1 - Deleted',
  PRIMARY KEY (`auth_id`),
  KEY `account_id` (`account_id`),
  KEY `search_login` (`auth_id`,`auth_reference_key`,`auth_username`,`auth_usermail`,`auth_password`,`auth_is_verified`,`auth_status`),
  CONSTRAINT `auth_access_ibfk_1` FOREIGN KEY (`account_id`) REFERENCES `account` (`account_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=latin1;


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
  `last_modified` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `is_deleted` int NOT NULL DEFAULT '1' COMMENT '1 - Active, 0 - Deleted'
) ENGINE=InnoDB DEFAULT CHARSET=latin1;


CREATE TABLE `bill` (
  `bill_id` int NOT NULL AUTO_INCREMENT,
  `bill_no` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'BILL-YYYYMM-NNNNN  e.g. BILL-202501-00302',
  `invoice_no` varchar(30) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'INV-YYYY-NNNNNN  assigned only on payment',
  `account_id` int NOT NULL,
  `subscription_id` int DEFAULT NULL COMMENT 'NULL for one-off bills',
  `sub_package_id` int DEFAULT NULL COMMENT 'FK to subscription_package — which plan is being billed',
  `bill_type` enum('Subscription','Renewal','TaxReliefReport','StorageAddon','UserSeatsAddon','EnterpriseLicense') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'Subscription',
  `bill_description` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'e.g. Premium Yearly Renewal',
  `billing_year` year NOT NULL COMMENT 'For year-tab filtering (2025|2024|2023)',
  `billing_month` tinyint unsigned NOT NULL COMMENT '1-12  for mobile monthly display',
  `billing_period_start` datetime DEFAULT NULL COMMENT 'Start of the subscription period being billed',
  `billing_period_end` datetime DEFAULT NULL COMMENT 'End   of the subscription period being billed',
  `bill_date` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'When the bill was issued',
  `due_date` datetime NOT NULL COMMENT 'Payment deadline; UI highlights in red when past',
  `paid_at` datetime DEFAULT NULL COMMENT 'Populated by processSuccessfulPayment()',
  `subtotal` decimal(10,2) NOT NULL DEFAULT '0.00',
  `sst_rate` decimal(5,4) NOT NULL DEFAULT '0.0600' COMMENT '0.0600 = 6% Malaysian SST',
  `sst_amount` decimal(10,2) NOT NULL DEFAULT '0.00' COMMENT 'subtotal × sst_rate (computed on insert)',
  `total_amount` decimal(10,2) NOT NULL DEFAULT '0.00' COMMENT 'subtotal + sst_amount  — incl. SST shown in UI',
  `currency` varchar(3) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'MYR',
  `chip_purchase_id` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'CHIP purchase UUID returned by /purchases/ API',
  `checkout_url` text COLLATE utf8mb4_unicode_ci COMMENT 'CHIP hosted payment page URL sent to user',
  `status` enum('Draft','Pending','Paid','Overdue','Cancelled','Refunded') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'Draft',
  `reminder_count` tinyint unsigned NOT NULL DEFAULT '0' COMMENT 'Number of push/email reminders sent',
  `reminder_sent_at` datetime DEFAULT NULL COMMENT 'Timestamp of most recent reminder',
  `notes` text COLLATE utf8mb4_unicode_ci COMMENT 'Admin notes, cancellation reason, etc.',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `last_modified` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`bill_id`),
  UNIQUE KEY `uq_bill_no` (`bill_no`),
  UNIQUE KEY `uq_invoice_no` (`invoice_no`),
  UNIQUE KEY `uq_chip_purchase` (`chip_purchase_id`),
  KEY `idx_bill_account` (`account_id`),
  KEY `idx_bill_subscription` (`subscription_id`),
  KEY `idx_bill_year_month` (`billing_year`,`billing_month`),
  KEY `idx_bill_status` (`status`),
  KEY `idx_bill_due` (`due_date`),
  KEY `idx_bill_type` (`bill_type`),
  KEY `idx_bill_paid_at` (`paid_at`),
  KEY `idx_bill_dashboard` (`billing_year`,`status`,`bill_type`),
  KEY `idx_bill_package` (`sub_package_id`),
  CONSTRAINT `fk_bill_account` FOREIGN KEY (`account_id`) REFERENCES `account` (`account_id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_bill_sub_package` FOREIGN KEY (`sub_package_id`) REFERENCES `subscription_package` (`sub_package_id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_bill_subscription` FOREIGN KEY (`subscription_id`) REFERENCES `account_subscription` (`subscription_id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `chk_bill_amounts` CHECK (((`total_amount` >= 0) and (`subtotal` >= 0))),
  CONSTRAINT `chk_bill_month` CHECK ((`billing_month` between 1 and 12))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Invoice / demand document — one row per billing event';


CREATE TABLE `billing_sequence` (
  `seq_type` enum('BILL','INV','TXN') COLLATE utf8mb4_unicode_ci NOT NULL,
  `seq_period` varchar(7) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'BILL/TXN: YYYYMM  |  INV: YYYY',
  `last_seq` int unsigned NOT NULL DEFAULT '0',
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`seq_type`,`seq_period`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Monotonically increasing counters for bill/invoice/txn numbers';


CREATE TABLE `billing_transaction` (
  `txn_id` int NOT NULL AUTO_INCREMENT,
  `txn_ref` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'TXN-YYYYMM-NNNNN  e.g. TXN-202501-00271',
  `bill_id` int NOT NULL,
  `account_id` int NOT NULL,
  `subscription_id` int DEFAULT NULL COMMENT 'Denormalised from bill for fast joins',
  `bill_year` year NOT NULL,
  `bill_month` tinyint unsigned NOT NULL,
  `payment_gateway` enum('Chip','ToyyibPay','Stripe','Manual') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'Chip',
  `gateway_purchase_id` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'CHIP purchase UUID / ToyyibPay bill code',
  `gateway_ref` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'orderId / bill_no passed as reference to gateway',
  `gateway_event_type` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'e.g. purchase.paid / purchase.failed',
  `gateway_status_raw` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Raw status string from gateway: paid/failed/pending',
  `payment_method` varchar(80) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'FPX Online Banking / E-Wallet / Debit Card / QR Pay',
  `bank_name` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Maybank / CIMB / RHB etc',
  `amount` decimal(10,2) NOT NULL,
  `currency` varchar(3) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'MYR',
  `client_email` varchar(150) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Email from CHIP client object at time of payment',
  `client_name` varchar(256) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Full name from CHIP client object at time of payment',
  `checkout_url` text COLLATE utf8mb4_unicode_ci,
  `success_redirect_url` text COLLATE utf8mb4_unicode_ci,
  `failure_redirect_url` text COLLATE utf8mb4_unicode_ci,
  `callback_url` text COLLATE utf8mb4_unicode_ci,
  `paid_at` datetime DEFAULT NULL,
  `failed_at` datetime DEFAULT NULL,
  `refunded_at` datetime DEFAULT NULL,
  `chip_payload` json DEFAULT NULL COMMENT 'Full purchase object from CHIP /purchases/ on creation',
  `chip_callback` json DEFAULT NULL COMMENT 'Full raw webhook / callback body from CHIP',
  `status` enum('Pending','Success','Failed','Refunded','Cancelled') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'Pending',
  `failure_reason` text COLLATE utf8mb4_unicode_ci,
  `is_test` tinyint(1) NOT NULL DEFAULT '0' COMMENT '1 = test/sandbox transaction',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `last_modified` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`txn_id`),
  UNIQUE KEY `uq_txn_ref` (`txn_ref`),
  UNIQUE KEY `uq_gateway_purchase_id` (`payment_gateway`,`gateway_purchase_id`),
  KEY `idx_btxn_bill` (`bill_id`),
  KEY `idx_btxn_account` (`account_id`),
  KEY `idx_btxn_subscription` (`subscription_id`),
  KEY `idx_btxn_year_month` (`bill_year`,`bill_month`),
  KEY `idx_btxn_status` (`status`),
  KEY `idx_btxn_gateway` (`payment_gateway`),
  KEY `idx_btxn_paid_at` (`paid_at`),
  KEY `idx_btxn_created` (`created_at`),
  KEY `idx_btxn_dashboard` (`bill_year`,`payment_gateway`,`status`),
  CONSTRAINT `fk_btxn_account` FOREIGN KEY (`account_id`) REFERENCES `account` (`account_id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_btxn_bill` FOREIGN KEY (`bill_id`) REFERENCES `bill` (`bill_id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_btxn_subscription` FOREIGN KEY (`subscription_id`) REFERENCES `account_subscription` (`subscription_id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `chk_btxn_amount` CHECK ((`amount` >= 0)),
  CONSTRAINT `chk_btxn_month` CHECK ((`bill_month` between 1 and 12))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Full gateway audit record — one row per payment attempt';


CREATE TABLE `blast_message` (
  `blast_id` int NOT NULL AUTO_INCREMENT,
  `blast_ref` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Unique reference e.g. BLAST-202501-00001',
  `blast_channel` enum('Push','Email') COLLATE utf8mb4_unicode_ci NOT NULL,
  `blast_title` varchar(65) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Push title or email subject',
  `blast_body` text COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Message body (plain text; may contain resolved variables)',
  `blast_recipient_type` enum('Group','Individual') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'Group',
  `blast_recipient_group` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Group key e.g. all_users, active_users, pending_claims',
  `blast_recipient_ids` json DEFAULT NULL COMMENT 'Array of account_ids when type=Individual',
  `blast_recipient_count` int NOT NULL DEFAULT '0' COMMENT 'Number of resolved recipients at send time',
  `blast_sent_count` int NOT NULL DEFAULT '0' COMMENT 'Successful deliveries',
  `blast_failed_count` int NOT NULL DEFAULT '0' COMMENT 'Failed deliveries',
  `blast_template_id` int DEFAULT NULL COMMENT 'Source template if used',
  `blast_status` enum('Draft','Pending','Sent','Failed') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'Draft',
  `blast_scheduled_at` datetime DEFAULT NULL COMMENT 'Reserved for future scheduled sends',
  `blast_sent_at` datetime DEFAULT NULL,
  `blast_sent_by` int DEFAULT NULL COMMENT 'admin_id of the sender',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`blast_id`),
  UNIQUE KEY `blast_ref` (`blast_ref`),
  KEY `idx_bm_status` (`blast_status`),
  KEY `idx_bm_channel` (`blast_channel`),
  KEY `idx_bm_sent_at` (`blast_sent_at`),
  KEY `idx_bm_sent_by` (`blast_sent_by`),
  KEY `fk_bm_template` (`blast_template_id`),
  CONSTRAINT `fk_bm_admin` FOREIGN KEY (`blast_sent_by`) REFERENCES `admin` (`admin_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_bm_template` FOREIGN KEY (`blast_template_id`) REFERENCES `blast_template` (`blast_template_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE `blast_template` (
  `blast_template_id` int NOT NULL AUTO_INCREMENT,
  `template_name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Display name of the template',
  `template_tag` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Category label e.g. Reminder, Notification, Announcement, Alert, Onboarding, Custom',
  `template_channel` enum('Push','Email','Both') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'Push',
  `template_title` varchar(65) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Push notification title or email subject (max 65 chars)',
  `template_body` text COLLATE utf8mb4_unicode_ci COMMENT 'Message body supporting {{variable}} placeholders',
  `status` enum('Active','Inactive') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'Active',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`blast_template_id`),
  KEY `idx_bt_status` (`status`),
  KEY `idx_bt_channel` (`template_channel`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


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
  `pg_provider` enum('ToyyibPay','Chip','Stripe','Manual') NOT NULL DEFAULT 'Manual',
  `pg_environment` enum('Production','Sandbox') NOT NULL DEFAULT 'Production',
  `pg_is_default` tinyint(1) NOT NULL DEFAULT '0',
  `pg_apikey` varchar(256) DEFAULT NULL,
  `pg_secretkey` varchar(256) DEFAULT NULL,
  `pg_baseurl` varchar(256) DEFAULT NULL,
  `pg_config` json DEFAULT NULL,
  `pg_payment_methods` json DEFAULT NULL,
  `status` enum('Active','Inactive') NOT NULL DEFAULT 'Active',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `last_modified` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`pg_id`),
  KEY `idx_pg_provider_env` (`pg_provider`,`pg_environment`),
  KEY `idx_pg_default` (`pg_is_default`),
  KEY `idx_pg_status` (`status`)
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


CREATE TABLE `prompt_templates` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(100) NOT NULL,
  `description` text,
  `template` text NOT NULL,
  `is_active` tinyint(1) DEFAULT '1',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;


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
  `rc_id` int DEFAULT NULL,
  `receipt_hash` varchar(64) DEFAULT NULL COMMENT 'SHA-256 hex of raw image bytes; NULL for non-image files',
  `receipt_phash` bigint unsigned DEFAULT NULL COMMENT '64-bit average perceptual hash; NULL for PDFs/non-image files',
  PRIMARY KEY (`receipt_id`),
  KEY `rc_id` (`rc_id`),
  KEY `idx_receipt_exact_hash` (`account_id`,`receipt_hash`),
  KEY `idx_receipt_phash` (`account_id`,`receipt_phash`),
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
  `event_type` enum('Created','Activated','Reminder','Renewed','Upgraded','Downgraded','Cancelled','Expired','Suspended','Resumed','Payment_Failed','Payment_Succeeded') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
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
  `tax_mapping_status` enum('Draft','Preliminary','Official','Archived') DEFAULT 'Draft' COMMENT 'Draft=not ready, Preliminary=based on prev year, Official=LHDN published',
  `tax_published_date` date DEFAULT NULL COMMENT 'Date LHDN officially published this year mapping',
  `tax_based_on_year` year DEFAULT NULL COMMENT 'If preliminary, which year was used as reference',
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
  UNIQUE KEY `unique_tax_code_year` (`tax_code`,`tax_year`),
  KEY `idx_mapping_status` (`tax_mapping_status`,`tax_year`),
  KEY `idx_published_date` (`tax_published_date`)
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


CREATE TABLE `v_account_mapping_dashboard` (`account_id` int, `account_name` varchar(256), `account_email` varchar(100), `current_year_receipts` bigint, `current_year_amount` decimal(37,2), `confirmed_count` decimal(23,0), `estimated_count` decimal(23,0), `pending_count` decimal(23,0), `manual_count` decimal(23,0), `avg_confidence` decimal(9,6), `needs_review_count` decimal(23,0), `last_receipt_date` date, `last_mapping_date` datetime);


CREATE TABLE `v_expenses_requiring_review` (`expenses_id` int, `account_id` int, `account_name` varchar(256), `account_email` varchar(100), `expenses_merchant_name` varchar(256), `expenses_total_amount` decimal(15,2), `expenses_date` date, `expenses_year` year, `tax_code` varchar(100), `tax_title` varchar(256), `expenses_mapping_status` enum('Pending','Estimated','Confirmed','Manual'), `expenses_mapping_confidence` decimal(5,2), `expenses_mapping_version` varchar(50), `change_count` bigint, `last_change_reason` varchar(16), `last_change_date` datetime);


CREATE TABLE `v_mapping_changes_summary` (`change_date` date, `change_reason` enum('Initial','LHDN_Update','User_Override','AI_Refinement','Admin_Correction','Merchant_Pattern'), `changed_by` enum('System','User','Admin','AI'), `change_count` bigint, `unique_expenses` bigint, `affected_users` bigint, `avg_confidence_after` decimal(9,6), `low_confidence_changes` decimal(23,0));


CREATE TABLE `v_monthly_mapping_stats` (`month` varchar(7), `expenses_mapping_status` enum('Pending','Estimated','Confirmed','Manual'), `receipt_count` bigint, `unique_users` bigint, `total_amount` decimal(37,2), `avg_confidence` decimal(9,6), `low_confidence_count` decimal(23,0), `high_confidence_count` decimal(23,0));


CREATE TABLE `v_monthly_revenue` (`month` varchar(7), `total_orders` bigint, `unique_buyers` bigint, `total_revenue` decimal(32,2), `total_credits_issued` decimal(33,0), `avg_order_value` decimal(14,6));


CREATE TABLE `v_package_performance` (`package_id` int, `package_code` varchar(50), `package_name` varchar(100), `price_amount` decimal(10,2), `credit_amount` int, `total_orders` bigint, `paid_orders` bigint, `total_revenue` decimal(32,2), `total_credits_sold` decimal(32,0));


CREATE TABLE `v_pending_mapping_notifications` (`notification_id` int, `account_id` int, `account_name` varchar(256), `account_email` varchar(100), `tax_year` year, `notification_type` enum('Mapping Available','Category Changed','Review Required','Preliminary Reminder','Expiry Warning'), `notification_title` varchar(256), `notification_message` text, `notification_priority` enum('Low','Normal','High'), `affected_expenses_count` int, `delivery_method` set('Push','Email','InApp'), `action_url` varchar(256), `created_date` datetime, `retry_count` int, `changed_count` longtext, `review_count` longtext, `fcm_tokens` text);


CREATE TABLE `v_tax_mapping_readiness` (`tax_year` year, `tax_mapping_status` enum('Draft','Preliminary','Official','Archived'), `category_count` bigint, `subcategory_count` bigint, `tax_published_date` date, `tax_based_on_year` year, `affected_users` bigint, `affected_expenses` bigint, `pending_remap_count` decimal(23,0), `total_expense_amount` decimal(37,2));


CREATE TABLE `v_user_expenses_mapping_status` (`account_id` int, `account_name` varchar(256), `expenses_year` year, `expenses_mapping_status` enum('Pending','Estimated','Confirmed','Manual'), `expense_count` bigint, `total_amount` decimal(37,2), `avg_confidence` decimal(9,6), `min_confidence` decimal(5,2), `max_confidence` decimal(5,2), `low_confidence_count` decimal(23,0), `expenses_mapping_version` varchar(50), `last_mapping_date` datetime);


CREATE TABLE `vw_tax_relief_full` (`tax_year` year, `tax_id` int, `tax_code` varchar(100), `tax_title` varchar(256), `tax_description` text, `category_max_claim` decimal(15,2), `tax_is_auto_claim` enum('No','Yes'), `tax_requires_receipt` enum('No','Yes'), `tax_claim_for` set('Self','Spouse','Child','Parent','Dependant'), `taxsub_id` int, `taxsub_code` varchar(100), `taxsub_title` varchar(256), `taxsub_description` text, `subcategory_max_claim` decimal(15,2));


CREATE TABLE `vw_tax_relief_full_2024` (`tax_id` int, `tax_code` varchar(100), `tax_title` varchar(256), `tax_description` text, `category_max_claim` decimal(15,2), `tax_is_auto_claim` enum('No','Yes'), `tax_requires_receipt` enum('No','Yes'), `tax_claim_for` set('Self','Spouse','Child','Parent','Dependant'), `taxsub_id` int, `taxsub_code` varchar(100), `taxsub_title` varchar(256), `taxsub_description` text, `subcategory_max_claim` decimal(15,2));


CREATE TABLE `vw_tax_relief_full_2025` (`tax_id` int, `tax_code` varchar(100), `tax_title` varchar(256), `tax_description` text, `category_max_claim` decimal(15,2), `tax_is_auto_claim` enum('No','Yes'), `tax_requires_receipt` enum('No','Yes'), `tax_claim_for` set('Self','Spouse','Child','Parent','Dependant'), `taxsub_id` int, `taxsub_code` varchar(100), `taxsub_title` varchar(256), `taxsub_description` text, `subcategory_max_claim` decimal(15,2));


CREATE TABLE `vw_user_claims_summary` (`account_id` int, `tax_year` year, `tax_code` varchar(100), `tax_title` varchar(256), `tax_max_claim` decimal(15,2), `total_claimed` decimal(37,2), `remaining_claimable` decimal(38,2));


CREATE TABLE `vw_user_expenses_by_category` (`account_id` int, `expense_year` int, `tax_code` varchar(100), `tax_title` varchar(256), `tax_max_claim` decimal(15,2), `total_expenses` decimal(37,2));


DROP TABLE IF EXISTS `v_account_credit_summary`;
CREATE ALGORITHM=UNDEFINED SQL SECURITY DEFINER VIEW `v_account_credit_summary` AS select `ac`.`account_id` AS `account_id`,`a`.`account_name` AS `account_name`,`a`.`account_email` AS `account_email`,`ac`.`credit_balance` AS `credit_balance`,`ac`.`lifetime_credits` AS `lifetime_credits`,`ac`.`lifetime_spent` AS `lifetime_spent`,`ac`.`free_receipts_used` AS `free_receipts_used`,`ac`.`free_receipts_limit` AS `free_receipts_limit`,(`ac`.`free_receipts_limit` - `ac`.`free_receipts_used`) AS `free_receipts_remaining`,(select count(0) from `credit_batch` `cb` where ((`cb`.`account_id` = `ac`.`account_id`) and (`cb`.`status` = 'Active') and (`cb`.`expiry_date` > now()))) AS `active_batches`,(select min(`cb`.`expiry_date`) from `credit_batch` `cb` where ((`cb`.`account_id` = `ac`.`account_id`) and (`cb`.`status` = 'Active') and (`cb`.`credits_remaining` > 0) and (`cb`.`expiry_date` > now()))) AS `nearest_expiry`,`ac`.`status` AS `status`,`ac`.`created_date` AS `created_date` from (`account_credit` `ac` join `account` `a` on((`ac`.`account_id` = `a`.`account_id`)));

DROP TABLE IF EXISTS `v_account_mapping_dashboard`;
CREATE ALGORITHM=UNDEFINED SQL SECURITY DEFINER VIEW `v_account_mapping_dashboard` AS select `a`.`account_id` AS `account_id`,`a`.`account_name` AS `account_name`,`a`.`account_email` AS `account_email`,count(distinct (case when (year(`ae`.`expenses_date`) = year(curdate())) then `ae`.`expenses_id` end)) AS `current_year_receipts`,sum((case when (year(`ae`.`expenses_date`) = year(curdate())) then `ae`.`expenses_total_amount` else 0 end)) AS `current_year_amount`,sum((case when (`ae`.`expenses_mapping_status` = 'Confirmed') then 1 else 0 end)) AS `confirmed_count`,sum((case when (`ae`.`expenses_mapping_status` = 'Estimated') then 1 else 0 end)) AS `estimated_count`,sum((case when (`ae`.`expenses_mapping_status` = 'Pending') then 1 else 0 end)) AS `pending_count`,sum((case when (`ae`.`expenses_mapping_status` = 'Manual') then 1 else 0 end)) AS `manual_count`,avg(`ae`.`expenses_mapping_confidence`) AS `avg_confidence`,sum((case when (`ae`.`expenses_mapping_confidence` < 70) then 1 else 0 end)) AS `needs_review_count`,max(`ae`.`expenses_date`) AS `last_receipt_date`,max(`ae`.`expenses_mapping_date`) AS `last_mapping_date` from (`account` `a` left join `account_expenses` `ae` on(((`a`.`account_id` = `ae`.`account_id`) and (`ae`.`status` = 'Active')))) where (`a`.`account_status` = 'Active') group by `a`.`account_id`,`a`.`account_name`,`a`.`account_email`;

DROP TABLE IF EXISTS `v_expenses_requiring_review`;
CREATE ALGORITHM=UNDEFINED SQL SECURITY DEFINER VIEW `v_expenses_requiring_review` AS select `ae`.`expenses_id` AS `expenses_id`,`ae`.`account_id` AS `account_id`,`a`.`account_name` AS `account_name`,`a`.`account_email` AS `account_email`,`ae`.`expenses_merchant_name` AS `expenses_merchant_name`,`ae`.`expenses_total_amount` AS `expenses_total_amount`,`ae`.`expenses_date` AS `expenses_date`,`ae`.`expenses_year` AS `expenses_year`,`tc`.`tax_code` AS `tax_code`,`tc`.`tax_title` AS `tax_title`,`ae`.`expenses_mapping_status` AS `expenses_mapping_status`,`ae`.`expenses_mapping_confidence` AS `expenses_mapping_confidence`,`ae`.`expenses_mapping_version` AS `expenses_mapping_version`,(select count(0) from `account_expenses_mapping_history` `h` where (`h`.`expenses_id` = `ae`.`expenses_id`)) AS `change_count`,(select `h`.`change_reason` from `account_expenses_mapping_history` `h` where (`h`.`expenses_id` = `ae`.`expenses_id`) order by `h`.`changed_date` desc limit 1) AS `last_change_reason`,(select `h`.`changed_date` from `account_expenses_mapping_history` `h` where (`h`.`expenses_id` = `ae`.`expenses_id`) order by `h`.`changed_date` desc limit 1) AS `last_change_date` from ((`account_expenses` `ae` join `account` `a` on((`ae`.`account_id` = `a`.`account_id`))) left join `tax_category` `tc` on((`ae`.`expenses_tax_category` = `tc`.`tax_id`))) where ((`ae`.`status` = 'Active') and ((`ae`.`expenses_mapping_confidence` < 70) or (`ae`.`expenses_mapping_status` = 'Pending') or exists(select 1 from `account_expenses_mapping_history` `h` where ((`h`.`expenses_id` = `ae`.`expenses_id`) and (`h`.`change_reason` = 'LHDN_Update') and (`h`.`changed_date` >= (now() - interval 7 day)))))) order by `ae`.`expenses_mapping_confidence`,`ae`.`expenses_date` desc;

DROP TABLE IF EXISTS `v_mapping_changes_summary`;
CREATE ALGORITHM=UNDEFINED SQL SECURITY DEFINER VIEW `v_mapping_changes_summary` AS select cast(`h`.`changed_date` as date) AS `change_date`,`h`.`change_reason` AS `change_reason`,`h`.`changed_by` AS `changed_by`,count(`h`.`history_id`) AS `change_count`,count(distinct `h`.`expenses_id`) AS `unique_expenses`,count(distinct `ae`.`account_id`) AS `affected_users`,avg(`h`.`confidence_after`) AS `avg_confidence_after`,sum((case when (`h`.`confidence_after` < 70) then 1 else 0 end)) AS `low_confidence_changes` from (`account_expenses_mapping_history` `h` join `account_expenses` `ae` on((`h`.`expenses_id` = `ae`.`expenses_id`))) group by cast(`h`.`changed_date` as date),`h`.`change_reason`,`h`.`changed_by` order by `change_date` desc,`h`.`change_reason`;

DROP TABLE IF EXISTS `v_monthly_mapping_stats`;
CREATE ALGORITHM=UNDEFINED SQL SECURITY DEFINER VIEW `v_monthly_mapping_stats` AS select date_format(`ae`.`expenses_date`,'%Y-%m') AS `month`,`ae`.`expenses_mapping_status` AS `expenses_mapping_status`,count(`ae`.`expenses_id`) AS `receipt_count`,count(distinct `ae`.`account_id`) AS `unique_users`,sum(`ae`.`expenses_total_amount`) AS `total_amount`,avg(`ae`.`expenses_mapping_confidence`) AS `avg_confidence`,sum((case when (`ae`.`expenses_mapping_confidence` < 70) then 1 else 0 end)) AS `low_confidence_count`,sum((case when (`ae`.`expenses_mapping_confidence` >= 90) then 1 else 0 end)) AS `high_confidence_count` from `account_expenses` `ae` where ((`ae`.`status` = 'Active') and (`ae`.`expenses_mapping_status` is not null)) group by date_format(`ae`.`expenses_date`,'%Y-%m'),`ae`.`expenses_mapping_status` order by `month` desc,`ae`.`expenses_mapping_status`;

DROP TABLE IF EXISTS `v_monthly_revenue`;
CREATE ALGORITHM=UNDEFINED SQL SECURITY DEFINER VIEW `v_monthly_revenue` AS select date_format(`po`.`paid_date`,'%Y-%m') AS `month`,count(distinct `po`.`order_id`) AS `total_orders`,count(distinct `po`.`account_id`) AS `unique_buyers`,sum(`po`.`order_amount`) AS `total_revenue`,sum((`po`.`credit_amount` + `po`.`bonus_credits`)) AS `total_credits_issued`,avg(`po`.`order_amount`) AS `avg_order_value` from `payment_order` `po` where (`po`.`payment_status` = 'Paid') group by date_format(`po`.`paid_date`,'%Y-%m') order by `month` desc;

DROP TABLE IF EXISTS `v_package_performance`;
CREATE ALGORITHM=UNDEFINED SQL SECURITY DEFINER VIEW `v_package_performance` AS select `cp`.`package_id` AS `package_id`,`cp`.`package_code` AS `package_code`,`cp`.`package_name` AS `package_name`,`cp`.`price_amount` AS `price_amount`,`cp`.`credit_amount` AS `credit_amount`,count(distinct `po`.`order_id`) AS `total_orders`,count(distinct (case when (`po`.`payment_status` = 'Paid') then `po`.`order_id` end)) AS `paid_orders`,coalesce(sum((case when (`po`.`payment_status` = 'Paid') then `po`.`order_amount` end)),0) AS `total_revenue`,coalesce(sum((case when (`po`.`payment_status` = 'Paid') then `po`.`credit_amount` end)),0) AS `total_credits_sold` from (`credit_package` `cp` left join `payment_order` `po` on((`cp`.`package_id` = `po`.`package_id`))) group by `cp`.`package_id`;

DROP TABLE IF EXISTS `v_pending_mapping_notifications`;
CREATE ALGORITHM=UNDEFINED SQL SECURITY DEFINER VIEW `v_pending_mapping_notifications` AS select `n`.`notification_id` AS `notification_id`,`n`.`account_id` AS `account_id`,`a`.`account_name` AS `account_name`,`a`.`account_email` AS `account_email`,`n`.`tax_year` AS `tax_year`,`n`.`notification_type` AS `notification_type`,`n`.`notification_title` AS `notification_title`,`n`.`notification_message` AS `notification_message`,`n`.`notification_priority` AS `notification_priority`,`n`.`affected_expenses_count` AS `affected_expenses_count`,`n`.`delivery_method` AS `delivery_method`,`n`.`action_url` AS `action_url`,`n`.`created_date` AS `created_date`,`n`.`retry_count` AS `retry_count`,json_unquote(json_extract(`n`.`notification_data`,'$.changed_expenses')) AS `changed_count`,json_unquote(json_extract(`n`.`notification_data`,'$.requires_review')) AS `review_count`,(select group_concat(`ad`.`device_fcm_token` separator ',') from `account_device` `ad` where ((`ad`.`account_id` = `n`.`account_id`) and (`ad`.`device_status` = 'Active') and (`ad`.`device_enable_fcm` = 'Yes'))) AS `fcm_tokens` from (`account_expenses_mapping_notification` `n` join `account` `a` on((`n`.`account_id` = `a`.`account_id`))) where ((`n`.`notification_status` = 'Pending') and (`n`.`retry_count` < 3)) order by `n`.`notification_priority` desc,`n`.`created_date`;

DROP TABLE IF EXISTS `v_tax_mapping_readiness`;
CREATE ALGORITHM=UNDEFINED SQL SECURITY DEFINER VIEW `v_tax_mapping_readiness` AS select `tc`.`tax_year` AS `tax_year`,`tc`.`tax_mapping_status` AS `tax_mapping_status`,count(distinct `tc`.`tax_id`) AS `category_count`,count(distinct `ts`.`taxsub_id`) AS `subcategory_count`,`tc`.`tax_published_date` AS `tax_published_date`,`tc`.`tax_based_on_year` AS `tax_based_on_year`,count(distinct `ae`.`account_id`) AS `affected_users`,count(`ae`.`expenses_id`) AS `affected_expenses`,sum((case when (`ae`.`expenses_mapping_status` = 'Estimated') then 1 else 0 end)) AS `pending_remap_count`,sum(`ae`.`expenses_total_amount`) AS `total_expense_amount` from ((`tax_category` `tc` left join `tax_subcategory` `ts` on(((`tc`.`tax_id` = `ts`.`tax_id`) and (`ts`.`status` = 'Active')))) left join `account_expenses` `ae` on(((`tc`.`tax_year` = `ae`.`expenses_year`) and (`ae`.`status` = 'Active')))) where (`tc`.`status` = 'Active') group by `tc`.`tax_year`,`tc`.`tax_mapping_status`,`tc`.`tax_published_date`,`tc`.`tax_based_on_year` order by `tc`.`tax_year` desc;

DROP TABLE IF EXISTS `v_user_expenses_mapping_status`;
CREATE ALGORITHM=UNDEFINED SQL SECURITY DEFINER VIEW `v_user_expenses_mapping_status` AS select `ae`.`account_id` AS `account_id`,`a`.`account_name` AS `account_name`,`ae`.`expenses_year` AS `expenses_year`,`ae`.`expenses_mapping_status` AS `expenses_mapping_status`,count(`ae`.`expenses_id`) AS `expense_count`,sum(`ae`.`expenses_total_amount`) AS `total_amount`,avg(`ae`.`expenses_mapping_confidence`) AS `avg_confidence`,min(`ae`.`expenses_mapping_confidence`) AS `min_confidence`,max(`ae`.`expenses_mapping_confidence`) AS `max_confidence`,sum((case when (`ae`.`expenses_mapping_confidence` < 70) then 1 else 0 end)) AS `low_confidence_count`,`ae`.`expenses_mapping_version` AS `expenses_mapping_version`,max(`ae`.`expenses_mapping_date`) AS `last_mapping_date` from (`account_expenses` `ae` join `account` `a` on((`ae`.`account_id` = `a`.`account_id`))) where (`ae`.`status` = 'Active') group by `ae`.`account_id`,`a`.`account_name`,`ae`.`expenses_year`,`ae`.`expenses_mapping_status`,`ae`.`expenses_mapping_version` order by `ae`.`account_id`,`ae`.`expenses_year` desc;

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

-- 2026-05-05 02:49:03 UTC