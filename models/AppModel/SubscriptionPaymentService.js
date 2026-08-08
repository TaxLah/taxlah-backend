/**
 * Subscription Payment Service
 * Manages subscription payments and payment gateway integration
 */

const queues                        = require('../../queue');
const db                            = require('../../utils/sqlbuilder');
const crypto                        = require('crypto');
const { UserNotificationCreate }    = require('./Notification');
const CreditService                 = require('./CreditService');
const NotificationService           = require('../../services/NotificationService');
const {
    BillingCreateBill,
    BillingMarkBillPaid,
    BillingUpdateBillStatus,
    BillingCreateTransaction,
    BillingUpdateTransactionStatus,
    BillingGetBillByChipPurchaseId,
}                                   = require('./BillingService');
const { getSstRate }                = require('../../services/TaxRateService');

/**
 * Create subscription payment record
 * @param {number} subscriptionId - Subscription ID (can be null for initial payment before subscription creation)
 * @param {number} accountId - Account ID
 * @param {number} amount - Payment amount
 * @param {Date} periodStart - Period start date
 * @param {Date} periodEnd - Period end date
 * @param {string} gateway - Payment gateway
 * @returns {Object} - Payment record
 */
async function createPaymentRecord(
    subscriptionId, accountId, amount, periodStart, periodEnd, gateway = 'Chip',
    { billType = 'Subscription', billDescription = null, dueInDays = 3, chipPurchaseId = null, checkoutUrl = null, subPackageId = null } = {}
) {
    try {
        const paymentRef = `SUBPAY-${Date.now()}-${crypto.randomUUID().substring(0, 8).toUpperCase()}`;

        const sql = `
            INSERT INTO subscription_payment (
                subscription_id,
                account_id,
                payment_ref,
                amount,
                currency,
                period_start,
                period_end,
                payment_gateway,
                payment_status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        await db.raw(sql, [
            subscriptionId || null,
            accountId,
            paymentRef,
            amount,
            'MYR',
            periodStart,
            periodEnd,
            gateway,
            'Pending'
        ]);

        // Get created payment
        const getPaymentSql = `
            SELECT payment_id, payment_ref
            FROM subscription_payment
            WHERE payment_ref = ?
        `;
        const [payment] = await db.raw(getPaymentSql, [paymentRef]);

        // ── Create bill record ──────────────────────────────────────
        try {
            const periodDate  = periodStart ? new Date(periodStart) : new Date();
            const billingYear = periodDate.getFullYear();
            const billingMonth = periodDate.getMonth() + 1;

            const dueDate = new Date();
            dueDate.setDate(dueDate.getDate() + dueInDays);

            const billResult = await BillingCreateBill({
                accountId,
                subscriptionId:     subscriptionId || null,
                subPackageId:       subPackageId   || null,
                billType,
                billDescription:    billDescription || `${gateway} Subscription`,
                billingYear,
                billingMonth,
                billingPeriodStart: periodStart || null,
                billingPeriodEnd:   periodEnd   || null,
                subtotal:           parseFloat(amount),
                dueDate,
                chipPurchaseId,
                checkoutUrl,
            });

            if (billResult.success) {
                payment.bill_id  = billResult.data.bill_id;
                payment.bill_no  = billResult.data.bill_no;
            }
        } catch (billError) {
            // Non-fatal — log and continue so subscription flow is not blocked
            console.error('[SubscriptionPaymentService] createPaymentRecord bill creation failed:', billError);
        }

        return {
            success: true,
            data: payment
        };
    } catch (error) {
        console.error('[SubscriptionPaymentService] createPaymentRecord error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Get payment by reference
 * @param {string} paymentRef - Payment reference
 * @returns {Object} - Payment details
 */
async function getPaymentByRef(paymentRef) {
    try {
        const sql = `
            SELECT 
                sp.*,
                s.subscription_ref,
                s.billing_period,
                pkg.package_name,
                pkg.package_code
            FROM subscription_payment sp
            LEFT JOIN account_subscription s ON sp.subscription_id = s.subscription_id
            LEFT JOIN subscription_package pkg ON s.sub_package_id = pkg.sub_package_id
            WHERE sp.payment_ref = ?
        `;
        
        const result = await db.raw(sql, [paymentRef]);
        
        if (result.length === 0) {
            return { success: false, error: 'Payment not found' };
        }

        return {
            success: true,
            data: result[0]
        };
    } catch (error) {
        console.error('[SubscriptionPaymentService] getPaymentByRef error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Sortable columns, as an explicit map from the name the client sends to the SQL it may
 * order by.
 *
 * A whitelist rather than validation-by-regex: anything not named here cannot reach the
 * query at all, so no input string is ever interpolated into ORDER BY. `amount` orders
 * by the select alias, which is the bill total — the figure the row actually displays,
 * not the tax-exclusive price behind it.
 */
const SORTABLE_PAYMENT_COLUMNS = {
    date:    'sp.created_date',
    amount:  'amount',
    status:  'sp.payment_status',
    package: 'pkg.package_name',
};

/** Statuses the client may filter on. Anything else is dropped rather than queried. */
const FILTERABLE_PAYMENT_STATUSES = ['Paid', 'Pending', 'Failed', 'Cancelled', 'Refunded'];

/**
 * Builds the shared WHERE clause for a payment history query.
 *
 * Extracted so the page query, the count and the summary cannot disagree about what
 * "matching" means — a summary that totals a different set from the rows beneath it is
 * worse than no summary.
 */
function buildPaymentFilters(accountId, filters = {}) {
    const where  = ['sp.account_id = ?'];
    const params = [accountId];

    const search = String(filters.search || '').trim();
    if (search) {
        // Escape the LIKE wildcards: a customer pasting a reference containing % should
        // search for that character, not match everything.
        const term = `%${search.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
        where.push(`(
            sp.payment_ref LIKE ? ESCAPE '\\\\'
            OR b.invoice_no LIKE ? ESCAPE '\\\\'
            OR b.bill_no LIKE ? ESCAPE '\\\\'
            OR pkg.package_name LIKE ? ESCAPE '\\\\'
            OR s.subscription_ref LIKE ? ESCAPE '\\\\'
        )`);
        params.push(term, term, term, term, term);
    }

    const statuses = (Array.isArray(filters.statuses) ? filters.statuses : [])
        .filter((s) => FILTERABLE_PAYMENT_STATUSES.includes(s));
    if (statuses.length) {
        where.push(`sp.payment_status IN (${statuses.map(() => '?').join(', ')})`);
        params.push(...statuses);
    }

    // Date bounds are compared against the column directly rather than wrapped in
    // DATE()/YEAR(), so an index on created_date stays usable as this table grows.
    if (filters.dateFrom) {
        where.push('sp.created_date >= ?');
        params.push(`${filters.dateFrom} 00:00:00`);
    }
    if (filters.dateTo) {
        where.push('sp.created_date <= ?');
        params.push(`${filters.dateTo} 23:59:59`);
    }

    return { clause: where.join(' AND '), params };
}

/**
 * Get a page of the user's payment history, with search, status and date filtering,
 * sorting, and a summary of everything that matched.
 *
 * The listed amount is the bill total — what the card was actually charged. It used to
 * be `sp.amount * 1.06`, which hardcoded the tax rate in a third place and, worse,
 * disagreed with the receipt for any payment whose bill was not exactly 6%. Payments
 * that predate billing records have no bill row, so those fall back to the configured
 * rate rather than a literal.
 *
 * The summary is deliberately computed over the whole filtered set, not the page. A
 * total that only counts the ten rows in front of you answers a question nobody asked.
 *
 * @param {number} accountId
 * @param {Object} options - { limit, page, search, statuses, dateFrom, dateTo, sortBy, sortOrder }
 * @returns {Object} - { data, total, totalPages, page, limit, summary }
 */
async function getPaymentHistory(accountId, options = {}) {
    try {
        // LIMIT/OFFSET cannot be bound parameters, so they are coerced before interpolation.
        const safeLimit = Math.min(Math.max(parseInt(options.limit, 10) || 10, 1), 100);
        const safePage  = Math.max(parseInt(options.page, 10) || 1, 1);
        const offset    = (safePage - 1) * safeLimit;

        const orderColumn = SORTABLE_PAYMENT_COLUMNS[options.sortBy] || SORTABLE_PAYMENT_COLUMNS.date;
        const orderDir    = String(options.sortOrder).toLowerCase() === 'asc' ? 'ASC' : 'DESC';

        const sstRate = await getSstRate();
        const { clause, params } = buildPaymentFilters(accountId, options);

        const joins = `
            FROM subscription_payment sp
            LEFT JOIN account_subscription s ON sp.subscription_id = s.subscription_id
            LEFT JOIN subscription_package pkg ON s.sub_package_id = pkg.sub_package_id
            LEFT JOIN bill b ON b.chip_purchase_id = sp.gateway_transaction_id
                            AND b.account_id = sp.account_id
            WHERE ${clause}
        `;

        const sql = `
            SELECT
                sp.payment_id,
                sp.payment_ref,
                COALESCE(b.total_amount, sp.amount * (1 + ?), 0) as amount,
                b.subtotal,
                b.sst_amount,
                b.invoice_no,
                sp.currency,
                sp.period_start,
                sp.period_end,
                sp.payment_gateway,
                sp.payment_status,
                sp.created_date,
                sp.paid_date,
                s.subscription_ref,
                s.billing_period,
                pkg.package_name
            ${joins}
            ORDER BY ${orderColumn} ${orderDir}, sp.payment_id DESC
            LIMIT ${safeLimit} OFFSET ${offset}
        `;

        const payments = await db.raw(sql, [sstRate, ...params]);

        // One pass for the count and the money, over the same filtered set.
        const summarySql = `
            SELECT
                COUNT(*) AS total,
                SUM(CASE WHEN sp.payment_status = 'Paid' THEN 1 ELSE 0 END) AS paid_count,
                SUM(CASE WHEN sp.payment_status = 'Pending' THEN 1 ELSE 0 END) AS pending_count,
                SUM(CASE WHEN sp.payment_status IN ('Failed','Cancelled') THEN 1 ELSE 0 END) AS failed_count,
                COALESCE(SUM(
                    CASE WHEN sp.payment_status = 'Paid'
                         THEN COALESCE(b.total_amount, sp.amount * (1 + ?), 0)
                         ELSE 0 END
                ), 0) AS paid_amount,
                MIN(sp.created_date) AS first_payment_date
            ${joins}
        `;

        const summaryRows = await db.raw(summarySql, [sstRate, ...params]);
        const row = summaryRows?.[0] || {};
        const total = Number(row.total) || 0;

        return {
            success: true,
            data: payments,
            total,
            totalPages: Math.max(Math.ceil(total / safeLimit), 1),
            page: safePage,
            limit: safeLimit,
            summary: {
                total,
                paid_count: Number(row.paid_count) || 0,
                pending_count: Number(row.pending_count) || 0,
                failed_count: Number(row.failed_count) || 0,
                paid_amount: Number(row.paid_amount) || 0,
                currency: payments?.[0]?.currency || 'MYR',
                first_payment_date: row.first_payment_date || null,
            },
        };
    } catch (error) {
        console.error('[SubscriptionPaymentService] getPaymentHistory error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Update payment status
 * @param {string} paymentRef - Payment reference
 * @param {string} status - New status
 * @param {string} gatewayTransactionId - Gateway transaction ID
 * @param {Object} gatewayResponse - Gateway response
 * @returns {Object} - Update result
 */
async function updatePaymentStatus(paymentRef, status, gatewayTransactionId = null, gatewayResponse = null) {
    try {
        const now = new Date();
        let updateFields = [];
        let updateValues = [];

        updateFields.push('payment_status = ?');
        updateValues.push(status);

        if (gatewayTransactionId) {
            updateFields.push('gateway_transaction_id = ?');
            updateValues.push(gatewayTransactionId);
        }

        if (gatewayResponse) {
            updateFields.push('gateway_response = ?');
            updateValues.push(JSON.stringify(gatewayResponse));
        }

        if (status === 'Paid') {
            updateFields.push('paid_date = ?');
            updateValues.push(now);
        } else if (status === 'Failed') {
            updateFields.push('failed_date = ?');
            updateValues.push(now);
        } else if (status === 'Refunded') {
            updateFields.push('refunded_date = ?');
            updateValues.push(now);
        }

        updateValues.push(paymentRef);

        const sql = `
            UPDATE subscription_payment
            SET ${updateFields.join(', ')}
            WHERE payment_ref = ?
        `;

        await db.raw(sql, updateValues);

        return {
            success: true,
            message: `Payment status updated to ${status}`
        };
    } catch (error) {
        console.error('[SubscriptionPaymentService] updatePaymentStatus error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Process successful subscription payment
 * Creates subscription if it doesn't exist, or activates existing one
 * @param {string} paymentRef - Payment reference
 * @param {string} gatewayTransactionId - Gateway transaction ID
 * @param {Object} gatewayResponse - Gateway response
 * @returns {Object} - Processing result
 */
async function processSuccessfulPayment(paymentRef, gatewayTransactionId, gatewayResponse = null) {
    try {
        // Get payment details
        const paymentResult = await getPaymentByRef(paymentRef);
        if (!paymentResult.success) {
            return paymentResult;
        }

        const payment = paymentResult.data;

        // Update payment status
        await updatePaymentStatus(paymentRef, 'Paid', gatewayTransactionId, gatewayResponse);

        // ── Mark bill paid + record billing transaction ─────────────
        try {
            const chipData = gatewayResponse || {};
            const paidAt   = new Date();

            // Locate the bill linked to this CHIP purchase
            let billId = null;
            if (chipData.purchase_id || gatewayTransactionId) {
                const billLookup = await BillingGetBillByChipPurchaseId(
                    chipData.purchase_id || gatewayTransactionId
                );
                if (billLookup.success) {
                    billId = billLookup.data.bill_id;
                    await BillingMarkBillPaid(billId, paidAt);
                }
            }

            if (billId) {
                const periodDate = payment.period_start ? new Date(payment.period_start) : new Date();
                await BillingCreateTransaction({
                    billId,
                    accountId:         payment.account_id,
                    subscriptionId:    payment.subscription_id || null,
                    billYear:          periodDate.getFullYear(),
                    billMonth:         periodDate.getMonth() + 1,
                    paymentGateway:    payment.payment_gateway || 'Chip',
                    gatewayPurchaseId: chipData.purchase_id    || gatewayTransactionId || null,
                    gatewayRef:        chipData.reference      || paymentRef,
                    gatewayEventType:  chipData.event_type     || 'purchase.paid',
                    gatewayStatusRaw:  chipData.payment_status || 'paid',
                    paymentMethod:     chipData.payment_method || null,
                    amount:            parseFloat(payment.amount),
                    currency:          payment.currency || 'MYR',
                    clientEmail:       chipData.client_email   || null,
                    clientName:        chipData.client_name    || null,
                    chipCallback:      gatewayResponse         || null,
                    status:            'Success',
                    paidAt,
                    isTest:            chipData.is_test        ? 1 : 0,
                });
            }
        } catch (billingError) {
            // Non-fatal — log and continue so subscription activation is not blocked
            console.error('[SubscriptionPaymentService] processSuccessfulPayment billing record failed:', billingError);
        }

        const SubscriptionService = require('./SubscriptionService');

        // Check if this is a renewal payment
        let isRenewal = false;
        let packageId = null;
        
        if (payment.gateway_response) {
            try {
                // gateway_response might already be an object or a JSON string
                const metadata = typeof payment.gateway_response === 'string' 
                    ? JSON.parse(payment.gateway_response) 
                    : payment.gateway_response;
                    
                packageId = metadata.package_id;
                isRenewal = metadata.is_renewal === true;
            } catch (e) {
                console.error('[SubscriptionPaymentService] Failed to parse gateway_response:', e);
            }
        }

        console.log(`[SubscriptionPaymentService] Processing payment ${paymentRef}: isRenewal=${isRenewal}, packageId=${packageId}`);

        if (isRenewal) {
            // RENEWAL FLOW: Close old subscription and create new one
            console.log('[SubscriptionPaymentService] Processing renewal payment...');

            if (!packageId) {
                return {
                    success: false,
                    error: 'Cannot determine package ID for renewal'
                };
            }

            // Get existing subscription (active, expired, or cancelled)
            const existingSub = await SubscriptionService.getActiveSubscription(payment.account_id);
            
            // If there's an active subscription, close it first
            if (existingSub.has_subscription) {
                const oldSubId = existingSub.data.subscription_id;
                
                // Close the old subscription
                const closeSubSql = `
                    UPDATE account_subscription
                    SET 
                        status = 'Expired',
                        ended_at = NOW(),
                        last_modified = NOW()
                    WHERE subscription_id = ?
                `;
                await db.raw(closeSubSql, [oldSubId]);

                await SubscriptionService.logSubscriptionHistory(
                    oldSubId,
                    payment.account_id,
                    'Expired',
                    'Subscription closed due to renewal',
                    existingSub.data.status,
                    'Expired'
                );

                console.log(`[SubscriptionPaymentService] Closed old subscription ${oldSubId} for renewal`);
            }

            // Create new subscription for renewal
            const createResult = await SubscriptionService.createSubscription(
                payment.account_id,
                packageId,
                payment.payment_gateway,
                true // skipPayment = true (payment already confirmed)
            );

            if (!createResult.success) {
                console.error('[SubscriptionPaymentService] Failed to create renewal subscription:', createResult.error);
                return createResult;
            }

            // Update payment record with the new subscription_id
            const updatePaymentSubSql = `
                UPDATE subscription_payment
                SET subscription_id = ?
                WHERE payment_ref = ?
            `;
            await db.raw(updatePaymentSubSql, [createResult.data.subscription_id, paymentRef]);

            // Initialize/update credit account
            try {
                const packageResult = await SubscriptionService.getPackageById(packageId);
                
                if (packageResult.success) {
                    const packageCode = packageResult.data.package_code;
                    let freeReceiptsLimit = 0;
                    
                    if (packageCode === 'PRO') {
                        freeReceiptsLimit = 20;
                    } else if (packageCode === 'PREMIUM') {
                        freeReceiptsLimit = 50;
                    }
                    
                    await CreditService.getOrCreateCreditAccount(payment.account_id);
                    
                    const updateCreditSql = `
                        UPDATE account_credit
                        SET free_receipts_limit = ?
                        WHERE account_id = ?
                    `;
                    await db.raw(updateCreditSql, [freeReceiptsLimit, payment.account_id]);
                    
                    console.log(`[SubscriptionPaymentService] Credit account updated for renewal: account ${payment.account_id}, limit ${freeReceiptsLimit}`);
                }
            } catch (creditError) {
                console.error('[SubscriptionPaymentService] Failed to update credit account:', creditError);
            }

            // Create notification + FCM push for successful renewal
            try {
                await NotificationService.sendUserNotification(
                    payment.account_id,
                    '🎉 Subscription Renewed',
                    `Your subscription has been renewed successfully! Payment of ${payment.currency} ${payment.amount} has been processed.`,
                    {
                        type:        'SubscriptionRenewed',
                        payment_ref: paymentRef,
                        amount:      String(payment.amount)
                    }
                );

                // Emailed receipt with the PDF attached. Not awaited: the payment is
                // already settled and the gateway is waiting on this response.
                sendReceiptEmail(paymentRef);
            } catch (notifError) {
                console.error('[SubscriptionPaymentService] Failed to create renewal notification:', notifError);
            }

            console.log(`[SubscriptionPaymentService] Renewal completed: new subscription ${createResult.data.subscription_id}`);

            return {
                success: true,
                message: 'Subscription renewed successfully',
                data: {
                    payment_ref: paymentRef,
                    subscription_id: createResult.data.subscription_id,
                    amount: payment.amount,
                    is_renewal: true
                }
            };

        } else {
            // ORIGINAL FLOW: New subscription or existing subscription payment
            // Check if subscription already exists
            const existingSub = await SubscriptionService.getActiveSubscription(payment.account_id);
            
            if (existingSub.has_subscription) {
                const existingSubData = existingSub.data;
                const isSamePackage   = packageId && existingSubData.sub_package_id === packageId;
                const isActivatable   = ['Trial', 'Past_Due'].includes(existingSubData.status);

                if (isSamePackage && isActivatable) {
                    // Same package, just flip Trial/Past_Due → Active
                    await db.raw(
                        `UPDATE account_subscription
                         SET status = 'Active', payment_method = ?, last_modified = NOW()
                         WHERE subscription_id = ? AND status IN ('Trial', 'Past_Due')`,
                        [payment.payment_gateway, existingSubData.subscription_id]
                    );
                    await SubscriptionService.logSubscriptionHistory(
                        existingSubData.subscription_id, payment.account_id,
                        'Payment_Succeeded',
                        `Payment of ${payment.currency} ${payment.amount} completed successfully`,
                        null, 'Active'
                    );
                } else {
                    // Different package or upgrading from Active free plan — expire old, create new
                    await db.raw(
                        `UPDATE account_subscription
                         SET status = 'Expired', ended_at = NOW(), last_modified = NOW()
                         WHERE subscription_id = ?`,
                        [existingSubData.subscription_id]
                    );
                    await SubscriptionService.logSubscriptionHistory(
                        existingSubData.subscription_id, payment.account_id,
                        'Expired', 'Plan replaced by new subscription',
                        existingSubData.status, 'Expired'
                    );

                    const createResult = await SubscriptionService.createSubscription(
                        payment.account_id, packageId, payment.payment_gateway, true
                    );
                    if (createResult.success) {
                        await db.raw(
                            `UPDATE subscription_payment SET subscription_id = ? WHERE payment_ref = ?`,
                            [createResult.data.subscription_id, paymentRef]
                        );
                    }
                }

                // Update credit account limits for the activated package
                try {
                    const pkgId = packageId || existingSubData.sub_package_id;
                    const packageResult = await SubscriptionService.getPackageById(pkgId);
                    if (packageResult.success) {
                        const packageCode = packageResult.data.package_code;
                        let freeReceiptsLimit = 0;
                        if (packageCode === 'PRO')     freeReceiptsLimit = 20;
                        if (packageCode === 'PREMIUM') freeReceiptsLimit = 50;
                        await CreditService.getOrCreateCreditAccount(payment.account_id);
                        await db.raw(
                            `UPDATE account_credit SET free_receipts_limit = ? WHERE account_id = ?`,
                            [freeReceiptsLimit, payment.account_id]
                        );
                    }
                } catch (creditError) {
                    console.error('[SubscriptionPaymentService] Failed to update credit account:', creditError);
                }

                // Push + in-app notification
                try {
                    await NotificationService.sendUserNotification(
                        payment.account_id,
                        '🎉 Subscription Activated',
                        `Your payment of ${payment.currency} ${await chargedTotal(paymentRef, payment.amount)} has been processed and your subscription is now active.`,
                        { type: 'SubscriptionActivated', payment_ref: paymentRef, amount: String(payment.amount) }
                    );

                    // Emailed receipt with the PDF attached. Not awaited: the payment is
                    // already settled and the gateway is waiting on this response.
                    sendReceiptEmail(paymentRef);
                } catch (notifError) {
                    console.error('[SubscriptionPaymentService] Failed to create notification:', notifError);
                }

                return {
                    success: true,
                    message: 'Payment processed and subscription activated',
                    data: {
                        payment_ref:     paymentRef,
                        subscription_id: payment.subscription_id,
                        amount:          payment.amount
                    }
                };
            } else {
                // No subscription exists - create it now (for non-trial packages)
                // Get package ID from payment gateway_response metadata
                
                if (!packageId) {
                    return {
                        success: false,
                        error: 'Cannot determine package ID from payment metadata'
                    };
                }

                // Create subscription with skipPayment=true since payment is already confirmed
                const createResult = await SubscriptionService.createSubscription(
                    payment.account_id,
                    packageId,
                    payment.payment_gateway,
                    true // skipPayment = true
                );

                if (!createResult.success) {
                    return createResult;
                }

                // Update payment record with the new subscription_id
                const updatePaymentSubSql = `
                    UPDATE subscription_payment
                    SET subscription_id = ?
                    WHERE payment_ref = ?
                `;
                await db.raw(updatePaymentSubSql, [createResult.data.subscription_id, paymentRef]);

                // Initialize/update credit account with free_receipts_limit based on package
                try {
                    const packageResult = await SubscriptionService.getPackageById(packageId);
                    
                    if (packageResult.success) {
                        const packageCode = packageResult.data.package_code;
                        let freeReceiptsLimit = 0;
                        
                        if (packageCode === 'PRO') {
                            freeReceiptsLimit = 20;
                        } else if (packageCode === 'PREMIUM') {
                            freeReceiptsLimit = 50;
                        }
                        
                        // Ensure credit account exists
                        await CreditService.getOrCreateCreditAccount(payment.account_id);
                        
                        // Update free_receipts_limit
                        const updateCreditSql = `
                            UPDATE account_credit
                            SET free_receipts_limit = ?
                            WHERE account_id = ?
                        `;
                        await db.raw(updateCreditSql, [freeReceiptsLimit, payment.account_id]);
                        
                        console.log(`[SubscriptionPaymentService] Credit account initialized for account ${payment.account_id}: free_receipts_limit set to ${freeReceiptsLimit} (${packageCode})`);
                    }
                } catch (creditError) {
                    console.error('[SubscriptionPaymentService] Failed to initialize credit account:', creditError);
                }

                // Create notification + FCM push for new subscription activation
                try {
                    await NotificationService.sendUserNotification(
                        payment.account_id,
                        '🎉 Subscription Activated',
                        `Welcome to TaxLah Premium! Your payment of ${payment.currency} ${await chargedTotal(paymentRef, payment.amount)} has been processed and your subscription is now active.`,
                        {
                            type:        'SubscriptionActivated',
                            payment_ref: paymentRef,
                            amount:      String(payment.amount)
                        }
                    );

                    // Emailed receipt with the PDF attached. Not awaited: the payment is
                    // already settled and the gateway is waiting on this response.
                    sendReceiptEmail(paymentRef);
                } catch (notifError) {
                    console.error('[SubscriptionPaymentService] Failed to create notification:', notifError);
                }

                return {
                    success: true,
                    message: 'Payment processed and subscription created',
                    data: {
                        payment_ref: paymentRef,
                        subscription_id: createResult.data.subscription_id,
                        amount: payment.amount
                    }
                };
            }
        }
        
    } catch (error) {
        console.error('[SubscriptionPaymentService] processSuccessfulPayment error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Process failed subscription payment
 * @param {string} paymentRef - Payment reference
 * @param {string} reason - Failure reason
 * @returns {Object} - Processing result
 */
async function processFailedPayment(paymentRef, reason = null, gatewayResponse = null) {
    try {
        // Get payment details
        const paymentResult = await getPaymentByRef(paymentRef);
        if (!paymentResult.success) {
            return paymentResult;
        }

        const payment = paymentResult.data;

        // Update payment status
        await updatePaymentStatus(paymentRef, 'Failed', null, gatewayResponse);

        // ── Mark bill overdue + record failed billing transaction ───
        try {
            if (payment.gateway_transaction_id || (payment.gateway_response && payment.gateway_response.id)) {
                const purchaseId = payment.gateway_response.id ||
                    (typeof payment.gateway_response === 'string'
                        ? JSON.parse(payment.gateway_response).id
                        : payment.gateway_response?.purchase_id);

                const billLookup = await BillingGetBillByChipPurchaseId(purchaseId);
                if (billLookup.success) {
                    const billId = billLookup.data.bill_id;
                    await BillingUpdateBillStatus(billId, 'Overdue');

                    const periodDate = payment.period_start ? new Date(payment.period_start) : new Date();
                    await BillingCreateTransaction({
                        billId,
                        accountId:         payment.account_id,
                        subscriptionId:    payment.subscription_id || null,
                        billYear:          periodDate.getFullYear(),
                        billMonth:         periodDate.getMonth() + 1,
                        paymentGateway:    payment.payment_gateway || 'Chip',
                        gatewayPurchaseId: purchaseId,
                        gatewayRef:        paymentRef,
                        gatewayEventType:  'purchase.failed',
                        gatewayStatusRaw:  'failed',
                        amount:            parseFloat(payment.amount),
                        currency:          payment.currency || 'MYR',
                        status:            'Failed',
                        failedAt:          new Date(),
                        failureReason:     reason || null,
                    });
                }
            }
        } catch (billingError) {
            console.error('[SubscriptionPaymentService] processFailedPayment billing record failed:', billingError);
        }

        const SubscriptionService   = require('./SubscriptionService');
        const Device                = require('./Device');

        // Only update subscription if it exists (null for new subscription payments before subscription creation)
        if (payment.subscription_id) {
            // Update subscription to Past_Due
            const updateSubSql = `
                UPDATE account_subscription
                SET status = 'Past_Due', last_modified = NOW()
                WHERE subscription_id = ?
                AND status IN ('Trial', 'Active')
            `;
            await db.raw(updateSubSql, [payment.subscription_id]);

            // Log subscription history
            await SubscriptionService.logSubscriptionHistory(
                payment.subscription_id,
                payment.account_id,
                'Payment_Failed',
                `Payment failed: ${reason || 'Unknown reason'}`,
                'Active',
                'Past_Due'
            );
        }

        // Get device token for notification
        const deviceResult = await Device.DeviceUser(payment.account_id);
        let fcmToken = null;

        if(deviceResult.status && deviceResult.data.length > 0) {
            fcmToken = deviceResult.data[0].device_fcm_token;
        }

        // Send notification regardless of subscription existence
        await UserNotificationCreate({
            account_id: payment.account_id,
            notification_title: '⚠️ Subscription Payment Failed',
            notification_description: `Unfortunately, your subscription payment of ${payment.currency} ${payment.amount} has failed. Please try again or contact support for assistance.`,
            read_status: 'No',
            archive_status: 'No',
            status: 'Active'
        });

        if (fcmToken) {
            await queues.notification.add('push', {
                token: fcmToken,
                title: '⚠️ Subscription Payment Failed',
                body: `Unfortunately, your subscription payment of ${payment.currency} ${payment.amount} has failed. Please try again or contact support for assistance.`,
                data: {
                    type: 'SubscriptionPaymentFailed',
                    subscription_id: String(payment.subscription_id || '')
                }
            }, { priority: 5 });
        }    

        return {
            success: true,
            message: 'Payment failure processed',
            data: {
                payment_ref: paymentRef,
                subscription_id: payment.subscription_id,
                status: 'Past_Due'
            }
        };
    } catch (error) {
        console.error('[SubscriptionPaymentService] processFailedPayment error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Get upcoming payments for renewals (for cron job)
 * @param {number} daysAhead - Days to look ahead
 * @returns {Object} - Upcoming renewals
 */
async function getUpcomingRenewals(daysAhead = 7) {
    try {
        const sql = `
            SELECT 
                s.subscription_id,
                s.subscription_ref,
                s.account_id,
                s.sub_package_id,
                s.billing_period,
                s.price_amount,
                s.next_billing_date,
                s.payment_method,
                a.account_email,
                a.account_name,
                pkg.package_name
            FROM account_subscription s
            JOIN account a ON s.account_id = a.account_id
            JOIN subscription_package pkg ON s.sub_package_id = pkg.sub_package_id
            WHERE s.status = 'Active'
            AND s.auto_renew = 'Yes'
            AND s.next_billing_date BETWEEN NOW() AND DATE_ADD(NOW(), INTERVAL ? DAY)
            ORDER BY s.next_billing_date ASC
        `;
        
        const renewals = await db.raw(sql, [daysAhead]);

        return {
            success: true,
            data: renewals
        };
    } catch (error) {
        console.error('[SubscriptionPaymentService] getUpcomingRenewals error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Create renewal payment for subscription
 * @param {number} subscriptionId - Subscription ID
 * @returns {Object} - Renewal payment details
 */
async function createRenewalPayment(subscriptionId) {
    try {
        // Get subscription details
        const subSql = `
            SELECT 
                s.*,
                pkg.price_amount,
                pkg.billing_period
            FROM account_subscription s
            JOIN subscription_package pkg ON s.sub_package_id = pkg.sub_package_id
            WHERE s.subscription_id = ?
        `;
        const [subscription] = await db.raw(subSql, [subscriptionId]);

        if (!subscription) {
            return { success: false, error: 'Subscription not found' };
        }

        // Calculate next period
        const periodStart = new Date(subscription.current_period_end);
        const periodEnd = new Date(periodStart);

        if (subscription.billing_period === 'Monthly') {
            periodEnd.setMonth(periodEnd.getMonth() + 1);
        } else {
            periodEnd.setFullYear(periodEnd.getFullYear() + 1);
        }

        // Create payment record
        const paymentResult = await createPaymentRecord(
            subscriptionId,
            subscription.account_id,
            subscription.price_amount,
            periodStart,
            periodEnd,
            subscription.payment_method || 'ToyyibPay'
        );

        if (!paymentResult.success) {
            return paymentResult;
        }

        return {
            success: true,
            data: {
                payment_id: paymentResult.data.payment_id,
                payment_ref: paymentResult.data.payment_ref,
                amount: subscription.price_amount,
                period_start: periodStart,
                period_end: periodEnd
            }
        };
    } catch (error) {
        console.error('[SubscriptionPaymentService] createRenewalPayment error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Get payment receipt with full details
 * @param {string} paymentRef - Payment reference
 * @returns {Object} - Payment receipt details
 */
async function getPaymentReceipt(paymentRef) {
    try {
        const sql = `
            SELECT 
                sp.payment_id,
                sp.payment_ref,
                sp.subscription_id,
                sp.account_id,
                sp.amount,
                sp.currency,
                sp.period_start,
                sp.period_end,
                sp.payment_gateway,
                sp.gateway_transaction_id,
                sp.payment_status,
                sp.created_date,
                sp.paid_date,
                sp.gateway_response,
                s.subscription_ref,
                s.billing_period,
                s.status as subscription_status,
                pkg.package_name,
                pkg.package_code,
                pkg.package_description,
                pkg.features,
                a.account_name,
                a.account_fullname,
                a.account_email,
                a.account_contact,
                -- The bill is the authoritative record: these figures were captured at
                -- billing time. A receipt must show what was actually charged, so they
                -- are read rather than recomputed — a rate change later must not rewrite
                -- history on receipts already issued.
                b.bill_id,
                b.bill_no,
                b.invoice_no,
                b.subtotal        AS bill_subtotal,
                b.sst_rate        AS bill_sst_rate,
                b.sst_amount      AS bill_sst_amount,
                b.total_amount    AS bill_total,
                b.receipt_pdf_path
            FROM subscription_payment sp
            LEFT JOIN account_subscription s ON sp.subscription_id = s.subscription_id
            LEFT JOIN subscription_package pkg ON s.sub_package_id = pkg.sub_package_id
            LEFT JOIN account a ON sp.account_id = a.account_id
            LEFT JOIN bill b ON b.chip_purchase_id = sp.gateway_transaction_id
                            AND b.account_id = sp.account_id
            WHERE sp.payment_ref = ?
        `;
        
        const result = await db.raw(sql, [paymentRef]);
        
        if (result.length === 0) {
            return { success: false, error: 'Payment receipt not found' };
        }

        const payment = result[0];

        // Check if this is a renewal payment
        let isRenewal = false;
        if (payment.gateway_response) {
            try {
                const metadata = typeof payment.gateway_response === 'string' 
                    ? JSON.parse(payment.gateway_response) 
                    : payment.gateway_response;
                isRenewal = metadata.is_renewal === true;
            } catch (e) {
                // Ignore parsing errors
            }
        }

        // Format the receipt data
        const receiptData = {
            // Payment Information
            payment_ref: payment.payment_ref,
            payment_id: payment.payment_id,
            payment_status: payment.payment_status,
            payment_date: payment.paid_date || payment.created_date,
            payment_method: payment.payment_gateway,
            transaction_id: payment.gateway_transaction_id,
            
            // Amount Information
            // amount stays the charged total, because that is what the customer paid —
            // it previously returned sp.amount, the tax-exclusive figure, so a receipt
            // for a RM15.79 payment read RM14.90.
            amount: parseFloat(payment.bill_total ?? payment.amount),
            subtotal: payment.bill_subtotal !== undefined && payment.bill_subtotal !== null
                ? parseFloat(payment.bill_subtotal)
                : parseFloat(payment.amount),
            sst_rate: payment.bill_sst_rate !== undefined && payment.bill_sst_rate !== null
                ? parseFloat(payment.bill_sst_rate)
                : null,
            sst_amount: payment.bill_sst_amount !== undefined && payment.bill_sst_amount !== null
                ? parseFloat(payment.bill_sst_amount)
                : null,
            bill_no: payment.bill_no || null,
            invoice_no: payment.invoice_no || null,
            // Selected above but previously not mapped through, so the PDF cache check
            // never saw it and rebuilt the file on every download.
            receipt_pdf_path: payment.receipt_pdf_path || null,
            currency: payment.currency,
            
            // Subscription Information
            subscription_ref: payment.subscription_ref,
            subscription_type: isRenewal ? 'Renewal' : 'New Subscription',
            package_name: payment.package_name,
            package_code: payment.package_code,
            package_description: payment.package_description,
            billing_period: payment.billing_period,
            features: payment.features || [],
            
            // Period Information
            period_start: payment.period_start,
            period_end: payment.period_end,
            
            // Customer Information
            account_id: payment.account_id,
            customer_name: payment.account_fullname || payment.account_name,
            customer_email: payment.account_email,
            customer_phone: payment.account_contact,
            
            // Additional Info
            created_date: payment.created_date,
            is_renewal: isRenewal
        };

        return {
            success: true,
            data: receiptData
        };
    } catch (error) {
        console.error('[SubscriptionPaymentService] getPaymentReceipt error:', error);
        return { success: false, error: error.message };
    }
}


/**
 * Emails the receipt, with the PDF attached.
 *
 * Activation used to send only a push and an in-app row. Both live inside the app, so
 * uninstalling it takes the only record of the payment with them — and the push itself
 * never arrived at all while Firebase was uninitialised on the servers. An emailed
 * receipt is the copy people can actually file.
 *
 * Failures are logged and swallowed: a payment is already complete by this point, and
 * an SMTP problem must not roll it back or block the response to the gateway.
 */
/**
 * The figure to quote to a customer: what the card was actually charged.
 *
 * subscription_payment.amount is the tax-exclusive price, so notifications quoting it
 * told someone who paid RM15.79 that their "payment of MYR 14.90" had gone through.
 * The bill carries the charged total, captured when it was issued.
 */
async function chargedTotal(paymentRef, fallbackAmount) {
    try {
        const rows = await db.raw(
            `SELECT b.total_amount
               FROM bill b
               JOIN subscription_payment sp
                 ON b.chip_purchase_id = sp.gateway_transaction_id
                AND b.account_id = sp.account_id
              WHERE sp.payment_ref = ?
              LIMIT 1`,
            [paymentRef]
        );
        if (rows.length && rows[0].total_amount !== null) return Number(rows[0].total_amount).toFixed(2);
    } catch (e) {
        console.error('[chargedTotal] falling back for', paymentRef, '-', e.message);
    }
    return Number(fallbackAmount || 0).toFixed(2);
}

async function sendReceiptEmail(paymentRef) {
    try {
        const result = await getPaymentReceipt(paymentRef);
        if (!result.success || !result.data) {
            console.error('[Receipt email] no receipt for', paymentRef);
            return;
        }

        const receipt = result.data;
        if (!receipt.customer_email) {
            console.warn('[Receipt email] account has no email address:', receipt.account_id);
            return;
        }

        const { PaymentReceiptEmail } = require('../../services/MailTemplate');
        const { ensureReceiptPdf } = require('../../services/ReceiptPdfService');
        const mailService = require('../../services/MailService');
        const fs = require('fs');

        const mail = PaymentReceiptEmail(receipt);

        // Attach the same PDF the app serves, so both copies are identical.
        let attachments = [];
        try {
            const { filepath } = await ensureReceiptPdf(receipt);
            attachments = [{
                filename: `TaxLah-Receipt-${receipt.invoice_no || receipt.payment_ref}.pdf`,
                content: fs.readFileSync(filepath),
                contentType: 'application/pdf',
            }];
        } catch (e) {
            // Send the email regardless — the figures are in the body either way.
            console.error('[Receipt email] PDF unavailable, sending without it:', e.message);
        }

        await mailService.sendMail({
            to: receipt.customer_email,
            subject: mail.subject,
            text: mail.text,
            html: mail.html,
            attachments,
        });

        console.log(`[Receipt email] sent to ${receipt.customer_email} for ${paymentRef}`);
    } catch (e) {
        console.error('[Receipt email] failed for', paymentRef, '-', e.message);
    }
}

module.exports = {
    sendReceiptEmail,
    createPaymentRecord,
    getPaymentByRef,
    getPaymentHistory,
    getPaymentReceipt,
    updatePaymentStatus,
    processSuccessfulPayment,
    processFailedPayment,
    getUpcomingRenewals,
    createRenewalPayment,
    // Exported so the controller validates against the same lists the query enforces,
    // and so a test can assert an unlisted sort key never reaches SQL.
    SORTABLE_PAYMENT_COLUMNS,
    FILTERABLE_PAYMENT_STATUSES
};
