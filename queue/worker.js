require("dotenv").config();

const Queue = require("bull");
const email = require("../services/MailService");
const fcm   = require("../services/FirebaseService");

// Redis configuration
const redisConfig = {
	host: process.env.REDIS_HOST || "127.0.0.1",
	port: parseInt(process.env.REDIS_PORT) || 6379,
	password: process.env.REDIS_PASSWORD || undefined,
};

// Create queue instances for worker
const emailQueue 		= new Queue("email", { redis: redisConfig });
const notificationQueue = new Queue("notification", { redis: redisConfig });
const paymentQueue 		= new Queue("payment", { redis: redisConfig });
const defaultQueue 		= new Queue("default", { redis: redisConfig });
const aiReceiptQueue	= new Queue("ai-receipt", { redis: redisConfig });

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
		throw new Error(result.error);
	}

	return result;
});

notificationQueue.process("pushTopic", async (job) => {
	const { topic, title, body, data } = job.data;
	console.log(`[Notification Worker] Processing job ${job.id}: Sending to topic ${topic}`);

	// const result = await fcm.sendToTopic(topic, title, body, data);
	// if (!result.success) {
	// 	throw new Error(result.error);
	// }

	return result;
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

			// Sum all eligible expenses for this account/tax category/year from DB (source of truth)
			const sumResult = await db.raw(
				`SELECT COALESCE(SUM(expenses_total_amount), 0) AS total_claimed
				FROM account_expenses
				WHERE account_id = ?
					AND expenses_tax_category = ?
					AND expenses_tax_eligible = 'Yes'
					AND YEAR(expenses_date) = ?
					AND ai_processing_status = 'Completed'`,
				[account_id, tax_id, claimYear]
			);
			const totalClaimed    = Number(sumResult[0]?.total_claimed) || 0;
			const claimedAmount   = Math.min(totalClaimed, Number(taxMaxClaim));

			await db.raw(
				`INSERT INTO account_tax_claim
					(account_id, tax_year, tax_id, taxsub_id, claimed_amount, max_claimable, claim_for, claim_status, status)
				VALUES
					(?, ?, ?, ?, ?, ?, 'Self', 'Draft', 'Active')
				ON DUPLICATE KEY UPDATE
					claimed_amount = ?,
					max_claimable  = VALUES(max_claimable),
					last_modified  = NOW()`,
				[account_id, claimYear, tax_id, taxsub_id, claimedAmount, taxMaxClaim, claimedAmount]
			);
			console.log(`[AI-Receipt Worker] Tax claim upserted: account_id=${account_id}, tax_id=${tax_id}, year=${claimYear}, claimed=${claimedAmount}/${taxMaxClaim}`);
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

// Worker event handlers
const setupWorkerEvents = (queue, name) => {
	queue.on("completed", (job, result) => {
		console.log(`[${name}] Job ${job.id} completed successfully`);
	});

	queue.on("failed", (job, err) => {
		console.error(`[${name}] Job ${job.id} failed:`, err.message);
	});

	queue.on("stalled", (job) => {
		console.warn(`[${name}] Job ${job.id} stalled`);
	});

	queue.on("error", (error) => {
		console.error(`[${name}] Queue error:`, error);
	});
};

setupWorkerEvents(emailQueue, "Email");
setupWorkerEvents(notificationQueue, "Notification");
setupWorkerEvents(paymentQueue, "Payment");
setupWorkerEvents(defaultQueue, "Default");
setupWorkerEvents(aiReceiptQueue, "AI-Receipt");

console.log("🚀 Worker started and listening for jobs...");
console.log("   - Email queue");
console.log("   - Notification queue");
console.log("   - Payment queue");
console.log("   - Default queue");
console.log("   - AI Receipt queue");