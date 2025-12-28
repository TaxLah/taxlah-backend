/**
 * Dependant Controller
 * API endpoints for managing user dependants (spouse, children, parents)
 */

const express = require("express");
const router = express.Router();
const {
	DEFAULT_API_RESPONSE,
	INTERNAL_SERVER_ERROR_API_RESPONSE,
	BAD_REQUEST_API_RESPONSE,
	SUCCESS_API_RESPONSE,
	UNAUTHORIZED_API_RESPONSE,
	NOT_FOUND_API_RESPONSE,
	ERROR_UNAUTHENTICATED,
	CHECK_EMPTY,
	sanitize,
} = require("../../../configs/helper");
const {
	getDependantsList,
	getDependantDetails,
	createDependant,
	updateDependant,
	deleteDependant,
	getDependantStats,
	calculateChildReliefEligibility,
} = require("../../../models/AppModel/Dependant");

/**
 * GET /api/dependant
 * Get list of user's dependants
 * Query params: type (optional), status (optional)
 */
router.get("/", async (req, res) => {
	let response = DEFAULT_API_RESPONSE;
	let user = req.user || null;

	if (CHECK_EMPTY(user)) {
		response = UNAUTHORIZED_API_RESPONSE;
		response.message = ERROR_UNAUTHENTICATED;
		return res.status(response.status_code).json(response);
	}

	try {
		const params = {
			type: req.query.type || null,
			status: req.query.status || "Active",
		};

		const result = await getDependantsList(user.account_id, params);

		if (result.status) {
			response = SUCCESS_API_RESPONSE;
			response.message = "Dependants retrieved successfully.";
			response.data = result.data;
		} else {
			response = INTERNAL_SERVER_ERROR_API_RESPONSE;
			response.message = result.error || "Failed to retrieve dependants.";
		}

		res.status(response.status_code).json(response);
	} catch (error) {
		console.error("Error Get Dependants List:", error);
		response = INTERNAL_SERVER_ERROR_API_RESPONSE;
		response.message = "An error occurred while retrieving dependants.";
		res.status(response.status_code).json(response);
	}
});

/**
 * GET /api/dependant/stats
 * Get dependant statistics for the user
 */
router.get("/stats", async (req, res) => {
	let response = DEFAULT_API_RESPONSE;
	let user = req.user || null;

	if (CHECK_EMPTY(user)) {
		response = UNAUTHORIZED_API_RESPONSE;
		response.message = ERROR_UNAUTHENTICATED;
		return res.status(response.status_code).json(response);
	}

	try {
		const result = await getDependantStats(user.account_id);

		if (result.status) {
			response = SUCCESS_API_RESPONSE;
			response.message = "Dependant statistics retrieved successfully.";
			response.data = result.data;
		} else {
			response = INTERNAL_SERVER_ERROR_API_RESPONSE;
			response.message = result.error || "Failed to retrieve statistics.";
		}

		res.status(response.status_code).json(response);
	} catch (error) {
		console.error("Error Get Dependant Stats:", error);
		response = INTERNAL_SERVER_ERROR_API_RESPONSE;
		response.message = "An error occurred while retrieving statistics.";
		res.status(response.status_code).json(response);
	}
});

/**
 * GET /api/dependant/child-relief
 * Calculate child relief eligibility based on dependants
 */
router.get("/child-relief", async (req, res) => {
	let response = DEFAULT_API_RESPONSE;
	let user = req.user || null;

	if (CHECK_EMPTY(user)) {
		response = UNAUTHORIZED_API_RESPONSE;
		response.message = ERROR_UNAUTHENTICATED;
		return res.status(response.status_code).json(response);
	}

	try {
		const taxYear = parseInt(req.query.year) || new Date().getFullYear();
		const result = await calculateChildReliefEligibility(
			user.account_id,
			taxYear
		);

		if (result.status) {
			response = SUCCESS_API_RESPONSE;
			response.message =
				"Child relief eligibility calculated successfully.";
			response.data = result.data;
		} else {
			response = INTERNAL_SERVER_ERROR_API_RESPONSE;
			response.message =
				result.error || "Failed to calculate child relief.";
		}

		res.status(response.status_code).json(response);
	} catch (error) {
		console.error("Error Calculate Child Relief:", error);
		response = INTERNAL_SERVER_ERROR_API_RESPONSE;
		response.message = "An error occurred while calculating child relief.";
		res.status(response.status_code).json(response);
	}
});

/**
 * GET /api/dependant/:id
 * Get single dependant details
 */
