const NODE_ENV = process.env.NODE_ENV || "development";

// Origins allowed to make credentialed requests.
//
// Credentialed requests (the admin portal now sends its session cookie) cannot be served
// with `Access-Control-Allow-Origin: *`, so a whitelist is required in every environment —
// the previous bare `cors()` fallback for non-production silently broke cookie auth.
const whitelist = [
	"http://localhost:3000",
	"http://localhost:3100",
	"http://localhost:4000",
	"http://localhost:5000",
	"https://dev.taxlah.com",
	"https://staging.taxlah.com",
	"https://taxlah.com",
	"https://sysadmin.taxlah.com",
	"https://sysdev.taxlah.com",
	"https://cpdev.taxlah.com",
];

// Local dev servers (Vite, CRA) only — never allowed in production.
const devOrigins = [
	"http://localhost:5173",
	"http://localhost:4173",
	"http://localhost:3001",
	"http://127.0.0.1:5173",
];

const allowed = NODE_ENV === "production" ? whitelist : whitelist.concat(devOrigins);

var corsOptions = {
	origin: function (origin, callback) {
		// Allow requests with no Origin header:
		// mobile apps (React Native), server-to-server calls, Postman, curl, etc.
		// do not send an Origin header, so origin is undefined here.
		if (!origin || allowed.indexOf(origin) !== -1) {
			callback(null, true);
		} else {
			console.warn("CORS blocked origin: ", origin);
			callback(new Error("Not allowed by CORS"));
		}
	},
	// Required for the admin portal's httpOnly session cookie to be sent and accepted.
	credentials: true,
	exposedHeaders: ["X-CSRF-Token"],
};

module.exports = corsOptions;
