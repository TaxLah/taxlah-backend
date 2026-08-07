require("dotenv").config();

const email = require("../services/MailService");
const fcm   = require("../services/FirebaseService");

// Re-use the same queue instances (with environment prefix) as the rest of the app.
// Creating separate instances here was the root cause of cross-environment job leakage.
const queues            = require("./index");
const emailQueue        = queues.email;
const notificationQueue = queues.notification;
const paymentQueue      = queues.payment;
const defaultQueue      = queues.default;
const aiReceiptQueue    = queues["ai-receipt"];

// Email queue processor
emailQueue.process("send", async (job) => {
	const { to, subject, text, html, attachments } = job.data;
	console.log(`[Email Worker] Processing job ${job.id}: Sending to ${to}`);

	const result = await email.sendMail({ to, subject, text, html, attachments });
	if (!result.success) {
		throw new Error(result.error);
	}

	return result;
});

emailQueue.process("sendTemplate", async (job) => {
	const { to, subject, template, data } = job.data;
	console.log(`[Email Worker] Processing template job ${job.id}: Sending to ${to}`);

	const result = await email.sendTemplate({ to, subject, template, data });
	if (!result.success) {
		throw new Error(result.error);
	}

	return result;
});

emailQueue.process("sendWelcome", async (job) => {
	const { to, name } = job.data;
	console.log(`[Email Worker] Processing welcome email job ${job.id}: Sending to ${to}`);

	const result = await email.sendWelcome(to, name);
	if (!result.success) {
		throw new Error(result.error);
	}

	return result;
});

// Notification queue processor
notificationQueue.process("push", async (job) => {
	const { token, title, body, data } = job.data;
	console.log(`[Notification Worker] Processing job ${job.id}: Sending push notification`);

	const result = await fcm.sendToDevice(token, { title, body }, data);
	if (!result.success) {
		throw new Error(result.error);
	}

	return result;
});

notificationQueue.process("pushMultiple", async (job) => {
	const { tokens, title, body, data } = job.data;
	console.log(`[Notification Worker] Processing job ${job.id}: Sending to ${tokens.length} devices`);

	const result = await fcm.sendToMultipleDevices(tokens, { title, body }, data);
	if (!result.success) {
		// Only throw (trigger retry) on actual API/auth failures, not stale tokens
		throw new Error(result.error || result.message || 'FCM multicast failed');
	}

	console.log(`[Notification Worker] Job ${job.id} done — ${result.data?.successCount ?? 0}/${tokens.length} delivered`);
	return result;
});

notificationQueue.process("pushTopic", async (job) => {
	const { topic, title, body, data } = job.data;
	console.log(`[Notification Worker] Processing job ${job.id}: Sending to topic ${topic}`);

	// Topic messaging not yet implemented — complete when FCM topic support is added
	return { success: true, skipped: true, reason: 'not_implemented' };
});

// Payment queue processor
paymentQueue.process("checkStatus", async (job) => {
	const { paymentId, callback } = job.data;
	console.log(`[Payment Worker] Processing job ${job.id}: Checking payment ${paymentId}`);

	const chip = require("../services/ChipPaymentService");
	const result = await chip.getPurchase(paymentId);

	// You can add custom callback logic here
	// e.g., update database, send notification, etc.

	return result;
});

// Default queue processor
defaultQueue.process("*", async (job) => {
	console.log(`[Default Worker] Processing job ${job.id}: ${job.name}`);
	console.log("Job data:", job.data);

	await new Promise((resolve) => setTimeout(resolve, 3000));

	// Generic job handler - customize as needed
	return { processed: true, jobName: job.name };
});

