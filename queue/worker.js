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

console.log("🚀 Worker started and listening for jobs...");
console.log("   - Email queue");
console.log("   - Notification queue");
console.log("   - Payment queue");
console.log("   - Default queue");