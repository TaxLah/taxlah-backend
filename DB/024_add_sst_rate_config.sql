-- ============================================================
-- Migration 024: SST rate becomes configuration, not six hardcoded copies
--
-- The Malaysian service tax rate is currently written as a literal in six places:
--
--   controllers/AppController/Subscription/index.js:340   (new subscription)
--   controllers/AppController/Subscription/index.js:653   (second payment path)
--   models/AppModel/SubscriptionService.js:1078           (renewal)
--   models/AppModel/SubscriptionService.js:1191           (auto-renewal)
--   models/AppModel/BillingService.js:18                  (bills)
--   models/AppModel/SubscriptionPaymentService.js:164     (as `amount * 1.06` inside SQL)
--
-- Six copies of a number the government changes is a standing liability: the rate rose
-- from 6% to 8% on 1 March 2024 and every one of these still says 6%. Worse, the app
-- shows the ex-tax price while CHIP is charged the inclusive one, so a customer taps
-- "Pay RM14.90" and is billed RM15.79.
--
-- This introduces the single value all of them will read, and which the app fetches so
-- the confirmation screen can show the same breakdown the customer is actually charged.
--
-- Seeded at the rate the code applies today, so applying this migration on its own
-- changes nothing. Adjusting the rate is a separate, deliberate decision.
--
-- Additive only: one new configuration row.
-- ============================================================

USE taxlah_development;

INSERT INTO `system_config`
    (`config_group`, `config_key`, `config_value`, `is_secret`, `value_type`, `label`, `description`, `is_required`, `sort_order`, `status`)
VALUES
    ('app', 'SST_RATE', '0.06', 0, 'number',
     'SST rate',
     'Malaysian service tax applied on top of subscription and bill prices, as a decimal. 0.06 is 6 percent, 0.08 is 8 percent. Changing this changes what customers are charged on their next payment.',
     1, 5, 'Active')

-- Never overwrite a rate an admin has already set.
ON DUPLICATE KEY UPDATE `config_key` = `config_key`;
