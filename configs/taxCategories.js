const db = require("../utils/sqlbuilder")
// src/constants/taxCategories.js
// Malaysia Income Tax Relief - Year of Assessment (YA) 2025
// Reference: LHDN / Inland Revenue Board of Malaysia
// Filing year: 2026 (e-Filing deadline: 15 May 2026 for Form BE)

const MY_TAX_RELIEF_CATEGORIES = {
	// =============================================================
	// PART 1: PERSONAL / INDIVIDUAL RELIEFS (Auto-granted)
	// =============================================================

	INDIVIDUAL: {
		code: "MY_INDIVIDUAL",
		label: "Individual & Dependent Relatives",
		maxRelief: 9000,
		autoGranted: true,
		description:
			"Basic personal relief automatically granted to all resident individual taxpayers. No receipt required.",
	},

	DISABLED_SELF: {
		code: "MY_DISABLED_SELF",
		label: "Disabled Individual (Self)",
		maxRelief: 7000,
		autoGranted: false,
		description:
			"Additional relief for taxpayers certified as disabled by the Department of Social Welfare (JKM). Written certification required.",
	},

	// =============================================================
	// PART 2: SPOUSE & ALIMONY
	// =============================================================

	SPOUSE: {
		code: "MY_SPOUSE",
		label: "Husband / Wife / Alimony Payments",
		maxRelief: 4000,
		autoGranted: false,
		description:
			"Relief for supporting a spouse with no income, or for alimony payments to a former spouse. Spouse must elect joint assessment under your name. Capped at RM4,000.",
	},

	DISABLED_SPOUSE: {
		code: "MY_DISABLED_SPOUSE",
		label: "Disabled Husband / Wife",
		maxRelief: 6000,
		autoGranted: false,
		description:
			"Additional relief if your spouse is certified as disabled by the Department of Social Welfare (JKM). Spouse must reside with taxpayer.",
	},

	// =============================================================
	// PART 3: CHILDREN
	// =============================================================

	CHILD_BELOW_18: {
		code: "MY_CHILD_U18",
		label: "Child Below 18 Years Old",
		maxRelief: 2000, // per child
		perChild: true,
		autoGranted: false,
		description:
			"Relief of RM2,000 per unmarried child below the age of 18 years.",
	},

	CHILD_18_ABOVE_BASIC: {
		code: "MY_CHILD_18_BASIC",
		label: "Child Aged 18+ (Full-Time Education - Other Qualifying)",
		maxRelief: 2000, // per child
		perChild: true,
		autoGranted: false,
		description:
			"Relief for unmarried child aged 18 and above enrolled in full-time education such as A-Levels, certificate, matriculation or preparatory courses.",
	},

	CHILD_18_ABOVE_HIGHER: {
		code: "MY_CHILD_18_HIGHER",
		label: "Child Aged 18+ (Diploma in Malaysia / Degree Overseas)",
		maxRelief: 8000, // per child
		perChild: true,
		autoGranted: false,
		description:
			"Relief of RM8,000 per child for diploma level and above in Malaysia, or degree level and above overseas.",
	},

	CHILD_DISABLED: {
		code: "MY_CHILD_DISABLED",
		label: "Unmarried Disabled Child",
		maxRelief: 8000, // per child
		perChild: true,
		autoGranted: false,
		description:
			"Relief for parents with an unmarried disabled child. Disability must be verified by the Department of Social Welfare (JKM).",
	},

	CHILD_DISABLED_HIGHER_EDU: {
		code: "MY_CHILD_DISABLED_EDU",
		label: "Disabled Child - Additional Higher Education Relief",
		maxRelief: 8000, // per child, additional on top of CHILD_DISABLED
		perChild: true,
		autoGranted: false,
		description:
			"Additional relief of RM8,000 per disabled child aged 18 and above pursuing higher education (diploma level or above in Malaysia / degree level or above overseas).",
	},

	// =============================================================
	// PART 4: EDUCATION
	// =============================================================

	EDUCATION_SELF: {
		code: "MY_EDU_SELF",
		label: "Education Fees (Self)",
		maxRelief: 7000,
		subLimits: {
			skillsDevelopment: 2000,
		},
		autoGranted: false,
		description:
			"Tuition fees for postgraduate studies (Master's, PhD) or degree-level courses in law, accounting, Islamic finance, technical or vocational fields at recognised institutions in Malaysia. Sub-limit of RM2,000 for skills enhancement or self-development courses.",
	},

	SSPN: {
		code: "MY_SSPN",
		label: "Skim Simpanan Pendidikan Nasional (SSPN) Net Savings",
		maxRelief: 8000,
		autoGranted: false,
		description:
			"Net savings (deposits minus withdrawals within the same year) in SSPN accounts for children's higher education under Perbadanan Tabung Pendidikan Tinggi Nasional (PTPTN).",
	},

	// =============================================================
	// PART 5: MEDICAL
	// =============================================================

	MEDICAL_SELF: {
		code: "MY_MED_SELF",
		label: "Medical Expenses (Self / Spouse / Child)",
		maxRelief: 10000,
		subLimits: {
			vaccination: 1000,
			dentalExamination: 1000,
			medicalCheckUp: 1000,
			childLearningDisability: 6000, // children aged 18 and below
		},
		autoGranted: false,
		description:
			"Medical expenses including serious illness treatment, fertility treatment, vaccinations, dental examinations, full medical check-ups, and hospital bills for self, spouse, or child. Also covers diagnosis, early intervention or rehabilitation for children aged 18 and below with learning disabilities (sub-limit RM6,000). Vaccination, dental examination and medical check-up each capped at RM1,000.",
	},

	MEDICAL_PARENTS: {
		code: "MY_MED_PARENTS",
		label: "Medical Treatment & Care for Parents / Grandparents",
		maxRelief: 8000,
		subLimits: {
			vaccinationAndCheckUp: 1000,
		},
		autoGranted: false,
		description:
			"Medical treatment, dental treatment, nursing care, special needs care, and nursing home fees for parents or grandparents. Full medical check-ups and vaccinations for parents are included (sub-limit RM1,000).",
	},

	DISABLED_EQUIPMENT: {
		code: "MY_DISABLED_EQUIP",
		label: "Basic Supporting Equipment for Disabled Individuals",
		maxRelief: 6000,
		autoGranted: false,
		description:
			"Purchase of basic supporting equipment for a disabled individual (self, spouse, child, or parent) registered with the Department of Social Welfare. Includes wheelchair, hearing aids, dialysis machines, artificial limbs, and similar medical equipment.",
	},

	// =============================================================
	// PART 6: HOUSING LOAN INTEREST (NEW for YA 2025)
	// =============================================================

	HOUSING_LOAN_INTEREST: {
		code: "MY_HOUSING_LOAN",
		label: "Housing Loan Interest – First Home Ownership",
		maxRelief: 7000, // up to RM7,000 for property ≤ RM500k; RM5,000 for RM500k-RM750k
		subLimits: {
			propertyUpTo500k: 7000,
			property500kTo750k: 5000,
		},
		autoGranted: false,
		isNew: true,
		description:
			"NEW in YA 2025. First-time homebuyers can claim the interest portion (not full instalment) of a housing loan for a residential property with SPA signed between 1 Jan 2025 – 31 Dec 2027. Claimable for up to 3 consecutive years of assessment from the first year interest is paid. Relief cap: RM7,000 (property ≤ RM500,000) or RM5,000 (RM500,001 – RM750,000).",
	},

	// =============================================================
	// PART 7: LIFESTYLE
	// =============================================================

	LIFESTYLE: {
		code: "MY_LIFESTYLE",
		label: "Lifestyle Relief",
		maxRelief: 2500,
		autoGranted: false,
		description:
			"Purchase or subscription expenses including books, journals, magazines, internet subscription, personal computer, laptop, MacBook, smartphone, tablet, and skills enhancement or self-development courses taken for personal upskilling.",
	},

	LIFESTYLE_SPORTS: {
		code: "MY_LIFESTYLE_SPORTS",
		label: "Lifestyle Relief – Sports & Recreation",
		maxRelief: 1000, // increased from RM500 in YA 2024
		autoGranted: false,
		description:
			"Sports equipment, sports facility entrance or rental fees, sports competition registration fees, gym memberships, and sports training or coaching fees. This is a separate category from the general RM2,500 Lifestyle Relief.",
	},

	EV_CHARGING_COMPOSTING: {
		code: "MY_EV_COMPOST",
		label: "EV Charging Facilities & Food Waste Composting Machine",
		maxRelief: 2500,
		autoGranted: false,
		description:
			"Expenses for purchasing or installing electric vehicle (EV) charging equipment for personal use, subscribing to EV charging facilities, or purchasing a domestic food waste composting machine for household use.",
	},

	// =============================================================
	// PART 8: INSURANCE & FINANCIAL CONTRIBUTIONS
	// =============================================================

	LIFE_INSURANCE_EPF: {
		code: "MY_LIFE_EPF",
		label: "Life Insurance Premiums & EPF Contributions",
		maxRelief: 7000,
		autoGranted: false,
		description:
			"Life insurance or family takaful premiums and EPF (Employees Provident Fund) voluntary or mandatory contributions. Usually partially auto-populated from employer data; verify against payslip or EPF statement.",
	},

	EDUCATION_INSURANCE: {
		code: "MY_EDU_MED_INSURANCE",
		label: "Education & Medical Insurance Premiums",
		maxRelief: 4000, // increased from RM3,000 in YA 2024
		autoGranted: false,
		description:
			"Premiums paid for education insurance or medical/health insurance policies covering self, spouse, or child. Includes medical takaful contributions.",
	},

	PRS: {
		code: "MY_PRS",
		label: "Private Retirement Scheme (PRS) & Deferred Annuity",
		maxRelief: 3000,
		autoGranted: false,
		description:
			"Voluntary contributions to approved Private Retirement Scheme (PRS) accounts or deferred annuity plans. Relief extended until Year of Assessment 2030.",
	},

	SOCSO: {
		code: "MY_SOCSO",
		label: "SOCSO & EIS Contributions",
		maxRelief: 350,
		autoGranted: false,
		description:
			"Employee contributions to the Social Security Organisation (SOCSO / PERKESO) and the Employment Insurance System (EIS) under the Employment Insurance System Act 2017.",
	},

	// =============================================================
	// PART 9: CHILD & FAMILY CARE
	// =============================================================

	CHILDCARE: {
		code: "MY_CHILDCARE",
		label: "Childcare Centre & Kindergarten Fees",
		maxRelief: 3000,
		autoGranted: false,
		description:
			"Fees paid to registered childcare centres or kindergartens for children aged 6 years and below. Centre must be registered with the relevant authority.",
	},

	BREASTFEEDING: {
		code: "MY_BREASTFEEDING",
		label: "Breastfeeding Equipment",
		maxRelief: 1000,
		claimFrequency: "once every 2 years",
		autoGranted: false,
		description:
			"Purchase of breastfeeding equipment (breast pump kit, milk storage bags/bottles, cooling accessories) for own child aged 2 years and below. Claimable by the mother once every two years of assessment.",
	},

	// =============================================================
	// PART 10: TAX DEDUCTIONS (reduces aggregate income, not chargeable income)
	// =============================================================

	DONATION: {
		code: "MY_DONATION",
		label: "Donations & Gifts to Approved Institutions",
		maxRelief: null, // typically 10% of aggregate income
		isDeduction: true, // this is a deduction, not a relief
		autoGranted: false,
		description:
			"Donations to approved institutions, organisations, or government bodies. Generally limited to 10% of aggregate income. Must have official receipt from an LHDN-approved institution. Not a relief — reduces aggregate income directly.",
	},

	PROFESSIONAL_MEMBERSHIP: {
		code: "MY_PROF_MEMBER",
		label: "Professional Body Membership Subscription",
		maxRelief: null, // actual amount paid, no fixed cap
		isDeduction: true,
		autoGranted: false,
		description:
			"Annual subscription or membership fees paid to a professional body where membership is required to practise the profession (e.g., MIA, Bar Council, BEM, MMC, MMA). Claimable at actual amount paid. Not a relief — reduces aggregate income.",
	},

	// =============================================================
	// PART 11: TAX REBATES (reduces actual tax payable, applied last)
	// =============================================================

	REBATE_PERSONAL: {
		code: "MY_REBATE_PERSONAL",
		label: "Personal Tax Rebate",
		maxRelief: 400,
		isRebate: true,
		autoGranted: false,
		description:
			"RM400 rebate on tax payable if chargeable income does not exceed RM35,000. An additional RM400 rebate may apply if spouse has no income and qualifies for spouse relief.",
	},

	ZAKAT: {
		code: "MY_ZAKAT",
		label: "Zakat, Fitrah & Compulsory Islamic Religious Contributions",
		maxRelief: null, // full amount paid, subject to tax payable
		isRebate: true,
		autoGranted: false,
		description:
			"Zakat (income zakat, zakat fitrah, or other zakat) paid to authorised zakat collection bodies. This is a TAX REBATE (reduces tax payable ringgit-for-ringgit), not a relief. Amount rebated limited to actual tax payable.",
	},

	// =============================================================
	// PART 12: FALLBACK
	// =============================================================

	NOT_ELIGIBLE: {
		code: "NOT_ELIGIBLE",
		label: "Not Eligible for Tax Relief",
		maxRelief: 0,
		autoGranted: false,
		description:
			"Expense does not qualify under any Malaysian income tax relief, deduction, or rebate category for YA 2025.",
	},
};