router.get("/:id", async (req, res) => {
	let response = DEFAULT_API_RESPONSE;
	let user = req.user || null;

	if (CHECK_EMPTY(user)) {
		response = UNAUTHORIZED_API_RESPONSE;
		response.message = ERROR_UNAUTHENTICATED;
		return res.status(response.status_code).json(response);
	}

	try {
		const dependantId = parseInt(req.params.id);

		if (isNaN(dependantId)) {
			response = BAD_REQUEST_API_RESPONSE;
			response.message = "Invalid dependant ID.";
			return res.status(response.status_code).json(response);
		}

		const result = await getDependantDetails(dependantId, user.account_id);

		if (result.status) {
			response = SUCCESS_API_RESPONSE;
			response.message = "Dependant details retrieved successfully.";
			response.data = result.data;
		} else {
			response = NOT_FOUND_API_RESPONSE;
			response.message = result.message || "Dependant not found.";
		}

		res.status(response.status_code).json(response);
	} catch (error) {
		console.error("Error Get Dependant Details:", error);
		response = INTERNAL_SERVER_ERROR_API_RESPONSE;
		response.message =
			"An error occurred while retrieving dependant details.";
		res.status(response.status_code).json(response);
	}
});

/**
 * POST /api/dependant
 * Create new dependant
 * Body: { dependant_name, dependant_fullname, dependant_type, dependant_dob, ... }
 */
router.post("/", async (req, res) => {
	let response = DEFAULT_API_RESPONSE;
	let user = req.user || null;

	if (CHECK_EMPTY(user)) {
		response = UNAUTHORIZED_API_RESPONSE;
		response.message = ERROR_UNAUTHENTICATED;
		return res.status(response.status_code).json(response);
	}

	try {
		const params = req.body;

		// Validation
		if (CHECK_EMPTY(params.dependant_name)) {
			response = BAD_REQUEST_API_RESPONSE;
			response.message = "Dependant name is required.";
			return res.status(response.status_code).json(response);
		}

		if (CHECK_EMPTY(params.dependant_type)) {
			response = BAD_REQUEST_API_RESPONSE;
			response.message = "Dependant type is required.";
			return res.status(response.status_code).json(response);
		}

		const validTypes = [
			"Spouse",
			"Child",
			"Sibling",
			"Parent",
			"Relative",
			"Other",
		];
		if (!validTypes.includes(params.dependant_type)) {
			response = BAD_REQUEST_API_RESPONSE;
			response.message = `Invalid dependant type. Must be one of: ${validTypes.join(
				", "
			)}`;
			return res.status(response.status_code).json(response);
		}

		// Check spouse limit (only 1 spouse allowed)
		if (params.dependant_type === "Spouse") {
			const existing = await getDependantsList(user.account_id, {
				type: "Spouse",
			});
			if (existing.status && existing.data.length > 0) {
				response = BAD_REQUEST_API_RESPONSE;
				response.message = "You can only have one spouse registered.";
				return res.status(response.status_code).json(response);
			}
		}

		// Build dependant data
		const dependantData = {
			account_id: user.account_id,
			dependant_name: sanitize(params.dependant_name),
			dependant_fullname: params.dependant_fullname
				? sanitize(params.dependant_fullname)
				: null,
			dependant_email: params.dependant_email || null,
			dependant_phone: params.dependant_phone || null,
			dependant_ic: params.dependant_ic || null,
			dependant_gender: params.dependant_gender || null,
			dependant_dob: params.dependant_dob || null,
			dependant_type: params.dependant_type,
			dependant_is_disabled: params.dependant_is_disabled || "No",
			dependant_disability_type: params.dependant_disability_type || null,
			dependant_is_studying: params.dependant_is_studying || "No",
			dependant_education_level: params.dependant_education_level || null,
			dependant_institution_name:
				params.dependant_institution_name || null,
			dependant_institution_country: 
                params.dependant_institution_country || "Malaysia",
			status: "Active",
		};

		const result = await createDependant(dependantData);

		if (result.status) {
			response = SUCCESS_API_RESPONSE;
			response.status_code = 201;
			response.message = "Dependant created successfully.";
			response.data = {
				dependant_id: result.data,
				...dependantData,
			};
		} else {
			response = INTERNAL_SERVER_ERROR_API_RESPONSE;
			response.message = result.error || "Failed to create dependant.";
		}

		res.status(response.status_code).json(response);
	} catch (error) {
		console.error("Error Create Dependant:", error);
		response = INTERNAL_SERVER_ERROR_API_RESPONSE;
		response.message = "An error occurred while creating dependant.";
		res.status(response.status_code).json(response);
	}
});

/**
 * PUT /api/dependant/:id
 * Update dependant
 */
