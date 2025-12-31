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
const DependantRouter       = require("../../controllers/AppController/Dependant");
const TaxClaimRouter        = require("../../controllers/AppController/TaxClaim");
const ReportRouter          = require("../../controllers/AppController/Report")
const CreditRouter          = require("../../controllers/AppController/Credit")
const { auth } = require('../../configs/auth')

router.use("/auth", AuthRouter)
router.use("/profile", AccountRouter)
router.use("/device", DeviceRouter)
router.use("/notification", NotificationRouter)
router.use("/package", PackageRouter)
router.use("/tax-category", TaxCategory)
router.use("/receipt-category", ReceiptCategoryRouter)
router.use("/receipt", ReceiptRouter)

// NEW routes
router.use("/dependant", auth(), DependantRouter);      // /api/dependant/*
router.use("/tax", auth(), TaxClaimRouter);             // /api/tax/*
router.use("/report", auth(), ReportRouter);  


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
        if (!verifyResult.status || !verifyResult.data.is_valid) {
            console.error('Invalid webhook signature')
            return res.status(200).json({ success: true }) // Always return 200 to CHIP
        }

        // Step 2: Parse webhook payload
        const result = ChipPaymentService.ParseWebhookPayload(JSON.parse(req.body))

        if (!result.status) {
            console.error('Failed to parse webhook payload')
            return res.status(200).json({ success: true })
        }

        // Get order UUID from metadata
        const orderUuid = result.data?.orderId;

        if (orderUuid) {
            switch (result.eventType) {
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

module.exports = router