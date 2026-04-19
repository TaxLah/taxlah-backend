require("./envfunc")();
const { PORT = 3000, SECRET = "secret", NODE_ENV = "development" } = process.env;
console.log(PORT);

const os 			= require("os")

const cors 			= require("cors");
const corsOptions 	= require("./configs/cors.js");

const express 		= require("express");
const app 			= express();

const morgan 		= require("morgan");

const fs 			= require("fs")

const winkNLP 		= require('wink-nlp');
const model			= require('wink-eng-lite-web-model');
const nlp 			= winkNLP(model);
const its 			= nlp.its;
const as 			= nlp.as;

const { Logger } 							= require("./utils/logger.js");
const { initCronJobs } = require("./cronjob/index.js");
require("./queue/worker.js");

NODE_ENV === "production" ? app.use(cors(corsOptions)) : app.use(cors());
app.use(express.static("assets"));

app.use('/api/subscription/webhook', express.raw({ type: 'application/json' }));
app.use('/api/credit/webhook', express.raw({ type: 'application/json' }));

app.use(express.json());
app.use(morgan("tiny"));

app.get("/", (req, res) => {
	res.json({ hello: "Hello World!" });
});

app.use("/api", require("./routers/AppRouter"))
app.use("/api/test", require("./routers/TestRouter"))
app.use("/admin", require("./routers/AdminRouter"))
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
