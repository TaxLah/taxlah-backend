const db = require("../utils/sqlbuilder")

/**
 * TaxEligibilityService.js
 *
 * Responsible ONLY for determining Malaysian income tax relief category
 * and eligibility from already-extracted receipt data (text-based, no image).
 *
 * Used by: background queue worker after expense record is confirmed & saved.
 * Input comes from ReceiptExtractionService or user-confirmed form data.
 *
 * This service does NOT read images — it works purely on text, making it
 * significantly cheaper and faster than a vision call.
 */

const OpenAI = require("openai");
const { GET_TAX_CATEGORY_BY_YEAR_ASSESSMENT } = require("../configs/taxCategories");

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// const buildSystemPrompt = (categoryList) => `
// You are a Malaysian personal income tax relief classification assistant specialising in LHDN regulations.

// Given structured receipt data (merchant name, items list, total amount), determine:
// 1. Which tax relief category this expense falls under (if any)
// 2. The eligible amount
// 3. Your confidence level

// Available Malaysian Tax Relief Categories:
// ${categoryList}

// Return ONLY valid JSON with this exact structure:
// {
//     "tax_category": "CATEGORY_CODE",
//     "tax_category_label": "string",
//     "eligible_amount": number,
//     "confidence": "high | medium | low",
//     "reason": "brief explanation of why this category was assigned",
//     "notes": "any caveats or advice for the taxpayer, or null"
// }

// Rules:
// - Laptop, smartphone, tablet → MY_LIFESTYLE
// - Mixed receipts with some non-eligible items → only include the eligible amount, not the full total
// - If the expense clearly does not qualify under any category → NOT_ELIGIBLE
// - If you are unsure → use low confidence and NOT_ELIGIBLE, advise user to verify with LHDN
// - Be conservative — do not guess eligible amounts

// IMPORTANT rules when calculating eligible_amount for telco bills & internet services bills:
// - EXCLUDE: Voice call charges, SMS charges, roaming fees, service tax, one-time fees
// - NEVER use the total bill amount as eligible_amount
// - if dispute take the total charges or current chargers
// `;

const buildSystemPrompt = (categoryList) => `
You are a Malaysian personal income tax relief classification assistant specialising in LHDN regulations for Year of Assessment 2026.

Given structured receipt data (merchant name, items, total amount), you must:
1. Identify the correct tax relief category
2. Calculate only the eligible amount
3. Return a JSON object — no other text

---

## STEP 1 — CATEGORISE THE EXPENSE TYPE

Before selecting a relief category, identify the expense type:

- Internet/broadband subscription (e.g. Unifi, Maxis Fibre, TIME) → LIFESTYLE_2026
- Smartphone/tablet/laptop purchase → LIFESTYLE_2026
- Books, magazines, newspapers → LIFESTYLE_2026
- Skill/upskilling course → LIFESTYLE_2026 (sub-limit RM2,000)
- Sports equipment/gym/facility → LIFESTYLE_SPORTS_2026
- Medical (serious disease, fertility, vaccination, dental) → MEDICAL_SERIOUS_2026
- Health screening / COVID test / mental health → MEDICAL_EXAM_2026
- Life insurance / takaful premium → LIFE_EPF_2026
- EPF contribution → LIFE_EPF_2026
- Medical/education insurance premium → INSURANCE_EDU_MED_2026
- Childcare (registered centre, child ≤6 years) → CHILDCARE_2026
- SSPN deposit → SSPN_2026
- EV charging equipment (non-business) → EV_CHARGING_2026
- Parent/grandparent medical or care expenses → PARENT_MEDICAL_2026
- Expense that clearly does not fit any category → NOT_ELIGIBLE

---

## STEP 2 — CALCULATE ELIGIBLE AMOUNT

### General rule
Only include amounts directly tied to the eligible item. Exclude SST/service tax unless it is inseparable from the base charge.

### Special rules for TELCO & INTERNET BILLS
Apply these rules in order:

1. If the bill contains ONLY internet/broadband charges (e.g. "Current Charges" for a broadband plan, monthly subscription fee):
    → Use the base subscription charge as eligible_amount (exclude SST if itemised separately)

2. If the bill is MIXED (internet + voice calls + SMS + roaming):
    → Include ONLY the internet/data portion
    → Exclude: voice call charges, SMS charges, roaming fees, one-time device fees, late payment charges

3. If you cannot clearly separate internet from non-internet charges:
    → Set confidence to "low" and eligible_amount to 0; advise user to check itemised bill

4. Do NOT use the full bill total unless the bill is confirmed to be 100% internet subscription with no other components

---

## STEP 3 — CHECK CATEGORY ANNUAL SUB-LIMITS

LIFESTYLE_2026 combined annual maximum: RM2,500
(internet + books + devices + upskilling all share this pool)

LIFESTYLE_SPORTS_2026 additional annual maximum: RM1,000

MEDICAL_EXAM_2026 annual maximum: RM1,000

Note: Annual limits are not enforced per-receipt — report the eligible receipt amount only. The taxpayer's tax software will apply the annual cap across all receipts.

---

## AVAILABLE CATEGORIES (reference)
Available Malaysian Tax Relief Categories:
${categoryList}

---

## OUTPUT FORMAT

Return ONLY valid JSON. No preamble, no explanation outside the JSON.

{
    "tax_category": "<CATEGORY_CODE from table above>",
    "tax_category_label": "<human-readable label>",
    "eligible_amount": <number, 2 decimal places>,
    "confidence": "<high | medium | low>",
    "reason": "<one sentence explaining the classification>",
    "notes": "<any caveats for the taxpayer, or null>"
}
`

