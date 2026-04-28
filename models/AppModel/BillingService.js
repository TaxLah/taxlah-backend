/**
 * BillingService
 *
 * Shared core for bill and billing_transaction management.
 * Used by:
 *   - SubscriptionPaymentService  (payment flow hooks)
 *   - Admin Bill / Transaction controllers (CRUD + analytics)
 *   - Cron jobs (overdue marking, reminder tracking)
 *
 * Sequence format:
 *   BILL  → BILL-YYYYMM-NNNNN   e.g. BILL-202501-00302
 *   INV   → INV-YYYY-NNNNNN     e.g. INV-2025-000302   (assigned on payment)
 *   TXN   → TXN-YYYYMM-NNNNN   e.g. TXN-202501-00271
 */

const db = require("../../utils/sqlbuilder");

const SST_RATE = 0.06; // Malaysian SST 6%

/* ─── helpers ─────────────────────────────────────────────── */

/** Zero-pad n to `width` digits */
function pad(n, width) {
	return String(n).padStart(width, "0");
}

/**
 * Atomically allocate the next sequential number for a given
 * type + period.  Uses SELECT … FOR UPDATE so concurrent calls
 * never produce duplicates.
 *
 * @param {'BILL'|'INV'|'TXN'} type
 * @param {string} period  YYYYMM for BILL/TXN, YYYY for INV
 * @returns {string}  formatted reference  e.g. 'BILL-202501-00302'
 */
async function _nextRef(type, period) {
	// Upsert row then lock it
	await db.raw(
		`INSERT INTO billing_sequence (seq_type, seq_period, last_seq)
         VALUES (?, ?, 0)
         ON DUPLICATE KEY UPDATE seq_type = seq_type`,
		[type, period],
	);

	const [row] = await db.raw(
		`SELECT last_seq FROM billing_sequence
         WHERE seq_type = ? AND seq_period = ?
         FOR UPDATE`,
		[type, period],
	);

	const next = (row.last_seq || 0) + 1;

	await db.raw(
		`UPDATE billing_sequence SET last_seq = ?
         WHERE seq_type = ? AND seq_period = ?`,
		[next, type, period],
	);

	if (type === "BILL") return `BILL-${period}-${pad(next, 5)}`;
	if (type === "INV") return `INV-${period}-${pad(next, 6)}`;
	if (type === "TXN") return `TXN-${period}-${pad(next, 5)}`;
}

/* ═══════════════════════════════════════════════════════════════
   1.  CREATE BILL
       Called by SubscriptionPaymentService.createPaymentRecord()
       after a CHIP purchase is created, so checkout_url and
       chip_purchase_id are available immediately.
═══════════════════════════════════════════════════════════════ */
async function BillingCreateBill({
	accountId,
	subscriptionId = null,
	subPackageId = null,
	billType = "Subscription",
	billDescription,
	billingYear,
	billingMonth,
	billingPeriodStart = null,
	billingPeriodEnd = null,
	subtotal,
	sstRate = SST_RATE,
	dueDate,
	chipPurchaseId = null,
	checkoutUrl = null,
	notes = null,
}) {
	try {
		const now = new Date();
		const yyyymm = `${now.getFullYear()}${pad(now.getMonth() + 1, 2)}`;
		const billNo = await _nextRef("BILL", yyyymm);

		const sstAmount = parseFloat((subtotal * sstRate).toFixed(2));
		const totalAmount = parseFloat((subtotal + sstAmount).toFixed(2));

		await db.raw(
			`
            INSERT INTO bill (
                bill_no, account_id, subscription_id, sub_package_id,
                bill_type, bill_description,
                billing_year, billing_month,
                billing_period_start, billing_period_end,
                bill_date, due_date,
                subtotal, sst_rate, sst_amount, total_amount, currency,
                chip_purchase_id, checkout_url,
                status, notes
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?, ?, ?, ?, ?, 'MYR', ?, ?, 'Pending', ?)
        `,
			[
				billNo,
				accountId,
				subscriptionId,
				subPackageId,
				billType,
				billDescription,
				billingYear,
				billingMonth,
				billingPeriodStart,
				billingPeriodEnd,
				dueDate,
				subtotal,
				sstRate,
				sstAmount,
				totalAmount,
				chipPurchaseId,
				checkoutUrl,
				notes,
			],
		);

		const [bill] = await db.raw(
			`SELECT bill_id, bill_no, total_amount, status FROM bill WHERE bill_no = ?`,
			[billNo],
		);

		return { success: true, data: bill };
	} catch (e) {
		console.error("[BillingService] BillingCreateBill:", e);
		return { success: false, error: e.message };
	}
}

