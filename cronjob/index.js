const cron  = require("node-cron");
const db    = require("../utils/sqlbuilder");

// Store scheduled tasks for management
const scheduledTasks = new Map();

const scheduler = {
	/**
	 * Schedule a task with cron expression
	 * 
	 * Cron format: second(optional) minute hour day-of-month month day-of-week
	 * Examples:
	 *   "0 * * * *"      - Every hour
	 *   "0 0 * * *"      - Every day at midnight
	 *   "0 9 * * 1"      - Every Monday at 9 AM
	 *   "0 0 1 * *"      - First day of every month
	 */
	schedule: (name, cronExpression, task, options = {}) => {
		if (scheduledTasks.has(name)) {
			console.warn(`Task "${name}" already exists. Stopping old task.`);
			scheduler.stop(name);
		}

		const defaultOptions = {
			scheduled: true,
			timezone: "Asia/Kuala_Lumpur",
		};

		const scheduledTask = cron.schedule(
			cronExpression,
			async () => {
				console.log(`[Cron] Running task: ${name}`);
				try {
					await task();
					console.log(`[Cron] Task "${name}" completed`);
				} catch (error) {
					console.error(`[Cron] Task "${name}" failed:`, error);
				}
			},
			{ ...defaultOptions, ...options }
		);

		scheduledTasks.set(name, {
			task: scheduledTask,
			expression: cronExpression,
			createdAt: new Date(),
		});

		console.log(`[Cron] Scheduled task: ${name} (${cronExpression})`);
		return scheduledTask;
	},

	/**
	 * Stop a scheduled task
	 */
	stop: (name) => {
		const scheduled = scheduledTasks.get(name);
		if (scheduled) {
			scheduled.task.stop();
			scheduledTasks.delete(name);
			console.log(`[Cron] Stopped task: ${name}`);
			return true;
		}
		return false;
	},

	/**
	 * Start a stopped task
	 */
	start: (name) => {
		const scheduled = scheduledTasks.get(name);
		if (scheduled) {
			scheduled.task.start();
			console.log(`[Cron] Started task: ${name}`);
			return true;
		}
		return false;
	},

	/**
	 * List all scheduled tasks
	 */
	list: () => {
		const tasks = [];
		scheduledTasks.forEach((value, key) => {
			tasks.push({
				name: key,
				expression: value.expression,
				createdAt: value.createdAt,
			});
		});
		return tasks;
	},

	/**
	 * Validate cron expression
	 */
	validate: (expression) => {
		return cron.validate(expression);
	},

	/**
	 * Stop all tasks
	 */
	stopAll: () => {
		scheduledTasks.forEach((value, key) => {
			value.task.stop();
		});
		scheduledTasks.clear();
		console.log("[Cron] All tasks stopped");
	},
};

// ============================================
// Define your cron jobs here
// ============================================

const initCronJobs = () => {
	// Check and expire subscriptions daily at 1 AM
	scheduler.schedule("expire-subscriptions", "0 1 * * *", async () => {
		const SubscriptionService = require("../models/AppModel/SubscriptionService");
		try {
			const result = await SubscriptionService.processExpiredSubscriptions();
			console.log("[Cron] Subscription expiry check completed:", result);
		} catch (error) {
			console.error("[Cron] Subscription expiry check failed:", error);
		}
	});

	// Send expiry reminders daily at 9 AM (for subscriptions expiring in 3 days)
	scheduler.schedule("subscription-expiry-reminders", "0 9 * * *", async () => {
		const SubscriptionService = require("../models/AppModel/SubscriptionService");
		try {
			const result = await SubscriptionService.sendExpiryReminders();
			console.log("[Cron] Expiry reminders sent:", result);
		} catch (error) {
			console.error("[Cron] Expiry reminders failed:", error);
		}
	});

	// Example: Clean up expired sessions every hour
	scheduler.schedule("cleanup-sessions", "0 * * * *", async () => {
		// await db.raw("DELETE FROM sessions WHERE expires_at < NOW()");
		console.log("Cleaned up expired sessions");
	});

	// Example: Send daily report at 9 AM
	scheduler.schedule("daily-report", "0 9 * * *", async () => {
		// const stats = await db.raw("SELECT COUNT(*) as total FROM orders WHERE DATE(created_at) = CURDATE()");
		// await email.send({ to: 'admin@example.com', subject: 'Daily Report', ... });
		console.log("Daily report sent");
	});

	// Example: Check pending payments every 5 minutes
	scheduler.schedule("check-payments", "*/5 * * * *", async () => {
		// const pending = await db.select("payments", { status: "pending" });
		// pending.forEach(payment => { ... });
		console.log("Checked pending payments");
	});

	// Example: Monthly subscription renewal on 1st of each month
	scheduler.schedule("subscription-renewal", "0 0 1 * *", async () => {
		// Handle subscription renewals
		console.log("Processing subscription renewals");
	});

	// Example: Cleanup old logs every Sunday at 2 AM
	scheduler.schedule("cleanup-logs", "0 2 * * 0", async () => {
		// await db.raw("DELETE FROM logs WHERE created_at < DATE_SUB(NOW(), INTERVAL 30 DAY)");
		console.log("Cleaned up old logs");
	});

	console.log(`[Cron] Initialized ${scheduledTasks.size} cron jobs`);
};

module.exports = { scheduler, initCronJobs };