// ---------------------------------------------------------------------------
// Convenience groupings for UI filtering / categorisation
// ---------------------------------------------------------------------------

const RELIEF_GROUPS = {
	PERSONAL: ["INDIVIDUAL", "DISABLED_SELF", "SPOUSE", "DISABLED_SPOUSE"],
	CHILDREN: [
		"CHILD_BELOW_18",
		"CHILD_18_ABOVE_BASIC",
		"CHILD_18_ABOVE_HIGHER",
		"CHILD_DISABLED",
		"CHILD_DISABLED_HIGHER_EDU",
		"CHILDCARE",
		"BREASTFEEDING",
	],
	EDUCATION: ["EDUCATION_SELF", "SSPN"],
	MEDICAL: ["MEDICAL_SELF", "MEDICAL_PARENTS", "DISABLED_EQUIPMENT"],
	HOUSING: ["HOUSING_LOAN_INTEREST"],
	LIFESTYLE: ["LIFESTYLE", "LIFESTYLE_SPORTS", "EV_CHARGING_COMPOSTING"],
	INSURANCE_FINANCIAL: [
		"LIFE_INSURANCE_EPF",
		"EDUCATION_INSURANCE",
		"PRS",
		"SOCSO",
	],
	DEDUCTIONS: ["DONATION", "PROFESSIONAL_MEMBERSHIP"],
	REBATES: ["REBATE_PERSONAL", "ZAKAT"],
};

const GET_TAX_CATEGORY_BY_YEAR_ASSESSMENT = async (year = new Date().getFullYear()) => {
	let result = null
	try {
		let sql = await db.raw(`SELECT * FROM tax_category WHERE tax_year = '${year}' AND status = 'Active'`)
		result = { status: true, data: sql}
	} catch (e) {
		console.log("Syntax error on get tax category by year assessment : ", e)
		result = { status: false, data: []}
	}
	return result
}

module.exports = { 
	MY_TAX_RELIEF_CATEGORIES, 
	RELIEF_GROUPS,
	GET_TAX_CATEGORY_BY_YEAR_ASSESSMENT
};
