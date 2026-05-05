var whitelist = [
	"https://dev.taxlah.com",
	"https://staging.taxlah.com",
	"https://taxlah.com",
	"https://localhost:3000",
	"https://localhost:4000",
	"https://localhost:5000",
	"https://sysadmin.taxlah.com",
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