async function GetTaxIdentificationOCR(tax_category = []) {
    let result = null
    let prompt = ``
    try {   
        let sql = await db.raw(`SELECT template FROM prompt_templates WHERE name = 'tax_identification' LIMIT 1`)
        if(sql.length) {
            prompt = sql[0]["template"]

            let currYear = new Date().getFullYear()
            let promptVariables = {
                year: currYear,
                categoryList: tax_category
            }

            // APPEND TAX CATEGORY INTO PROMPT TEXT
            // Replace all {{placeholders}}
            const resolved = prompt.replace(/\{\{(\w+)\}\}/g, (_, key) => {
                return promptVariables[key] ?? `{{${key}}}`;
            });

            result = resolved
        }
    } catch (e) {
        console.log("Syntax error at model get receipt ocr prompt : ", e)
        result = null
    }

    return result
}

/**
 * Determine tax category and eligibility from extracted receipt data.
 * Text-only call — no image needed, much faster than extraction.
 *
 * @param {object} receiptData
 * @param {string}  receiptData.merchant       - Merchant name
 * @param {string}  receiptData.date           - Receipt date (YYYY-MM-DD)
 * @param {number}  receiptData.total_amount   - Total receipt amount
 * @param {Array}   receiptData.items          - Array of item objects
 *   Supports both ReceiptExtractionService format:
 *     { item_name, item_quantity, item_description, item_unit_price, item_total_price }
 *   and manual CreateExpense format:
 *     { item_name, item_unit_price, item_quantity, item_total_price, item_sku_unit }
 * @returns {Promise<object>} Tax eligibility result
 */
async function classifyTaxEligibility(receiptData) {
    const { merchant, date, total_amount, items = [] } = receiptData;

    console.log("[TaxEligibilityService] Classifying tax eligibility for:", merchant);

    // Fetch live tax categories from DB for the current assessment year
    const year              = new Date().getFullYear();
    console.log("Log Year : ", year)

    const categoryResult    = await GET_TAX_CATEGORY_BY_YEAR_ASSESSMENT(year);

    const categoryRows = categoryResult.status ? (categoryResult.data ?? []) : [];
    const categoryList = categoryRows.length > 0
        ? categoryRows.map((c) => `- ${c.tax_code}: ${c.tax_title} (Max Relief: RM${c.tax_max_claim ?? "unlimited"}) — ${c.tax_description ?? ""}`).join("\n")
        : "(no tax categories available for this year)";
    
    // const TAX_ELIGIBILITY_SYSTEM_PROMPT = buildSystemPrompt(categoryList);
    const TAX_ELIGIBILITY_SYSTEM_PROMPT = await GetTaxIdentificationOCR(categoryList)

    const itemsText = items.length > 0
        ? items.map((i) => {
            const name  = i.item_name || "Unknown item";
            const price = i.item_total_price ?? 0;
            const qty   = i.item_quantity   ? ` x${i.item_quantity}` : "";
            const desc  = i.item_description ? ` (${i.item_description})` : "";
            return `  - ${name}${desc}${qty}: RM${price}`;
        }).join("\n")
        : "  (no itemised breakdown available)";

    const userMessage = `
    Please classify this expense for Malaysian tax relief:

    Merchant: ${merchant ?? "Unknown"}
    Date: ${date ?? "Unknown"}
    Total Amount: RM${total_amount ?? 0}

    Items:
    ${itemsText}
    `.trim();

    console.log("Log User Message Prompt : ", userMessage)
    console.log("Log Tax Eligibility System Prompt : ", TAX_ELIGIBILITY_SYSTEM_PROMPT)

    const response = await openai.chat.completions.create({
        model: "gpt-5-mini",
        max_completion_tokens: 5000,
        messages: [
            {
                role: "system",
                content: TAX_ELIGIBILITY_SYSTEM_PROMPT
            },
            {
                role: "user",
                content: userMessage
            }
        ],
        response_format: { type: "json_object" }
    });

    console.log("[TaxEligibilityService] Classification complete.");

    const rawContent   = response.choices[0].message.content;
    const finishReason = response.choices[0].finish_reason;

    if (!rawContent || finishReason === "length") {
        throw new Error("TaxEligibilityService: OpenAI response truncated.");
    }

    const parsed = JSON.parse(rawContent);
    console.log("Log Parsed JSON : ", parsed)

    // Enrich with DB category metadata
    const categoryMeta = categoryRows.find((c) => c.tax_code === parsed.tax_category);
    console.log("Log Category Meta : ", categoryMeta)

    return {
        tax_category:       parsed.tax_category       ?? "NOT_ELIGIBLE",
        tax_category_label: parsed.tax_category_label ?? "Not Eligible for Tax Relief",
        eligible_amount:    parsed.eligible_amount     ?? 0,
        confidence:         parsed.confidence          ?? "low",
        reason:             parsed.reason              ?? null,
        notes:              parsed.notes               ?? null,
        max_relief_limit:   categoryMeta?.tax_max_claim ?? 0,
        tokens_used:        response.usage.total_tokens
    };
}

module.exports = { classifyTaxEligibility };
