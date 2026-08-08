const jwt = require("jsonwebtoken");
const { UNAUTHORIZED_API_RESPONSE, ERROR_MISSING_TOKEN, ERROR_UNAUTHENTICATED } = require("./helper");
const { COOKIE_NAME } = require("./adminSession");

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
					let response 		= { ...UNAUTHORIZED_API_RESPONSE }
					response.message 	= ERROR_UNAUTHENTICATED
					return res.status(response.status_code).json(response)
				}
			} else {
				let response 		= { ...UNAUTHORIZED_API_RESPONSE }
				response.message 	= ERROR_MISSING_TOKEN
				return res.status(response.status_code).json(response)
			}
		} catch (err) {
			console.log("err auth : ", err)
			let response = { ...UNAUTHORIZED_API_RESPONSE }
			return res.status(response.status_code).json(response)
		}
	};
};

/**
 * Superadmin authentication.
 *
 * The token is read from the httpOnly session cookie only. The Authorization header path
 * was removed deliberately: leaving it in place would keep the localStorage flow alive
 * and defeat the point of moving to cookies. Admins log in once more after this ships.
 */
const superauth = (secret) => {
	return (req, res, next) => {
		const _secret = secret || process.env.ADMIN_SECRET;
		try {
			const token = req.cookies?.[COOKIE_NAME];

			if (!token) {
				let response 		= { ...UNAUTHORIZED_API_RESPONSE }
				response.message 	= ERROR_MISSING_TOKEN
				return res.status(response.status_code).json(response)
			}

			const payload = jwt.verify(token, _secret);
			if (verifyUser(payload)) {
				req.payload = payload;
				return next();
			}

			let response 		= { ...UNAUTHORIZED_API_RESPONSE }
			response.message 	= ERROR_UNAUTHENTICATED
			return res.status(response.status_code).json(response)
		} catch (err) {
			console.log("err superauth : ", err.message)
			let response = { ...UNAUTHORIZED_API_RESPONSE }
			return res.status(response.status_code).json(response)
		}
	};
};

module.exports = {
  auth,
  superauth
};
