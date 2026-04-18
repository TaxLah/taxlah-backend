const jwt = require("jsonwebtoken");
const { UNAUTHORIZED_API_RESPONSE, ERROR_MISSING_TOKEN, ERROR_UNAUTHENTICATED } = require("./helper");

const verifyUser = (payload) => {
	return true;
};

const auth = (secret) => {
	return (req, res, next) => {
		const _secret = secret || process.env.APP_SECRET;
		try {
			if (req.headers.authorization) {
				const token 	= req.headers.authorization.split(" ")[1];
				const payload 	= jwt.verify(token, _secret);
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

const superauth = (secret) => {
	return (req, res, next) => {
		const _secret = secret || process.env.ADMIN_SECRET;
		try {
			if (req.headers.authorization) {
				const token 	= req.headers.authorization.split(" ")[1];
				const payload 	= jwt.verify(token, _secret);
				if (verifyUser(payload)) {
					req.payload = payload;
					next();
				} else {
					res.status(400).send("Failed Authentication");
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

module.exports = {
  auth,
  superauth
};