// AI Receipt queue processor
// Job data: { expenses_id, account_id, merchant, date, total_amount, items }
// Text-only — receipt was already OCR'd at extract step, no image re-upload needed.
aiReceiptQueue.process("analyseReceipt", async (job) => {

	console.log("Log Job Data : ", job.data)

	const { expenses_id, account_id, merchant, date, total_amount, items } = job.data;
	console.log(`[AI-Receipt Worker] Processing job ${job.id}: expenses_id=${expenses_id}`);

	console.log("Expenses ID : ", expenses_id)
	console.log("Account ID : ", account_id)
	console.log("Merchant Name : ", merchant)
	console.log("Receipt Date : ", date)
	console.log("Total Amount (RM) : ", total_amount)
	console.log("Items : ", items)

	const db                           = require("../utils/sqlbuilder");
	const { classifyTaxEligibility }   = require("../services/TaxEligibilityService");
	const NotificationService          = require("../services/NotificationService");

	try {
		// Guard: verify the expense still exists before doing anything
		const expenseCheck = await db.raw(
			`SELECT expenses_id FROM account_expenses WHERE expenses_id = ? LIMIT 1`,
			[expenses_id]
		);
		if (!expenseCheck.length) {
			console.warn(`[AI-Receipt Worker] Skipping job ${job.id} — expenses_id=${expenses_id} no longer exists`);
			return { success: false, skipped: true, reason: 'expense_deleted' };
		}

		// Mark as Processing
		await db.raw(
			`UPDATE account_expenses SET ai_processing_status = 'Processing', last_modified = NOW() WHERE expenses_id = ?`,
			[expenses_id]
		);

		// Text-only AI call (fast ~1–3s) — classifies tax category from extracted data
		const aiResult = await classifyTaxEligibility({ merchant, date, total_amount, items });
		console.log(`[AI-Receipt Worker] AI result for expenses_id=${expenses_id}:`, aiResult);

		// Map AI tax_category code → tax_id in DB
		let tax_id      = null;
		let taxsub_id   = null;
		// The AI classifier works from the receipt alone and has no notion of who a
		// receipt is for, so claims it produces are always the account holder's own.
		// Declared explicitly rather than left to default: omitting it wrote NULL, and
		// NULLs are what stopped the unique key from ever matching.
		let dependant_id = null;
		let taxEligible = 'No';
		let taxMaxClaim = 0;

		if (aiResult.tax_category && aiResult.tax_category !== 'NOT_ELIGIBLE') {
			const taxRow = await db.raw(
				`SELECT tax_id, tax_max_claim FROM tax_category WHERE tax_code = ? AND status = 'Active' LIMIT 1`,
				[aiResult.tax_category]
			);
			if (taxRow.length) {
				tax_id        = taxRow[0].tax_id;
				taxMaxClaim   = taxRow[0].tax_max_claim || 0;
				taxEligible   = (aiResult.confidence === 'high' || aiResult.confidence === 'medium') ? 'Yes' : 'No';
			}
		}

		// Determine mapping status based on confidence
		const confidenceScore = aiResult.confidence === 'high' ? 90 : aiResult.confidence === 'medium' ? 65 : 30;

		// Update expense with AI result
		await db.raw(
			`UPDATE account_expenses SET
				expenses_tax_category      = ?,
				expenses_tax_subcategory   = ?,
				expenses_tax_eligible      = ?,
				expenses_mapping_status    = 'Estimated',
				expenses_mapping_confidence = ?,
				expenses_mapping_date      = NOW(),
				ai_processing_status       = 'Completed',
				ai_processing_result       = ?,
				last_modified              = NOW()
			WHERE expenses_id = ?`,
			[
				tax_id,
				taxsub_id,
				taxEligible,
				confidenceScore,
				JSON.stringify(aiResult),
				expenses_id
			]
		);

		console.log("Log Tax ID : ", tax_id)
		console.log("Log Tax Eligible : ", taxEligible)
		console.log("Log Confidence Score : ", confidenceScore)

		// Upsert account_tax_claim if expense is tax eligible (Self claim for that year)
		if (taxEligible == 'Yes' && tax_id) {
			const claimYear = date ? new Date(date).getFullYear() : new Date().getFullYear();

			// The running total is recomputed inside the INSERT below rather than read
			// here and passed in. Reading it in JS first opened a lost-update race:
			// two jobs for the same account and category could both read the total
			// before either wrote, and the slower one would then overwrite the other's
			// result with a figure that omitted its receipt. Doing the read inside the
			// write statement makes the pair atomic without needing a transaction —
			// which matters, because sqlbuilder has no transaction support.
			const CLAIMED_SQL = `
				SELECT LEAST(COALESCE(SUM(expenses_total_amount), 0), ?)
				  FROM account_expenses
				 WHERE account_id = ?
				   AND expenses_tax_category = ?
				   AND expenses_tax_eligible = 'Yes'
				   AND YEAR(expenses_date) = ?
				   AND ai_processing_status = 'Completed'`;
			const claimedArgs = [taxMaxClaim, account_id, tax_id, claimYear];

			// dependant_id is listed explicitly. Leaving it out let it default to NULL,
			// and because MySQL treats every NULL in a unique index as distinct, the
			// unique_claim key never fired — so this upsert only ever inserted. It now
			// matches on unique_claim_v2, which is built over NULL-folded generated
			// columns (migration 021), so ON DUPLICATE KEY UPDATE actually runs.
			//
			// LAST_INSERT_ID(claim_id) makes insertId return the existing row's PK on
			// the update branch, so claim_id is never stored as 0.
			let addTaxClaim = await db.raw(
				`INSERT INTO account_tax_claim
					(account_id, tax_year, tax_id, taxsub_id, dependant_id, claimed_amount, max_claimable, claim_for, claim_status, status)
				VALUES
					(?, ?, ?, ?, ?, (${CLAIMED_SQL}), ?, 'Self', 'Draft', 'Active')
				ON DUPLICATE KEY UPDATE
					claim_id       = LAST_INSERT_ID(claim_id),
					claimed_amount = (${CLAIMED_SQL}),
					max_claimable  = VALUES(max_claimable),
					last_modified  = NOW()`,
				[
					account_id, claimYear, tax_id, taxsub_id, dependant_id,
					...claimedArgs,      // subquery in VALUES
					taxMaxClaim,
					...claimedArgs       // subquery in the update branch
				]
			);
			console.log(`[AI-Receipt Worker] Tax claim upserted: account_id=${account_id}, tax_id=${tax_id}, year=${claimYear}, cap=${taxMaxClaim}`);

			await db.update("account_expenses", { claim_id: addTaxClaim.insertId }, { expenses_id })
		}



		// Log to mapping history
		await db.insert('account_expenses_mapping_history', {
			expenses_id,
			new_tax_category:       tax_id,
			new_tax_subcategory:    taxsub_id,
			change_reason:          'AI_Refinement',
			confidence_after:       confidenceScore,
			mapping_version_after:  'AI-Estimated',
			changed_by:             'AI',
			changed_date:           new Date()
		});

		// Notify user via FCM + in-app
		const categoryLabel = aiResult.tax_category_label || 'Uncategorised';
		const eligibleText  = taxEligible === 'Yes' ? `Tax eligible (${categoryLabel})` : 'Not tax eligible';

		await NotificationService.sendUserNotification(
			account_id,
			'Receipt Analysis Complete',
			`Your receipt has been analysed. ${eligibleText}. Confidence: ${aiResult.confidence}.`,
			{
				type:        'AIReceiptAnalysis',
				expenses_id: String(expenses_id),
				tax_eligible: taxEligible,
				tax_category: aiResult.tax_category || 'NOT_ELIGIBLE',
				confidence:  aiResult.confidence || 'low'
			}
		);

		console.log(`[AI-Receipt Worker] Completed expenses_id=${expenses_id}`);
		return { success: true, expenses_id };

	} catch (err) {
		console.error(`[AI-Receipt Worker] Failed expenses_id=${expenses_id}:`, err.message);

		// Mark as Failed in DB
		await db.raw(
			`UPDATE account_expenses SET ai_processing_status = 'Failed', last_modified = NOW() WHERE expenses_id = ?`,
			[expenses_id]
		).catch(() => {});

		// Notify user of failure
		const NotificationService = require("../services/NotificationService");
		await NotificationService.sendUserNotification(
			account_id,
			'Receipt Analysis Failed',
			'We could not analyse your receipt automatically. Please categorise it manually.',
			{
				type:        'AIReceiptAnalysisFailed',
				expenses_id: String(expenses_id)
			}
		).catch(() => {});

		throw err; // Let Bull handle retry
	}
});

// Stalled-job handler (queue/index.js already covers completed/failed/error).
// Stalled means the worker crashed mid-job — Bull will re-queue it automatically.
const setupStalledHandler = (queue, name) => {
	queue.on("stalled", (job) => {
		console.warn(`[${name}] Job ${job.id} stalled — will be re-queued`);
	});
};

setupStalledHandler(emailQueue, "Email");
setupStalledHandler(notificationQueue, "Notification");
setupStalledHandler(paymentQueue, "Payment");
setupStalledHandler(defaultQueue, "Default");
setupStalledHandler(aiReceiptQueue, "AI-Receipt");

console.log("🚀 Worker started and listening for jobs...");
console.log("   - Email queue");
console.log("   - Notification queue");
console.log("   - Payment queue");
console.log("   - Default queue");
console.log("   - AI Receipt queue");