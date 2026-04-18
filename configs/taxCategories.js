// src/constants/taxCategories.js

const MY_TAX_RELIEF_CATEGORIES = {
	// =========================
	// MEDICAL
	// =========================
	MEDICAL_SELF: {
		code: "MY_MED_SELF",
		label: "Medical Treatment (Self/Spouse/Child)",
		maxRelief: 8000,
		description:
			"Medical expenses for serious diseases, fertility treatment, vaccination, dental treatment, medical checkups, hospital bills",
	},

	MEDICAL_PARENTS: {
		code: "MY_MED_PARENTS",
		label: "Medical Treatment for Parents",
		maxRelief: 8000,
		description:
			"Medical, dental, nursing, and care expenses for parents including hospital bills and treatment",
	},

	DISABLED_EQUIPMENT: {
		code: "MY_DISABLED",
		label: "Equipment for Disabled Person",
		maxRelief: 6000,
		description:
			"Purchase of medical equipment for disabled individuals including wheelchair, hearing aid, prosthetics",
	},

	// =========================
	// EDUCATION
	// =========================
	EDUCATION_SELF: {
		code: "MY_EDU_SELF",
		label: "Education Fees (Self)",
		maxRelief: 7000,
		description:
			"Tuition fees for diploma, degree, masters, professional courses at recognised institutions in Malaysia",
	},

	// =========================
	// LIFESTYLE
	// =========================
	LIFESTYLE: {
		code: "MY_LIFESTYLE",
		label: "Lifestyle Relief",
		maxRelief: 2500,
		description:
			"Purchase of personal computer (PC), laptop, MacBook, smartphone, tablet, internet subscription, books, newspapers, digital subscriptions (Netflix, Spotify), gym membership, sports equipment",
	},

	LIFESTYLE_SPORTS: {
		code: "MY_LIFESTYLE_SPORTS",
		label: "Lifestyle - Sports",
		maxRelief: 500,
		description:
			"Sports equipment, gym membership, rental, training fees, and registration fees for sports competitions or activities",
	},

	// =========================
	// FAMILY / CHILD
	// =========================
	CHILDCARE: {
		code: "MY_CHILDCARE",
		label: "Child Care Fees",
		maxRelief: 3000,
		description:
			"Fees paid to registered childcare centres or kindergartens for children aged 6 and below",
	},

	BREASTFEEDING: {
		code: "MY_BREASTFEEDING",
		label: "Breastfeeding Equipment",
		maxRelief: 1000,
		description:
			"Breast pump, milk storage equipment, and accessories for child up to 2 years old",
	},

	// =========================
	// TECHNOLOGY / EV
	// =========================
	EV_CHARGING: {
		code: "MY_EV",
		label: "EV Charging Facilities",
		maxRelief: 2500,
		description:
			"Purchase or installation of electric vehicle (EV) charging equipment for personal use",
	},

	// =========================
	// INSURANCE / FINANCIAL (non-receipt but important)
	// =========================
	LIFE_INSURANCE_EPF: {
		code: "MY_LIFE_EPF",
		label: "Life Insurance & EPF",
		maxRelief: 7000,
		description:
			"Life insurance premiums and EPF contributions (usually auto-filled, not receipt-based)",
	},

	EDUCATION_INSURANCE: {
		code: "MY_EDU_INSURANCE",
		label: "Education & Medical Insurance",
		maxRelief: 3000,
		description:
			"Premiums for education insurance and medical insurance policies",
	},

	PRS: {
		code: "MY_PRS",
		label: "Private Retirement Scheme (PRS)",
		maxRelief: 3000,
		description:
			"Voluntary contributions to PRS or deferred annuity schemes",
	},

	SOCSO: {
		code: "MY_SOCSO",
		label: "SOCSO Contribution",
		maxRelief: 350,
		description:
			"SOCSO (PERKESO) contributions for employees",
	},

	// =========================
	// SPECIAL CASES
	// =========================
	DONATION: {
		code: "MY_DONATION",
		label: "Donation / Gift",
		maxRelief: null,
		description:
			"Donations to approved institutions or government bodies (subject to % limits of aggregate income)",
	},

	ZAKAT: {
		code: "MY_ZAKAT",
		label: "Zakat / Fitrah",
		maxRelief: null,
		description:
			"Zakat payments (rebate, not relief) paid to authorised institutions",
	},

	// =========================
	// FALLBACK
	// =========================
	NOT_ELIGIBLE: {
		code: "NOT_ELIGIBLE",
		label: "Not Eligible for Tax Relief",
		maxRelief: 0,
		description:
			"Expense does not qualify under Malaysian income tax relief categories",
	},
};

module.exports = MY_TAX_RELIEF_CATEGORIES;