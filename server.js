///////////////////////////
// Environmental Variables
///////////////////////////
require("./envfunc")();
const { PORT = 3000, SECRET = "secret", NODE_ENV = "development" } = process.env;
console.log(PORT);

//CORS
const cors 			= require("cors");
const corsOptions 	= require("./configs/cors.js");

//AUTH
const jwt 			= require("jsonwebtoken");

//Bringing in Express
const express 		= require("express");
const app 			= express();

//OTHER IMPORTS
const session 		= require("express-session");
const morgan 		= require("morgan");
const db 			= require("./utils/sqlbuilder.js");

const fs 			= require("fs")
const { decryptMiddleware, encryptData } = require("./utils/crypto.js");
const { Logger } = require("./utils/logger.js");

////////////
//MIDDLEWARE
////////////
NODE_ENV === "production" ? app.use(cors(corsOptions)) : app.use(cors());
app.use(express.static("assets"));

app.use(express.json());
app.use(morgan("tiny")); //logging

///////////////
//Routes and Routers
//////////////
app.get("/", (req, res) => {
  	res.json({ hello: "Hello World!" });
});

// Encryoted route
app.post("/enc", (req, res) => {
  	// Now `req.decryptedBody` contains your clean data
	Logger("access.log", req.body)
  	return res.json({ message: "Protected route works", data: encryptData(req.body) });
});

// Protected route
app.post("/protected", decryptMiddleware, (req, res) => {
  	// Now `req.decryptedBody` contains your clean data
  	console.log("Decrypted Data:", req.decryptedBody);
  	return res.json({ message: "Protected route works", data: req.decryptedBody });
});

// 404 handler (path not found)
app.use((req, res, next) => {
	res.status(404).json({
		status_code: 404,
		status: "error",
		message: `Route ${req.originalUrl} not found`,
		data: null
	});
});

// Engine Listener
app.listen(PORT, async () => {
  	console.log(`Your are listening on port ${PORT}`);

	let check_db = await db.raw(`SHOW DATABASES`)
	console.log("Log Check DB : ", check_db)

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
});
