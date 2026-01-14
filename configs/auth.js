const jwt = require("jsonwebtoken");
const { UNAUTHORIZED_API_RESPONSE, ERROR_MISSING_TOKEN, ERROR_UNAUTHENTICATED } = require("./helper");

const verifyUser = (payload) => {
	return true;
};

const auth = (secret = process.env.APP_SECRET) => {
	return (req, res, next) => {
		try {
			if (req.headers.authorization) {
				const token 	= req.headers.authorization.split(" ")[1];
				const payload 	= jwt.verify(token, secret);
				if (verifyUser(payload)) {
					req.payload = payload;
					req.user 	= payload;
					next();
				} else {
					let response 		= UNAUTHORIZED_API_RESPONSE
					response.message 	= ERROR_UNAUTHENTICATED
					return res.status(response.status_code).json(response)
				}
			} else {
				let response 		= UNAUTHORIZED_API_RESPONSE
				response.message 	= ERROR_MISSING_TOKEN
				return res.status(response.status_code).json(response)
			}
		} catch (err) {
			console.log("err auth : ", err)
			let response = UNAUTHORIZED_API_RESPONSE
			return res.status(response.status_code).json(response)
		}
	};
};

const superauth = (secret = process.env.ADMIN_SECRET) => {
	return (req, res, next) => {
		try {
			if (req.headers.authorization) {
				const token 	= req.headers.authorization.split(" ")[1];
				const payload 	= jwt.verify(token, secret);
				if (verifyUser(payload)) {
					req.payload = payload;
					next();
				} else {
					res.status(400).send("Failed Authentication");
				}
			}
		} catch (err) {
			res.status(400).send(err);
		}
	};
};

module.exports = {
  auth,
  superauth
};