/* ═══════════════════════════════════════════════════════════════
    2.  MARK BILL PAID + ASSIGN INVOICE NUMBER
    Called by SubscriptionPaymentService.processSuccessfulPayment()
═══════════════════════════════════════════════════════════════ */
async function BillingMarkBillPaid(billId, paidAt = new Date()) {
	try {
		const year = paidAt.getFullYear
			? paidAt.getFullYear()
			: new Date(paidAt).getFullYear();
		const invoiceNo = await _nextRef("INV", String(year));

		await db.raw(
			`
            UPDATE bill
            SET status = 'Paid', invoice_no = ?, paid_at = ?, last_modified = NOW()
            WHERE bill_id = ? AND status != 'Paid'
        `,
			[invoiceNo, paidAt, billId],
		);

		return { success: true, data: { invoice_no: invoiceNo } };
	} catch (e) {
		console.error("[BillingService] BillingMarkBillPaid:", e);
		return { success: false, error: e.message };
	}
}

/* ═══════════════════════════════════════════════════════════════
    3.  MARK BILL WITH NON-PAID STATUS  (Failed / Overdue / Cancelled / Refunded)
═══════════════════════════════════════════════════════════════ */
async function BillingUpdateBillStatus(billId, status) {
	const allowed = ["Draft", "Pending", "Overdue", "Cancelled", "Refunded"];
	if (!allowed.includes(status)) {
		return { success: false, error: `Invalid status: ${status}` };
	}
	try {
		await db.raw(
			`UPDATE bill SET status = ?, last_modified = NOW() WHERE bill_id = ?`,
			[status, billId],
		);
		return { success: true };
	} catch (e) {
		console.error("[BillingService] BillingUpdateBillStatus:", e);
		return { success: false, error: e.message };
	}
}

/* ═══════════════════════════════════════════════════════════════
   4.  UPDATE CHECKOUT URL + CHIP PURCHASE ID
       Called after CHIP /purchases/ response is received.
═══════════════════════════════════════════════════════════════ */
async function BillingSetCheckoutUrl(billId, chipPurchaseId, checkoutUrl) {
	try {
		await db.raw(
			`
            UPDATE bill
            SET chip_purchase_id = ?, checkout_url = ?, last_modified = NOW()
            WHERE bill_id = ?
        `,
			[chipPurchaseId, checkoutUrl, billId],
		);
		return { success: true };
	} catch (e) {
		console.error("[BillingService] BillingSetCheckoutUrl:", e);
		return { success: false, error: e.message };
	}
}

/* ═══════════════════════════════════════════════════════════════
   5.  INCREMENT REMINDER COUNT
       Called by cron / Send Reminder endpoint.
═══════════════════════════════════════════════════════════════ */
async function BillingRecordReminderSent(billId) {
	try {
		await db.raw(
			`
            UPDATE bill
            SET reminder_count = reminder_count + 1,
                reminder_sent_at = NOW(),
                last_modified = NOW()
            WHERE bill_id = ?
        `,
			[billId],
		);
		return { success: true };
	} catch (e) {
		console.error("[BillingService] BillingRecordReminderSent:", e);
		return { success: false, error: e.message };
	}
}

