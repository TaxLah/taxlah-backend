require("./envfunc")();
const { PORT = 3000, SECRET = "secret", NODE_ENV = "development" } = process.env;
console.log(PORT);

const os 				= require("os")
const cors 				= require("cors");
const corsOptions 		= require("./configs/cors.js");
const express 			= require("express");
const app 				= express();
	
const morgan 			= require("morgan");
const cookieParser 		= require("cookie-parser");
const fs 				= require("fs")

const { Logger } 		= require("./utils/logger.js");
const { initCronJobs } 	= require("./cronjob/index.js");
const { superauth } 	= require("./configs/auth.js");
const ConfigService 	= require("./services/ConfigService.js");

require("./queue/worker.js");

// Subscribe to credential-change notifications before serving traffic. In cluster mode
// this is what lets a key saved in the admin portal reach every worker without a restart.
ConfigService.init();

// Behind nginx, so req.ip must come from X-Forwarded-For — otherwise every request looks
// like it originates from the proxy and the rate limiters throttle all users as one.
app.set('trust proxy', 1);

// Whitelist in every environment. A bare cors() sends Access-Control-Allow-Origin: *,
// which browsers refuse to combine with credentialed requests — that would break the
// admin portal's cookie session outside production.
app.use(cors(corsOptions));

// User-uploaded content. nosniff stops the browser second-guessing the Content-Type we
// derive from the extension, and the CSP neuters anything that does slip through as HTML.
const userContentHeaders = (res) => {
	res.setHeader('X-Content-Type-Options', 'nosniff');
	res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; object-src 'none'; sandbox");
};

app.use('/asset', express.static("asset", { setHeaders: userContentHeaders }));
app.use('/assets', express.static("assets", { setHeaders: userContentHeaders }));

app.use('/api/subscription/webhook', express.raw({ type: 'application/json' }));
app.use('/api/credit/webhook', express.raw({ type: 'application/json' }));

app.use(express.json());
app.use(cookieParser());
app.use(morgan("tiny"));

app.get("/", (req, res) => {
	res.json({ hello: "Hello World!" });
});

app.use("/api", require("./routers/AppRouter"))

// Debug-only router: open mail relay, arbitrary push, bulk subscription mutation.
// Never mount in production.
if (NODE_ENV !== "production") {
	app.use("/api/test", require("./routers/TestRouter"))
}

// Legacy admin surface. The admin portal talks to /superadmin, not /admin — this router
// is kept behind superauth() so any forgotten caller shows up as a 401 in the access log
// instead of a silent 404. Remove entirely once the logs come back clean.
app.use("/admin", superauth(), require("./routers/AdminRouter"))

app.use("/superadmin", require("./routers/SuperAdminRouter"))
app.use("/file-uploader", require("./routers/FileUploader"))

// 404 handler (path not found)
app.use((req, res, next) => {
	return res.status(404).json({
		status_code: 404,
		status: "error",
		message: `Route ${req.originalUrl} not found`,
		data: null
	});
});

// Global error handler.
// Without this, a multer rejection (file too large, disallowed type) falls through to
// Express's default HTML error page — which the mobile app cannot parse, so the user just
// sees "Network Error" instead of the real reason.
app.use((err, req, res, next) => {
	if (res.headersSent) {
		return next(err);
	}

	const MULTER_STATUS = {
		LIMIT_FILE_SIZE: [413, "File is too large. Maximum size is 15MB."],
		LIMIT_FILE_COUNT: [400, "Too many files uploaded."],
		LIMIT_UNEXPECTED_FILE: [400, "Unexpected file field."],
		LIMIT_UNEXPECTED_FILE_TYPE: [415, err.message]
	};

	const mapped = MULTER_STATUS[err.code];
	const status_code = mapped ? mapped[0] : 500;
	const message = mapped
		? mapped[1]
		: "Internal Server Error. Please contact our support for more information.";

	// Log the full error server-side; never leak stack traces to the client.
	console.error(`[ERROR] ${req.method} ${req.originalUrl} ->`, err);
	Logger("error.log", `${req.method} ${req.originalUrl} :: ${err.code || "ERR"} :: ${err.message}`);

	return res.status(status_code).json({
		status_code,
		status: "error",
		message,
		data: null
	});
});

// Helper function to get local IP address
function getLocalIPAddress() {
	const interfaces = os.networkInterfaces();
	// console.log("Log of network interfaces:", interfaces);
	
	for (const name of Object.keys(interfaces)) {
		for (const iface of interfaces[name]) {
			// Skip internal (loopback) and non-IPv4 addresses
			if (iface.family === 'IPv4' && !iface.internal) {
				return iface.address;
			}
		}
	}
	return 'localhost'; // fallback
}

// Engine Listener
app.listen(PORT, async () => {

	const localIP = getLocalIPAddress();
	console.log(`Your are listening on port ${PORT}`);
	Logger("server.log", `Server started on port ${PORT} in ${NODE_ENV} mode.`);

	console.log(`
	╔════════════════════════════════════════════╗
	║                                            ║
	║   🚀 Server running on port ${PORT}           ║
	║   📍 http://localhost:${PORT}                 ║
	║   📍 http://${localIP}:${PORT}${' '.repeat(Math.max(0, 19 - localIP.length))}║
	║   🌍 Environment: ${(process.env.NODE_ENV || "development").padEnd(18)}║
	║                                            ║
	╚════════════════════════════════════════════╝
	`);

	console.log("DB HOST : ", process.env.DB_HOST)
	console.log("DB USERNAME : ", process.env.DB_USERNAME)
	console.log("DB DATABASE : ", process.env.DB_DATABASE)

	if(!fs.existsSync("./asset")) {
		fs.mkdirSync("./asset")
	}

	if(!fs.existsSync("./assets")) {
		fs.mkdirSync("./assets")
	}

	if(!fs.existsSync("./assets/document")) {
		fs.mkdirSync("./assets/document")
	}

	if(!fs.existsSync("./assets/image")) {
		fs.mkdirSync("./assets/image")
	}

	if(!fs.existsSync("./assets/logs")) {
		fs.mkdirSync("./assets/logs")
	}

	if(!fs.existsSync("./asset/document")) {
		fs.mkdirSync("./asset/document")
	}

	if(!fs.existsSync("./asset/image")) {
		fs.mkdirSync("./asset/image")
	}

	if(!fs.existsSync("./asset/logs")) {
		fs.mkdirSync("./asset/logs")
	}

	initCronJobs();
});
