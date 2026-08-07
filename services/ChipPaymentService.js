/**
 * CHIP Payment Gateway Service
 * Integration with CHIP (chip-in.asia) for payment processing
 * 
 * API Reference: https://developer.chip-in.asia/api.html
 * Base URL: https://gate.chip-in.asia/api/v1/
 */

const axios     = require('axios');
const crypto    = require('crypto');
const fs        = require('fs');
const path      = require('path');

const ConfigService = require('./ConfigService');

/**
 * Configuration is resolved per call rather than at module load.
 *
 * That is what makes credential rotation take effect without a restart: the previous
 * version froze the API key into a module-level const and an axios instance built once at
 * require() time, so a key changed in the admin portal would not be used until the whole
 * process was restarted.
 *
 * ConfigService caches in memory and invalidates across every PM2 worker via Redis
 * pub/sub, so this is a map lookup on the hot path, not a database round trip.
 *
 * Every value falls back to the environment, and the webhook key falls back to the bundled
 * chip.pem, so the service keeps working before the database has been seeded.
 */
async function getConfig() {
    const c = await ConfigService.getGroup('chip');

    return {
        baseUrl: c.CHIP_API_URL || process.env.CHIP_API_URL || 'https://gate.chip-in.asia/api/v1',
        brandId: c.CHIP_BRAND_ID || process.env.CHIP_BRAND_ID || null,
        apiKey: c.CHIP_API_KEY || process.env.CHIP_API_KEY || null,
        webhookPublicKey: c.CHIP_WEBHOOK_PUBLIC_KEY || readBundledPem(),
        callbackUrl: c.CHIP_CALLBACK_URL || process.env.CHIP_CALLBACK_URL || null,
        currency: 'MYR',
        testMode: process.env.NODE_ENV !== 'production'
    };
}

/** Legacy fallback: the PEM committed alongside this service. */
function readBundledPem() {
    try {
        return fs.readFileSync(path.join(__dirname, 'chip.pem'), 'utf8');
    } catch (e) {
        return null;
    }
}

