var whitelist = [
	"http://localhost:3000",
	"http://localhost:3100",
	"http://localhost:4000",
	"http://localhost:5000",
	"https://dev.taxlah.com",
	"https://staging.taxlah.com",
	"https://taxlah.com",
	"https://sysadmin.taxlah.com",
	"https://sysdev.taxlah.com",
];
var corsOptions = {
	origin: function (origin, callback) {
		// Allow requests with no Origin header:
		// mobile apps (React Native), server-to-server calls, Postman, curl, etc.
		// do not send an Origin header, so origin is undefined here.
		if (!origin || whitelist.indexOf(origin) !== -1) {
			callback(null, true);
		} else {
			console.warn("CORS blocked origin: ", origin);
			callback(new Error("Not allowed by CORS"));
		}
	},
};

module.exports = corsOptions;
