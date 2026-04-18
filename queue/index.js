const Queue = require("bull");

// Redis configuration
const redisConfig = {
	host: process.env.REDIS_HOST || "127.0.0.1",
	port: parseInt(process.env.REDIS_PORT) || 6379,
	password: process.env.REDIS_PASSWORD || undefined,
};

// Create queues
const emailQueue        = new Queue("email", { redis: redisConfig });
const notificationQueue = new Queue("notification", { redis: redisConfig });
const paymentQueue      = new Queue("payment", { redis: redisConfig });
const defaultQueue      = new Queue("default", { redis: redisConfig });
const aiReceiptQueue    = new Queue("ai-receipt", { redis: redisConfig });

// Queue event handlers
const setupQueueEvents = (queue, name) => {
	queue.on("completed", (job) => {
		console.log(`[${name}] Job ${job.id} completed`);
	});

	queue.on("failed", (job, err) => {
		console.error(`[${name}] Job ${job.id} failed:`, err.message);
	});

	queue.on("error", (error) => {
		console.error(`[${name}] Queue error:`, error);
	});
};

setupQueueEvents(emailQueue, "Email");
setupQueueEvents(notificationQueue, "Notification");
setupQueueEvents(paymentQueue, "Payment");
setupQueueEvents(defaultQueue, "Default");
setupQueueEvents(aiReceiptQueue, "AI-Receipt");

const queues = {
	email: emailQueue,
	notification: notificationQueue,
	payment: paymentQueue,
	default: defaultQueue,
	"ai-receipt": aiReceiptQueue,

	/**
	 * Add job to a queue
	 */
	add: async (queueName, jobName, data, options = {}) => {
		const queue = queues[queueName] || defaultQueue;
		const defaultOptions = {
			attempts: 3
		};

		const job = await queue.add(jobName, data, { ...defaultOptions, ...options, priority: options.priority || 5 });
		return job;
	},

	/**
	 * Add delayed job
	 */
	addDelayed: async (queueName, jobName, data, delayMs, options = {}) => {
		return await queues.add(queueName, jobName, data, { ...options, delay: delayMs });
	},

	/**
	 * Add scheduled job (run at specific time)
	 */
	addScheduled: async (queueName, jobName, data, date, options = {}) => {
		const delay = new Date(date).getTime() - Date.now();
		if (delay < 0) {
			throw new Error("Scheduled time must be in the future");
		}
		return await queues.add(queueName, jobName, data, { ...options, delay });
	},

	/**
	 * Add repeating job
	 */
	addRepeating: async (queueName, jobName, data, repeat, options = {}) => {
		const queue = queues[queueName] || defaultQueue;
		return await queue.add(jobName, data, { ...options, repeat });
	},

	/**
	 * Get job by ID
	 */
	getJob: async (queueName, jobId) => {
		const queue = queues[queueName] || defaultQueue;
		return await queue.getJob(jobId);
	},

	/**
	 * Get queue stats
	 */
	getStats: async (queueName) => {
		const queue = queues[queueName] || defaultQueue;
		const [waiting, active, completed, failed, delayed] = await Promise.all([
			queue.getWaitingCount(),
			queue.getActiveCount(),
			queue.getCompletedCount(),
			queue.getFailedCount(),
			queue.getDelayedCount(),
		]);

		return { waiting, active, completed, failed, delayed };
	},

	/**
	 * Clean old jobs
	 */
	clean: async (queueName, grace = 3600000, status = "completed") => {
		const queue = queues[queueName] || defaultQueue;
		return await queue.clean(grace, status);
	},

	/**
	 * Pause queue
	 */
	pause: async (queueName) => {
		const queue = queues[queueName] || defaultQueue;
		await queue.pause();
	},

	/**
	 * Resume queue
	 */
	resume: async (queueName) => {
		const queue = queues[queueName] || defaultQueue;
		await queue.resume();
	},
};

module.exports = queues;