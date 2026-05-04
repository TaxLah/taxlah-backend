const express = require('express')
const router = express.Router()

const ChipPaymentService = require("../../services/ChipPaymentService")
const PaymentOrderService = require("../../models/AppModel/PaymentOrderService")

const AuthRouter            = require("../../controllers/AppController/Auth")
const AccountRouter         = require("../../controllers/AppController/Account")
const DeviceRouter          = require("../../controllers/AppController/Device")
const NotificationRouter    = require("../../controllers/AppController/Notification")
const PackageRouter         = require("../../controllers/AppController/Package")
const TaxCategory           = require("../../controllers/AppController/TaxCategory")
const ReceiptCategoryRouter = require("../../controllers/AppController/ReceiptCategory")
const ReceiptRouter         = require("../../controllers/AppController/Receipt")

// NEW Controllers
const ExpensesRouter        = require("../../controllers/AppController/Expenses");
const DependantRouter       = require("../../controllers/AppController/Dependant");
const TaxClaimRouter        = require("../../controllers/AppController/TaxClaim");
const ReportRouter          = require("../../controllers/AppController/Report")
const CreditRouter          = require("../../controllers/AppController/Credit")
const SubscriptionRouter    = require("../../controllers/AppController/Subscription")
const InquiryRouter         = require("../../controllers/AppController/Inquiry")
const BillRouter            = require("../../controllers/AppController/Bill")
const BillingTransactionRouter = require("../../controllers/AppController/BillingTransaction")
const { auth }              = require('../../configs/auth')

router.use("/app-version", require("../../controllers/AppController/AppVersion"))

router.use("/auth", AuthRouter)
router.use("/profile", AccountRouter)
router.use("/device", DeviceRouter)
router.use("/notification", NotificationRouter)
router.use("/package", PackageRouter)
router.use("/tax-category", TaxCategory)
router.use("/receipt-category", ReceiptCategoryRouter)
router.use("/receipt", ReceiptRouter)

// NEW routes
router.use("/expenses", auth(), ExpensesRouter);        // /api/expenses/*
router.use("/dependant", auth(), DependantRouter);      // /api/dependant/*
router.use("/tax", auth(), TaxClaimRouter);             // /api/tax/*
router.use("/report", auth(), ReportRouter);  
router.use("/subscription", SubscriptionRouter);        // /api/subscription/*  

router.use("/billing/bills",        BillRouter);               // /api/billing/bills/*
router.use("/billing/transactions", BillingTransactionRouter); // /api/billing/transactions/*

router.use("/public/inquiry", InquiryRouter);           // /api/public/inquiry/* (public, no auth)


// ============================================================================
// WEBHOOK (CHIP CALLBACK)
// ============================================================================

/**
 * POST /api/credit/webhook
 * CHIP payment webhook callback
 */
router.post("/credit/webhook", express.raw({ type: 'application/json' }), async (req, res) => {
    try {
        // const signature = req.headers['x-signature'];
        // const rawBody   = req.body.toString();
        // const body      = JSON.parse(rawBody)

        // console.log("Log Signature : ", signature)
        // console.log("Log Payload : ", rawBody)

        // console.log('[CreditController] Webhook received:', body.event_type);

        // // Process webhook
        // const result = ChipPaymentService.processWebhook(body, signature, rawBody);

        // if (!result.success) {
        //     console.error('[CreditController] Webhook processing failed:', result.error);
        //     return res.status(200).json({ received: true, error: result.error });
        // }
        const signature = req.headers['x-signature']
        const rawBody   = req.body.toString('utf8') // Make sure you have raw body parser

        console.log("Log Signature : ", signature)
        console.log("Log Raw Body : ", rawBody)

        // Step 1: Verify signature (optional but recommended for production)
        const verifyResult = ChipPaymentService.verifyWebhookSignature(rawBody, signature)
        if (!verifyResult) {
            console.error('Invalid webhook signature')
            return res.status(200).json({ success: true }) // Always return 200 to CHIP
        }

        // Step 2: Parse webhook payload
        const result = ChipPaymentService.ParseWebhookPayload(JSON.parse(req.body))

        if (!result.status) {
            console.error('Failed to parse webhook payload')
            return res.status(200).json({ success: true })
        }

        const webhookData = result.data

        console.log('=== CHIP WEBHOOK RECEIVED ===')
        console.log('Event Type:', webhookData.event_type)
        console.log('Purchase ID:', webhookData.purchase_id)
        console.log('Status:', webhookData.payment_status)
        console.log('Reference:', webhookData.reference)
        console.log('Is Paid:', webhookData.is_paid)
        console.log('Is Test:', webhookData.is_test)
        console.log('=============================')

        // Get order UUID from metadata
        const orderUuid = result?.data.purchase_id;

        if (orderUuid) {
            switch (result.data) {
                case 'paid':
                    await PaymentOrderService.processPaymentSuccess(orderUuid, result.data);
                    break;
                case 'failed':
                case 'cancelled':
                    await PaymentOrderService.processPaymentFailure(orderUuid, result.data);
                    break;
            }
        }

        return res.status(200).json({ received: true, event: result.eventType });
    } catch (error) {
        console.error('[CreditController] Webhook error:', error);
        // Always return 200 to acknowledge receipt
        return res.status(200).json({ received: true, error: error.message });
    }
});

