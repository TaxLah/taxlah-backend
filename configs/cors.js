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
		console.log("Log Origin : ", origin);
		if (whitelist.indexOf(origin) !== -1) {
			callback(null, true);
		} else {
			callback(new Error("Not allowed by CORS"));
		}
	},
};

module.exports = corsOptions;