router.put("/:id", async (req, res) => {
	let response = DEFAULT_API_RESPONSE;
	let user = req.user || null;

	if (CHECK_EMPTY(user)) {
		response = UNAUTHORIZED_API_RESPONSE;
		response.message = ERROR_UNAUTHENTICATED;
		return res.status(response.status_code).json(response);
	}

	try {
		const dependantId = parseInt(req.params.id);
		const params = req.body;

		if (isNaN(dependantId)) {
			response = BAD_REQUEST_API_RESPONSE;
			response.message = "Invalid dependant ID.";
			return res.status(response.status_code).json(response);
		}

		// Check if dependant exists and belongs to user
		const existing = await getDependantDetails(
			dependantId,
			user.account_id
		);
		if (!existing.status) {
			response = NOT_FOUND_API_RESPONSE;
			response.message = "Dependant not found.";
			return res.status(response.status_code).json(response);
		}

		// Build update data (only include provided fields)
		const updateData = {};

		if (params.dependant_name !== undefined)
			updateData.dependant_name = sanitize(params.dependant_name);
		if (params.dependant_fullname !== undefined)
			updateData.dependant_fullname = sanitize(params.dependant_fullname);
		if (params.dependant_email !== undefined)
			updateData.dependant_email = params.dependant_email;
		if (params.dependant_phone !== undefined)
			updateData.dependant_phone = params.dependant_phone;
		if (params.dependant_ic !== undefined)
			updateData.dependant_ic = params.dependant_ic;
		if (params.dependant_gender !== undefined)
			updateData.dependant_gender = params.dependant_gender;
		if (params.dependant_dob !== undefined)
			updateData.dependant_dob = params.dependant_dob;
		if (params.dependant_type !== undefined) {
			const validTypes = [
				"Spouse",
				"Child",
				"Sibling",
				"Parent",
				"Relative",
				"Other",
			];
			if (!validTypes.includes(params.dependant_type)) {
				response = BAD_REQUEST_API_RESPONSE;
				response.message = `Invalid dependant type. Must be one of: ${validTypes.join(
					", "
				)}`;
				return res.status(response.status_code).json(response);
			}
			updateData.dependant_type = params.dependant_type;
		}
		if (params.dependant_is_disabled !== undefined)
			updateData.dependant_is_disabled = params.dependant_is_disabled;
		if (params.dependant_disability_type !== undefined)
			updateData.dependant_disability_type =
				params.dependant_disability_type;
		if (params.dependant_is_studying !== undefined)
			updateData.dependant_is_studying = params.dependant_is_studying;
		if (params.dependant_education_level !== undefined)
			updateData.dependant_education_level =
				params.dependant_education_level;
		if (params.dependant_institution_name !== undefined)
			updateData.dependant_institution_name =
				params.dependant_institution_name;
		if (params.dependant_institution_country !== undefined)
			updateData.dependant_institution_country =
				params.dependant_institution_country;

		if (Object.keys(updateData).length === 0) {
			response = BAD_REQUEST_API_RESPONSE;
			response.message = "No valid fields to update.";
			return res.status(response.status_code).json(response);
		}

		const result = await updateDependant(
			dependantId,
			user.account_id,
			updateData
		);

		if (result.status) {
			response = SUCCESS_API_RESPONSE;
			response.message = "Dependant updated successfully.";
			response.data = { dependant_id: dependantId, ...updateData };
		} else {
			response = INTERNAL_SERVER_ERROR_API_RESPONSE;
			response.message = result.error || "Failed to update dependant.";
		}

		res.status(response.status_code).json(response);
	} catch (error) {
		console.error("Error Update Dependant:", error);
		response = INTERNAL_SERVER_ERROR_API_RESPONSE;
		response.message = "An error occurred while updating dependant.";
		res.status(response.status_code).json(response);
	}
});

/**
 * DELETE /api/dependant/:id
 * Delete dependant (soft delete)
 */
router.delete("/:id", async (req, res) => {
	let response = DEFAULT_API_RESPONSE;
	let user = req.user || null;

	if (CHECK_EMPTY(user)) {
		response = UNAUTHORIZED_API_RESPONSE;
		response.message = ERROR_UNAUTHENTICATED;
		return res.status(response.status_code).json(response);
	}

	try {
		const dependantId = parseInt(req.params.id);

		if (isNaN(dependantId)) {
			response = BAD_REQUEST_API_RESPONSE;
			response.message = "Invalid dependant ID.";
			return res.status(response.status_code).json(response);
		}

		// Check if dependant exists and belongs to user
		const existing = await getDependantDetails(
			dependantId,
			user.account_id
		);
		if (!existing.status) {
			response = NOT_FOUND_API_RESPONSE;
			response.message = "Dependant not found.";
			return res.status(response.status_code).json(response);
		}

		const result = await deleteDependant(dependantId, user.account_id);

		if (result.status) {
			response = SUCCESS_API_RESPONSE;
			response.message = "Dependant deleted successfully.";
			response.data = { dependant_id: dependantId };
		} else {
			response = INTERNAL_SERVER_ERROR_API_RESPONSE;
			response.message = result.error || "Failed to delete dependant.";
		}

		res.status(response.status_code).json(response);
	} catch (error) {
		console.error("Error Delete Dependant:", error);
		response = INTERNAL_SERVER_ERROR_API_RESPONSE;
		response.message = "An error occurred while deleting dependant.";
		res.status(response.status_code).json(response);
	}
});

module.exports = router;