/* ═══════════════════════════════════════════════════════════════
   6.  CREATE BILLING TRANSACTION
       Called by processSuccessfulPayment() and processFailedPayment().
       Stores every field the CHIP webhook/callback returns.
═══════════════════════════════════════════════════════════════ */
async function BillingCreateTransaction({
	billId,
	accountId,
	subscriptionId = null,
	billYear,
	billMonth,
	paymentGateway = "Chip",
	gatewayPurchaseId = null,
	gatewayRef = null,
	gatewayEventType = null,
	gatewayStatusRaw = null,
	paymentMethod = null,
	bankName = null,
	amount,
	currency = "MYR",
	clientEmail = null,
	clientName = null,
	checkoutUrl = null,
	successRedirectUrl = null,
	failureRedirectUrl = null,
	callbackUrl = null,
	paidAt = null,
	failedAt = null,
	refundedAt = null,
	chipPayload = null,
	chipCallback = null,
	status = "Pending",
	failureReason = null,
	isTest = 0,
}) {
	try {
		const now = new Date();
		const yyyymm = `${now.getFullYear()}${pad(now.getMonth() + 1, 2)}`;
		const txnRef = await _nextRef("TXN", yyyymm);

		await db.raw(
			`
            INSERT INTO billing_transaction (
                txn_ref, bill_id, account_id, subscription_id,
                bill_year, bill_month,
                payment_gateway, gateway_purchase_id, gateway_ref,
                gateway_event_type, gateway_status_raw,
                payment_method, bank_name,
                amount, currency,
                client_email, client_name,
                checkout_url, success_redirect_url, failure_redirect_url, callback_url,
                paid_at, failed_at, refunded_at,
                chip_payload, chip_callback,
                status, failure_reason, is_test
            ) VALUES (
                ?, ?, ?, ?,
                ?, ?,
                ?, ?, ?,
                ?, ?,
                ?, ?,
                ?, ?,
                ?, ?,
                ?, ?, ?, ?,
                ?, ?, ?,
                ?, ?,
                ?, ?, ?
            )
        `,
			[
				txnRef,
				billId,
				accountId,
				subscriptionId,
				billYear,
				billMonth,
				paymentGateway,
				gatewayPurchaseId,
				gatewayRef,
				gatewayEventType,
				gatewayStatusRaw,
				paymentMethod,
				bankName,
				amount,
				currency,
				clientEmail,
				clientName,
				checkoutUrl,
				successRedirectUrl,
				failureRedirectUrl,
				callbackUrl,
				paidAt,
				failedAt,
				refundedAt,
				chipPayload ? JSON.stringify(chipPayload) : null,
				chipCallback ? JSON.stringify(chipCallback) : null,
				status,
				failureReason,
				isTest ? 1 : 0,
			],
		);

		const [txn] = await db.raw(
			`SELECT txn_id, txn_ref, status FROM billing_transaction WHERE txn_ref = ?`,
			[txnRef],
		);

		return { success: true, data: txn };
	} catch (e) {
		console.error("[BillingService] BillingCreateTransaction:", e);
		return { success: false, error: e.message };
	}
}

/* ═══════════════════════════════════════════════════════════════
   7.  UPDATE TRANSACTION STATUS
       Called when gateway callback/webhook fires.
═══════════════════════════════════════════════════════════════ */
async function BillingUpdateTransactionStatus(
	txnRef,
	{
		status,
		gatewayStatusRaw = null,
		gatewayEventType = null,
		paymentMethod = null,
		bankName = null,
		paidAt = null,
		failedAt = null,
		refundedAt = null,
		chipCallback = null,
		failureReason = null,
	},
) {
	try {
		const fields = ["status = ?", "last_modified = NOW()"];
		const vals = [status];

		if (gatewayStatusRaw !== null) {
			fields.push("gateway_status_raw = ?");
			vals.push(gatewayStatusRaw);
		}
		if (gatewayEventType !== null) {
			fields.push("gateway_event_type = ?");
			vals.push(gatewayEventType);
		}
		if (paymentMethod !== null) {
			fields.push("payment_method = ?");
			vals.push(paymentMethod);
		}
		if (bankName !== null) {
			fields.push("bank_name = ?");
			vals.push(bankName);
		}
		if (paidAt !== null) {
			fields.push("paid_at = ?");
			vals.push(paidAt);
		}
		if (failedAt !== null) {
			fields.push("failed_at = ?");
			vals.push(failedAt);
		}
		if (refundedAt !== null) {
			fields.push("refunded_at = ?");
			vals.push(refundedAt);
		}
		if (chipCallback !== null) {
			fields.push("chip_callback = ?");
			vals.push(JSON.stringify(chipCallback));
		}
		if (failureReason !== null) {
			fields.push("failure_reason = ?");
			vals.push(failureReason);
		}

		vals.push(txnRef);

		await db.raw(
			`UPDATE billing_transaction SET ${fields.join(", ")} WHERE txn_ref = ?`,
			vals,
		);

		return { success: true };
	} catch (e) {
		console.error("[BillingService] BillingUpdateTransactionStatus:", e);
		return { success: false, error: e.message };
	}
}

