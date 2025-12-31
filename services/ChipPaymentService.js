/**
 * CHIP Payment Gateway Service
 * Integration with CHIP (chip-in.asia) for payment processing
 * 
 * API Reference: https://developer.chip-in.asia/api.html
 * Base URL: https://gate.chip-in.asia/api/v1/
 */

const axios = require('axios');
const crypto = require('crypto');

let pubkey = `-----BEGIN PUBLIC KEY-----
MIIBojANBgkqhkiG9w0BAQEFAAOCAY8AMIIBigKCAYEAlnGubCR80vQO3yVv3hOZ
ZMDSeZ/sKom1sc6uspBSGUjOtIg8QArNQxwPwkOQMx0uL1YCzRyMki7oc09T7D8P
/k3Y1mB9H2KcrPUuBUIKteBRnx3trjc54vavVaI+JE7NfYF0RBftfjGGzQ7/o4jx
6aqwZxThFkAe6DSZ+5fXxUhJy9KuvFUub3MPWty4UlCJJRwVYSaZVPesXZS3CUDJ
YYZYJswrLb8NshyxXsG83A14uifzmb/3mkirbC+RMr6APL1/iMmR9g/wEDGmKsNE
EfblqWBjh/BKesq2crY3Y/K4IaKKWtNY40ftbCimgO+j1dIoHCmwg0qTcG4kq8jN
DawLiTO3VdNKEqBRnc/TlsHfU0qgOQfJYxVpvX6BsfRs4O0D0N3LIk6l9aOQcorB
Wqey+6UvcHpEmCbYat15TfIFKtOWW1wXTwtQWaWOy6+V8/e8toXztCOP4ZAO9rqP
RMi5e+EW/Q4Vv6iiOHqBODSNKEvqIajQ4l6SwpIFmEidAgMBAAE=
-----END PUBLIC KEY-----
`

// CHIP API Configuration
const CHIP_CONFIG = {
    baseUrl: process.env.CHIP_API_URL || 'https://gate.chip-in.asia/api/v1',
    brandId: process.env.CHIP_BRAND_ID,
    apiKey: process.env.CHIP_API_KEY,
    webhookPublicKey: pubkey,
    currency: 'MYR',
    testMode: process.env.NODE_ENV !== 'production'
};

// Create axios instance for CHIP API
const chipApi = axios.create({
    baseURL: CHIP_CONFIG.baseUrl,
    headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${CHIP_CONFIG.apiKey}`
    },
    timeout: 30000
});

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
        // Amount must be in smallest currency unit (sen for MYR)
        const amountInSen = Math.round(amount * 100);

        const purchaseData = {
            brand_id: CHIP_CONFIG.brandId,
            client: {
                email: customerEmail,
                full_name: customerName,
                phone: customerPhone || undefined
            },
            purchase: {
                currency: CHIP_CONFIG.currency,
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
function verifyWebhookSignature(payload, signature) {
    if (!CHIP_CONFIG.webhookPublicKey) {
        console.warn('[CHIP] Webhook public key not configured');
        return false;
    }

    try {
        const publicKey = crypto.createPublicKey({
            key: CHIP_CONFIG.webhookPublicKey,
            format: 'pem'
        });

        const signatureBuffer = Buffer.from(signature, 'base64');
        const payloadBuffer = Buffer.from(payload, 'utf8');

        const isValid = crypto.verify(
            'sha256',
            payloadBuffer,
            publicKey,
            signatureBuffer
        );

        console.log("Is Valid : ", isValid)

        return isValid;
    } catch (error) {
        console.error('[CHIP] Signature verification error:', error.message);
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
                metadata: data.metadata || {},
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
function processWebhook(body, signature, rawBody) {
    // Verify signature in production
    if (!CHIP_CONFIG.testMode && signature) {
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
        const response = await chipApi.get('/payment_methods/', {
            params: {
                brand_id: CHIP_CONFIG.brandId,
                currency: CHIP_CONFIG.currency
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

module.exports = {
    createPurchase,
    getPurchase,
    verifyWebhookSignature,
    ParseWebhookPayload,
    processWebhook,
    getPaymentMethods,
    refundPurchase,
    CHIP_CONFIG
};