/** A client bound to the current configuration. Cheap next to the network call it makes. */
async function chipClient() {
    const cfg = await getConfig();

    if (!cfg.apiKey) console.error('[CHIP] No API key configured (checked system_config and env)');
    if (!cfg.brandId) console.error('[CHIP] No brand ID configured (checked system_config and env)');

    return axios.create({
        baseURL: cfg.baseUrl,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${cfg.apiKey}`
        },
        timeout: 30000
    });
}

/**
 * Create a purchase (payment) in CHIP
 * @param {Object} params - Purchase parameters
 * @returns {Object} - Purchase response with checkout_url
 */
async function createPurchase(params) {
    const {
        orderId,
        amount,
        customerEmail,
        customerName,
        customerPhone,
        productName,
        productDescription,
        successUrl,
        failureUrl,
        callbackUrl,
        metadata = {}
    } = params;

    try {
        const cfg = await getConfig();
        const chipApi = await chipClient();

        // Amount must be in smallest currency unit (sen for MYR)
        const amountInSen = Math.round(amount * 100);

        const purchaseData = {
            brand_id: cfg.brandId,
            client: {
                email: customerEmail,
                full_name: customerName,
                phone: customerPhone || undefined
            },
            reference: orderId,
            purchase: {
                currency: cfg.currency,
                products: [
                    {
                        name: productName,
                        price: amountInSen,
                        quantity: 1
                    }
                ],
                notes: productDescription || undefined,
                metadata: {
                    order_id: orderId,
                    ...metadata
                }
            },
            success_redirect: successUrl,
            failure_redirect: failureUrl,
            success_callback: callbackUrl,
            send_receipt: true,
            skip_capture: false
        };

        console.log('[CHIP] Creating purchase:', { orderId, amount, customerEmail });

        const response = await chipApi.post('/purchases/', purchaseData);

        console.log('[CHIP] Purchase created:', response.data.id);

        return {
            success: true,
            data: {
                purchaseId: response.data.id,
                checkoutUrl: response.data.checkout_url,
                status: response.data.status,
                amount: response.data.purchase.total / 100, // Convert back to MYR
                currency: response.data.purchase.currency,
                createdAt: response.data.created_on
            }
        };
    } catch (error) {
        console.error('[CHIP] Create purchase error:', error.response?.data || error.message);
        return {
            success: false,
            error: error.response?.data?.message || error.message
        };
    }
}

/**
 * Get purchase details by ID
 * @param {string} purchaseId - CHIP purchase ID
 * @returns {Object} - Purchase details
 */
async function getPurchase(purchaseId) {
    try {
        const chipApi = await chipClient();
        const response = await chipApi.get(`/purchases/${purchaseId}/`);

        return {
            success: true,
            data: {
                purchaseId: response.data.id,
                status: response.data.status,
                isPaid: response.data.status === 'paid',
                amount: response.data.purchase.total / 100,
                currency: response.data.purchase.currency,
                paidAt: response.data.payment?.date_s,
                paymentMethod: response.data.payment?.payment_type,
                metadata: response.data.purchase.metadata,
                clientEmail: response.data.client?.email,
                clientName: response.data.client?.full_name
            }
        };
    } catch (error) {
        console.error('[CHIP] Get purchase error:', error.response?.data || error.message);
        return {
            success: false,
            error: error.response?.data?.message || error.message
        };
    }
}

/**
 * Verify webhook signature
 * @param {string} payload - Raw request body
 * @param {string} signature - X-Signature header value
 * @returns {boolean} - Whether signature is valid
 */
async function verifyWebhookSignature(payload, signature) {
    const cfg = await getConfig();

    if (!cfg.webhookPublicKey) {
        console.warn('[CHIP] Webhook public key not configured');
        return false;
    }

    try {
        console.log('[CHIP] Verifying signature...');
        console.log('[CHIP] Payload length:', payload.length);
        console.log('[CHIP] Signature:', signature.substring(0, 50) + '...');
        console.log('[CHIP] Public key loaded:', cfg.webhookPublicKey.substring(0, 50) + '...');

        const publicKey = crypto.createPublicKey({
            key: cfg.webhookPublicKey,
            format: 'pem',
            type: 'spki'
        });

        const signatureBuffer   = Buffer.from(signature, 'base64');
        const payloadBuffer     = Buffer.from(payload, 'utf8');

        // Try with RSA-SHA256 (most common for webhook signatures)
        const isValid = crypto.verify(
            'RSA-SHA256',
            payloadBuffer,
            {
                key: publicKey,
                padding: crypto.constants.RSA_PKCS1_PADDING
            },
            signatureBuffer
        );

        console.log('[CHIP] Signature valid:', isValid);

        return isValid;
    } catch (error) {
        console.error('[CHIP] Signature verification error:', error.message);
        console.error('[CHIP] Full error:', error);
        return false;
    }
}

function fromCents(cents) {
    return (parseInt(cents) / 100).toFixed(2)
}

function ParseWebhookPayload(payload) {
    let result = { status: false, data: null }
    try {
        const data = typeof payload === 'string' ? JSON.parse(payload) : payload
        if (!data.id) throw new Error('Invalid webhook payload')

        // CHIP stores our metadata inside purchase.metadata, not at top-level data.metadata
        const purchaseMetadata = data.purchase?.metadata || data.metadata || {};

        result = {
            status: true,
            data: {
                event_type: data.event_type || null,
                purchase_id: data.id,
                payment_status: data.status,
                is_paid: data.status === 'paid',
                is_test: data.is_test || false,
                amount: data.purchase?.total ? fromCents(data.purchase.total) : null,
                currency: data.purchase?.currency || null,
                reference: data.reference || null,
                payment_method: data.transaction_data?.payment_method || null,
                paid_at: data.paid_on || null,
                client_email: data.client?.email || null,
                client_name: data.client?.full_name || null,
                metadata: purchaseMetadata,
                raw_payload: data
            }
        }
    } catch (e) {
        console.error('ChipService.ParseWebhookPayload error:', e.message)
        result = {
            status: false,
            message: e.message || errorResponse.message,
            data: null
        }
    }
    return result
}

/**
 * Process webhook callback from CHIP
 * @param {Object} body - Webhook payload
 * @param {string} signature - X-Signature header
 * @param {string} rawBody - Raw request body for signature verification
 * @returns {Object} - Processed webhook data
 */
async function processWebhook(body, signature, rawBody) {
    // Verify signature in production
    const cfg = await getConfig();

    if (!cfg.testMode && signature) {
        const isValid = verifyWebhookSignature(rawBody, signature);
        if (!isValid) {
            console.error('[CHIP] Invalid webhook signature');
            return { success: false, error: 'Invalid signature' };
        }
    }

    const eventType = body.event_type;
    const isTest = body.is_test;

    console.log('[CHIP] Webhook received:', { eventType, isTest, purchaseId: body.id });

    // Handle different event types
    switch (eventType) {
        case 'purchase.paid':
            return {
                success: true,
                eventType: 'paid',
                data: {
                    purchaseId: body.id,
                    status: 'paid',
                    amount: body.purchase?.total / 100,
                    currency: body.purchase?.currency,
                    metadata: body.purchase?.metadata,
                    orderId: body.purchase?.metadata?.order_id,
                    paidAt: body.payment?.date_s,
                    paymentMethod: body.payment?.payment_type,
                    isTest
                }
            };

        case 'purchase.payment_failure':
            return {
                success: true,
                eventType: 'failed',
                data: {
                    purchaseId: body.id,
                    status: 'failed',
                    metadata: body.purchase?.metadata,
                    orderId: body.purchase?.metadata?.order_id,
                    isTest
                }
            };

        case 'purchase.cancelled':
            return {
                success: true,
                eventType: 'cancelled',
                data: {
                    purchaseId: body.id,
                    status: 'cancelled',
                    metadata: body.purchase?.metadata,
                    orderId: body.purchase?.metadata?.order_id,
                    isTest
                }
            };

        case 'payment.refunded':
            return {
                success: true,
                eventType: 'refunded',
                data: {
                    purchaseId: body.id,
                    status: 'refunded',
                    metadata: body.purchase?.metadata,
                    orderId: body.purchase?.metadata?.order_id,
                    isTest
                }
            };

        default:
            console.log('[CHIP] Unhandled event type:', eventType);
            return {
                success: true,
                eventType: 'unknown',
                data: { purchaseId: body.id, rawEventType: eventType }
            };
    }
}

/**
 * Get available payment methods
 * @returns {Object} - Available payment methods
 */
async function getPaymentMethods() {
    try {
        const cfg = await getConfig();
        const chipApi = await chipClient();
        const response = await chipApi.get('/payment_methods/', {
            params: {
                brand_id: cfg.brandId,
                currency: cfg.currency
            }
        });

        return {
            success: true,
            data: {
                methods: response.data.available_payment_methods,
                names: response.data.names,
                logos: response.data.logos
            }
        };
    } catch (error) {
        console.error('[CHIP] Get payment methods error:', error.response?.data || error.message);
        return {
            success: false,
            error: error.response?.data?.message || error.message
        };
    }
}

/**
 * Refund a purchase (if supported)
 * @param {string} purchaseId - CHIP purchase ID
 * @param {number} amount - Amount to refund (optional, full refund if not specified)
 * @returns {Object} - Refund result
 */
async function refundPurchase(purchaseId, amount = null) {
    try {
        const refundData = {};
        if (amount) {
            refundData.amount = Math.round(amount * 100);
        }

        const chipApi = await chipClient();
        const response = await chipApi.post(`/purchases/${purchaseId}/refund/`, refundData);

        return {
            success: true,
            data: {
                purchaseId: response.data.id,
                status: response.data.status,
                refundedAmount: amount
            }
        };
    } catch (error) {
        console.error('[CHIP] Refund error:', error.response?.data || error.message);
        return {
            success: false,
            error: error.response?.data?.message || error.message
        };
    }
}

/**
 * Create subscription payment
 * Simplified wrapper for subscription-specific payments
 * @param {Object} params - Subscription payment parameters
 * @returns {Object} - Payment creation result
 */
async function createSubscriptionPayment(params) {
    const {
        payment_ref,
        account_id,
        amount,
        description,
        customer_email,
        customer_name
    } = params;

    try {
        const baseUrl = process.env.BASE_URL || 'https://taxlah.com';
        
        const purchaseParams = {
            orderId: payment_ref,
            amount: amount,
            customerEmail: customer_email,
            customerName: customer_name,
            productName: 'TaxLah Subscription',
            productDescription: description,
            // successUrl: `${baseUrl}/subscription/success?ref=${payment_ref}`,
            // failureUrl: `${baseUrl}/subscription/failed?ref=${payment_ref}`,
            successUrl: `${baseUrl}/subscription/${payment_ref}`,
            failureUrl: `${baseUrl}/subscription/${payment_ref}`,
            callbackUrl: `${baseUrl}/api/subscription/webhook`,
            metadata: {
                payment_ref: payment_ref,
                account_id: account_id,
                payment_type: 'subscription'
            }
        };

        const result = await createPurchase(purchaseParams);

        if (!result.success) {
            return result;
        }

        return {
            success: true,
            data: {
                payment_ref: payment_ref,
                payment_url: result.data.checkoutUrl,
                purchase_id: result.data.purchaseId,
                amount: result.data.amount,
                currency: result.data.currency
            }
        };
    } catch (error) {
        console.error('[CHIP] Create subscription payment error:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

module.exports = {
    createPurchase,
    getPurchase,
    verifyWebhookSignature,
    ParseWebhookPayload,
    processWebhook,
    getPaymentMethods,
    refundPurchase,
    createSubscriptionPayment,
    getConfig
};
