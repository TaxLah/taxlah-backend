/**
 * Test Helpers
 * Utility functions for testing
 */

const jwt       = require("jsonwebtoken");
const bcrypt    = require("bcryptjs");
const { faker } = require("@faker-js/faker");

const JWT_SECRET = process.env.JWT_SECRET || "test-secret-key";

/**
 * Generate a test JWT token
 */
const generateToken = (payload, expiresIn = "1h") => {
	return jwt.sign(payload, JWT_SECRET, { expiresIn });
};

/**
 * Generate a test user token
 */
const generateUserToken = (userId = 1, role = "user") => {
	return generateToken({
		id: userId,
		role: role,
		email: `user${userId}@test.com`,
	});
};

/**
 * Generate an admin token
 */
const generateAdminToken = (userId = 1) => {
	return generateToken({
		id: userId,
		role: "admin",
		email: "admin@test.com",
	});
};

/**
 * Hash a password
 */
const hashPassword = async (password) => {
	return bcrypt.hash(password, 10);
};

/**
 * Generate fake user data
 */
const generateFakeUser = async (overrides = {}) => {
	return {
		name: faker.person.fullName(),
		email: faker.internet.email().toLowerCase(),
		password: await hashPassword("Password123!"),
		role: "user",
		status: "active",
		...overrides,
	};
};

/**
 * Generate fake expense data
 */
const generateFakeExpense = (overrides = {}) => {
	const categories = [
		"lifestyle",
		"medical",
		"education",
		"insurance",
		"parental",
	];
	return {
		category: faker.helpers.arrayElement(categories),
		amount: faker.number.float({ min: 10, max: 2500, fractionDigits: 2 }),
		description: faker.commerce.productDescription(),
		receipt_date: faker.date.recent().toISOString().split("T")[0],
		...overrides,
	};
};

/**
 * Generate fake receipt data
 */
const generateFakeReceipt = (overrides = {}) => {
	return {
		merchant_name: faker.company.name(),
		total_amount: faker.number.float({
			min: 10,
			max: 1000,
			fractionDigits: 2,
		}),
		receipt_date: faker.date.recent().toISOString().split("T")[0],
		category: "lifestyle",
		...overrides,
	};
};

/**
 * Wait for a specified time (useful for rate limit tests)
 */
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Create authorization header
 */
const authHeader = (token) => ({
	Authorization: `Bearer ${token}`,
});

module.exports = {
	generateToken,
	generateUserToken,
	generateAdminToken,
	hashPassword,
	generateFakeUser,
	generateFakeExpense,
	generateFakeReceipt,
	wait,
	authHeader,
	JWT_SECRET,
};