/* ═══════════════════════════════════════════════════════════════
   8.  GET BILL BY ID  (for admin detail view)
═══════════════════════════════════════════════════════════════ */
async function BillingGetBillById(billId) {
	try {
		const rows = await db.raw(
			`
            SELECT
                b.*,
                a.account_name, a.account_fullname, a.account_email,
                a.account_contact, a.company_name,
                s.subscription_ref, s.billing_period, s.status AS subscription_status,
                pkg.package_name, pkg.package_code
            FROM bill b
            JOIN  account a             ON a.account_id      = b.account_id
            LEFT JOIN account_subscription s   ON s.subscription_id = b.subscription_id
            LEFT JOIN subscription_package pkg ON pkg.sub_package_id = COALESCE(b.sub_package_id, s.sub_package_id)
            WHERE b.bill_id = ?
            LIMIT 1
        `,
			[billId],
		);

		if (!rows.length) return { success: false, data: null };
		return { success: true, data: rows[0] };
	} catch (e) {
		console.error("[BillingService] BillingGetBillById:", e);
		return { success: false, data: null };
	}
}

/* ═══════════════════════════════════════════════════════════════
   9.  GET BILL BY chip_purchase_id
       Used by webhook handler to locate the bill.
═══════════════════════════════════════════════════════════════ */
async function BillingGetBillByChipPurchaseId(chipPurchaseId) {
	try {
		const rows = await db.raw(
			`SELECT bill_id, bill_no, account_id, subscription_id,
                billing_year, billing_month, total_amount, currency,
                checkout_url, status
            FROM bill WHERE chip_purchase_id = ? LIMIT 1`,
			[chipPurchaseId],
		);
		if (!rows.length) return { success: false, data: null };
		return { success: true, data: rows[0] };
	} catch (e) {
		console.error("[BillingService] BillingGetBillByChipPurchaseId:", e);
		return { success: false, data: null };
	}
}

/* ═══════════════════════════════════════════════════════════════
   10. MARK OVERDUE BILLS  (called by cron)
       Marks all Pending bills where due_date < NOW() as Overdue.
═══════════════════════════════════════════════════════════════ */
async function BillingMarkOverdueBills() {
	try {
		const result = await db.raw(`
            UPDATE bill
            SET status = 'Overdue', last_modified = NOW()
            WHERE status = 'Pending'
              AND due_date < NOW()
        `);
		return { success: true, data: { affected: result.affectedRows } };
	} catch (e) {
		console.error("[BillingService] BillingMarkOverdueBills:", e);
		return { success: false, error: e.message };
	}
}

/* ═══════════════════════════════════════════════════════════════
   11. GET OVERDUE / PENDING BILLS FOR REMINDERS  (called by cron)
═══════════════════════════════════════════════════════════════ */
async function BillingGetBillsForReminder({ maxReminderCount = 3 } = {}) {
	try {
		const rows = await db.raw(
			`
            SELECT
                b.bill_id, b.bill_no, b.account_id, b.total_amount,
                b.due_date, b.checkout_url, b.reminder_count,
                a.account_fullname, a.account_email,
                a.company_name
            FROM bill b
            JOIN account a ON a.account_id = b.account_id
            WHERE b.status IN ('Pending', 'Overdue')
              AND b.reminder_count < ?
              AND b.checkout_url IS NOT NULL
            ORDER BY b.due_date ASC
        `,
			[maxReminderCount],
		);

		return { success: true, data: rows };
	} catch (e) {
		console.error("[BillingService] BillingGetBillsForReminder:", e);
		return { success: false, data: [] };
	}
}

module.exports = {
	BillingCreateBill,
	BillingMarkBillPaid,
	BillingUpdateBillStatus,
	BillingSetCheckoutUrl,
	BillingRecordReminderSent,
	BillingCreateTransaction,
	BillingUpdateTransactionStatus,
	BillingGetBillById,
	BillingGetBillByChipPurchaseId,
	BillingMarkOverdueBills,
	BillingGetBillsForReminder,
};