router.use("/credit", auth(), CreditRouter); 

// ============================================================================
// BILLING WEBHOOK (CHIP CALLBACK for bill payments)
// POST /api/billing/webhook
// Called by CHIP after the user pays (or fails to pay) a bill via the
// /api/billing/bills/:id/pay checkout URL.
// Must be registered BEFORE body-json middleware (uses raw body for sig check).
// ============================================================================
router.post("/billing/webhook", express.raw({ type: 'application/json' }), async (req, res) => {
    try {
        const signature = req.headers['x-signature'];
        const rawBody   = req.body.toString('utf8');

        console.log('[BillingWebhook] Received');

        const verifyResult = ChipPaymentService.verifyWebhookSignature(rawBody, signature);
        if (!verifyResult) {
            console.error('[BillingWebhook] Invalid signature');
            return res.status(200).json({ success: true });
        }

        const webhookData = JSON.parse(rawBody);
        const parseResult = ChipPaymentService.ParseWebhookPayload(webhookData);

        if (!parseResult.status) {
            console.error('[BillingWebhook] Failed to parse payload');
            return res.status(200).json({ success: true });
        }

        const data = parseResult.data;
        console.log('[BillingWebhook] purchase_id:', data.purchase_id, '| status:', data.payment_status, '| is_paid:', data.is_paid);

        const {
            BillingGetBillByChipPurchaseId,
            BillingMarkBillPaid,
            BillingUpdateBillStatus,
            BillingCreateTransaction,
        } = require('../models/AppModel/BillingService');

        const billResult = await BillingGetBillByChipPurchaseId(data.purchase_id);
        if (!billResult.success || !billResult.data) {
            console.error('[BillingWebhook] No bill found for purchase_id:', data.purchase_id);
            return res.status(200).json({ success: true });
        }

        const bill    = billResult.data;
        const now     = new Date();
        const txnBase = {
            billId:            bill.bill_id,
            accountId:         bill.account_id,
            subscriptionId:    bill.subscription_id || null,
            billYear:          bill.billing_year,
            billMonth:         bill.billing_month,
            paymentGateway:    'Chip',
            gatewayPurchaseId: data.purchase_id,
            gatewayRef:        data.reference    || null,
            gatewayEventType:  data.event_type   || null,
            gatewayStatusRaw:  data.payment_status || null,
            paymentMethod:     data.payment_method || null,
            bankName:          data.bank_name     || null,
            amount:            parseFloat(bill.total_amount),
            currency:          bill.currency || 'MYR',
            clientEmail:       data.client_email  || null,
            clientName:        data.client_name   || null,
            checkoutUrl:       bill.checkout_url  || null,
            chipCallback:      webhookData,
            isTest:            data.is_test ? 1 : 0,
        };

        // Route by event_type — CHIP's status field is unreliable.
        // e.g. purchase.payment_failure arrives with status: 'created', not 'failed'.
        const chipEventType     = data.event_type || '';
        const isBillSuccess     = chipEventType === 'purchase.paid' || (data.is_paid && data.payment_status === 'paid');
        const isBillFailure     = chipEventType === 'purchase.payment_failure' || chipEventType === 'purchase.cancelled' || chipEventType === 'purchase.overdue' || ['failed', 'cancelled'].includes(data.payment_status);

        if (isBillSuccess) {
            const paidAt = data.paid_at ? new Date(data.paid_at) : now;
            await BillingMarkBillPaid(bill.bill_id, paidAt).catch(e =>
                console.error('[BillingWebhook] BillingMarkBillPaid failed:', e)
            );
            await BillingCreateTransaction({ ...txnBase, status: 'Success', paidAt }).catch(e =>
                console.error('[BillingWebhook] BillingCreateTransaction failed:', e)
            );
            console.log('[BillingWebhook] Bill', bill.bill_no, 'marked Paid');
        } else if (isBillFailure) {
            await BillingUpdateBillStatus(bill.bill_id, 'Overdue').catch(e =>
                console.error('[BillingWebhook] BillingUpdateBillStatus failed:', e)
            );
            await BillingCreateTransaction({
                ...txnBase,
                status:        'Failed',
                failedAt:      now,
                failureReason: data.failure_reason || chipEventType || 'Payment failed',
            }).catch(e => console.error('[BillingWebhook] BillingCreateTransaction failed:', e));
            console.log('[BillingWebhook] Bill', bill.bill_no, 'marked Overdue');
        } else {
            console.log('[BillingWebhook] Unhandled event type (ignoring):', chipEventType);
        }

        return res.status(200).json({ success: true });
    } catch (error) {
        console.error('[BillingWebhook] Error:', error);
        return res.status(200).json({ success: true }); // Always 200 to stop CHIP retries
    }
});

module.exports = router