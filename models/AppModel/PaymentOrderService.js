/**
 * Payment Order Service
 * Manages payment orders for credit purchases
 */

const db = require('../../utils/sqlbuilder');
const crypto = require('crypto');
const ChipPaymentService = require('../../services/ChipPaymentService');
const CreditService = require('./CreditService');

// Generate UUID v4 using built-in crypto
function generateUUID() {
    return crypto.randomUUID();
}

/**
 * Create a new payment order
 * @param {Object} params - Order parameters
 * @returns {Object} - Order with payment URL
 */
async function createOrder(params) {
    const {
        accountId,
        packageId,
        customerEmail,
        customerName,
        customerPhone,
        successUrl,
        failureUrl,
        callbackUrl
    } = params;

    try {
        // Get package details
        const packageResult = await CreditService.getPackageById(packageId);
        if (!packageResult.success) {
            return { success: false, error: 'Package not found' };
        }

        const pkg = packageResult.data;
        const orderUuid = generateUUID();

        // Create order record
        const insertSql = `
            INSERT INTO payment_order (
                order_uuid, account_id, package_id,
                credit_amount, bonus_credits, order_amount,
                payment_gateway, order_status, payment_status,
                expired_date
            ) VALUES (?, ?, ?, ?, ?, ?, 'CHIP', 'Pending', 'Unpaid', DATE_ADD(NOW(), INTERVAL 24 HOUR))
        `;
        const insertResult = await db.raw(insertSql, [
            orderUuid, accountId, packageId,
            pkg.credit_amount, pkg.bonus_credits, pkg.price_amount
        ]);

        const orderId = insertResult.insertId;

        // Create CHIP purchase
        const chipResult = await ChipPaymentService.createPurchase({
            orderId: orderUuid,
            amount: parseFloat(pkg.price_amount),
            customerEmail,
            customerName,
            customerPhone,
            productName: `TaxLah ${pkg.package_name}`,
            productDescription: `${pkg.credit_amount} credits + ${pkg.bonus_credits} bonus`,
            successUrl: `${successUrl}?order=${orderUuid}`,
            failureUrl: `${failureUrl}?order=${orderUuid}`,
            callbackUrl,
            metadata: {
                order_id: orderUuid,
                account_id: accountId,
                package_id: packageId,
                package_code: pkg.package_code
            }
        });

        if (!chipResult.success) {
            // Update order as failed
            await db.raw(`UPDATE payment_order SET order_status = 'Failed' WHERE order_id = ?`, [orderId]);
            return { success: false, error: chipResult.error };
        }

        // Update order with CHIP details
        const updateSql = `
            UPDATE payment_order 
            SET gateway_bill_code = ?,
                gateway_reference = ?,
                payment_url = ?,
                order_status = 'Processing'
            WHERE order_id = ?
        `;
        await db.raw(updateSql, [
            chipResult.data.purchaseId,
            chipResult.data.purchaseId,
            chipResult.data.checkoutUrl,
            orderId
        ]);

        return {
            success: true,
            data: {
                order_id: orderId,
                order_uuid: orderUuid,
                package: {
                    name: pkg.package_name,
                    credits: pkg.credit_amount,
                    bonus: pkg.bonus_credits,
                    price: pkg.price_amount
                },
                payment_url: chipResult.data.checkoutUrl,
                expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
            }
        };
    } catch (error) {
        console.error('[PaymentOrderService] createOrder error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Get order by UUID
 * @param {string} orderUuid - Order UUID
 * @returns {Object} - Order details
 */
async function getOrderByUuid(orderUuid) {
    try {
        const sql = `
            SELECT 
                po.*,
                cp.package_name,
                cp.package_code,
                a.account_email,
                a.account_name
            FROM payment_order po
            JOIN credit_package cp ON po.package_id = cp.package_id
            JOIN account a ON po.account_id = a.account_id
            WHERE po.order_uuid = ?
        `;
        const result = await db.raw(sql, [orderUuid]);

        if (result.length === 0) {
            return { success: false, error: 'Order not found' };
        }

        return { success: true, data: result[0] };
    } catch (error) {
        console.error('[PaymentOrderService] getOrderByUuid error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Get order by ID
 * @param {number} orderId - Order ID
 * @returns {Object} - Order details
 */
async function getOrderById(orderId) {
    try {
        const sql = `
            SELECT 
                po.*,
                cp.package_name,
                cp.package_code,
                cp.validity_days,
                a.account_email,
                a.account_name
            FROM payment_order po
            JOIN credit_package cp ON po.package_id = cp.package_id
            JOIN account a ON po.account_id = a.account_id
            WHERE po.order_id = ?
        `;
        const result = await db.raw(sql, [orderId]);

        if (result.length === 0) {
            return { success: false, error: 'Order not found' };
        }

        return { success: true, data: result[0] };
    } catch (error) {
        console.error('[PaymentOrderService] getOrderById error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Get user's order history
 * @param {number} accountId - User account ID
 * @param {Object} options - Query options
 * @returns {Object} - Order history
 */
async function getUserOrders(accountId, options = {}) {
    const { limit = 20, offset = 0, status = null } = options;

    try {
        let sql = `
            SELECT 
                po.order_id,
                po.order_uuid,
                po.credit_amount,
                po.bonus_credits,
                po.order_amount,
                po.order_status,
                po.payment_status,
                po.created_date,
                po.paid_date,
                cp.package_name,
                cp.package_code
            FROM payment_order po
            JOIN credit_package cp ON po.package_id = cp.package_id
            WHERE po.account_id = ?
        `;
        const params = [accountId];

        if (status) {
            sql += ` AND po.payment_status = ?`;
            params.push(status);
        }

        sql += ` ORDER BY po.created_date DESC LIMIT ${limit} OFFSET ${offset}`;
        // params.push(limit, offset);

        const orders = await db.raw(sql, params);

        // Get total count
        let countSql = `SELECT COUNT(*) as total FROM payment_order WHERE account_id = ?`;
        const countParams = [accountId];
        if (status) {
            countSql += ` AND payment_status = ?`;
            countParams.push(status);
        }
        const countResult = await db.raw(countSql, countParams);

        return {
            success: true,
            data: {
                orders,
                pagination: {
                    total: countResult[0]?.total || 0,
                    limit,
                    offset
                }
            }
        };
    } catch (error) {
        console.error('[PaymentOrderService] getUserOrders error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Process successful payment
 * @param {string} orderUuid - Order UUID
 * @param {Object} paymentData - Payment data from gateway
 * @returns {Object} - Processing result
 */
async function processPaymentSuccess(orderUuid, paymentData) {
    try {
        // Get order
        const order = await getOrderByUuid(orderUuid);
        if (!order.success) return order;

        const orderData = order.data;

        // Check if already processed
        if (orderData.payment_status === 'Paid') {
            console.log('[PaymentOrderService] Order already processed:', orderUuid);
            return { success: true, message: 'Already processed' };
        }

        // Update order status
        const updateSql = `
            UPDATE payment_order 
            SET order_status = 'Completed',
                payment_status = 'Paid',
                paid_date = NOW(),
                gateway_response = ?
            WHERE order_uuid = ?
        `;
        await db.raw(updateSql, [JSON.stringify(paymentData), orderUuid]);

        // Get package for validity days
        const packageResult = await CreditService.getPackageById(orderData.package_id);
        const validityDays = packageResult.success ? packageResult.data.validity_days : 548;

        // Add credits to user account
        const creditResult = await CreditService.addCredits({
            accountId: orderData.account_id,
            packageId: orderData.package_id,
            credits: orderData.credit_amount,
            bonusCredits: orderData.bonus_credits,
            validityDays,
            sourceType: 'Purchase',
            sourceReference: orderUuid,
            paymentAmount: orderData.order_amount,
            paymentMethod: paymentData.paymentMethod || 'CHIP',
            paymentReference: paymentData.purchaseId
        });

        if (!creditResult.success) {
            console.error('[PaymentOrderService] Failed to add credits:', creditResult.error);
            // Still return success as payment was received - credits can be added manually
        }

        console.log('[PaymentOrderService] Payment processed successfully:', orderUuid);

        return {
            success: true,
            data: {
                order_uuid: orderUuid,
                credits_added: orderData.credit_amount + orderData.bonus_credits,
                new_balance: creditResult.data?.new_balance
            }
        };
    } catch (error) {
        console.error('[PaymentOrderService] processPaymentSuccess error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Process failed payment
 * @param {string} orderUuid - Order UUID
 * @param {Object} paymentData - Payment data from gateway
 * @returns {Object} - Processing result
 */
async function processPaymentFailure(orderUuid, paymentData) {
    try {
        const updateSql = `
            UPDATE payment_order 
            SET order_status = 'Failed',
                payment_status = 'Failed',
                gateway_response = ?
            WHERE order_uuid = ?
        `;
        await db.raw(updateSql, [JSON.stringify(paymentData), orderUuid]);

        console.log('[PaymentOrderService] Payment failed:', orderUuid);

        return { success: true, message: 'Order marked as failed' };
    } catch (error) {
        console.error('[PaymentOrderService] processPaymentFailure error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Cancel an order
 * @param {string} orderUuid - Order UUID
 * @param {number} accountId - User account ID (for verification)
 * @returns {Object} - Cancellation result
 */
async function cancelOrder(orderUuid, accountId) {
    try {
        const order = await getOrderByUuid(orderUuid);
        if (!order.success) return order;

        // Verify ownership
        if (order.data.account_id !== accountId) {
            return { success: false, error: 'Unauthorized' };
        }

        // Can only cancel pending orders
        if (order.data.payment_status !== 'Unpaid') {
            return { success: false, error: 'Cannot cancel this order' };
        }

        const updateSql = `
            UPDATE payment_order 
            SET order_status = 'Cancelled',
                payment_status = 'Failed'
            WHERE order_uuid = ?
        `;
        await db.raw(updateSql, [orderUuid]);

        return { success: true, message: 'Order cancelled' };
    } catch (error) {
        console.error('[PaymentOrderService] cancelOrder error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Check order status from gateway
 * @param {string} orderUuid - Order UUID
 * @returns {Object} - Order status
 */
async function checkOrderStatus(orderUuid) {
    try {
        const order = await getOrderByUuid(orderUuid);
        if (!order.success) return order;

        const orderData = order.data;

        // If already completed, return current status
        if (orderData.payment_status === 'Paid') {
            return {
                success: true,
                data: {
                    order_uuid: orderUuid,
                    status: 'Paid',
                    paid_date: orderData.paid_date
                }
            };
        }

        // Check with CHIP
        if (orderData.gateway_bill_code) {
            const chipResult = await ChipPaymentService.getPurchase(orderData.gateway_bill_code);
            
            if (chipResult.success && chipResult.data.isPaid) {
                // Process the payment
                await processPaymentSuccess(orderUuid, chipResult.data);
                return {
                    success: true,
                    data: {
                        order_uuid: orderUuid,
                        status: 'Paid',
                        paid_date: new Date().toISOString()
                    }
                };
            }
        }

        return {
            success: true,
            data: {
                order_uuid: orderUuid,
                status: orderData.payment_status
            }
        };
    } catch (error) {
        console.error('[PaymentOrderService] checkOrderStatus error:', error);
        return { success: false, error: error.message };
    }
}

module.exports = {
    createOrder,
    getOrderByUuid,
    getOrderById,
    getUserOrders,
    processPaymentSuccess,
    processPaymentFailure,
    cancelOrder,
    checkOrderStatus
};
