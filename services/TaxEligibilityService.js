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

const buildSystemPrompt = (categoryList) => `
You are a Malaysian personal income tax relief classification assistant specialising in LHDN regulations.

Given structured receipt data (merchant name, items list, total amount), determine:
1. Which tax relief category this expense falls under (if any)
2. The eligible amount
3. Your confidence level

Available Malaysian Tax Relief Categories:
${categoryList}

Return ONLY valid JSON with this exact structure:
{
    "tax_category": "CATEGORY_CODE",
    "tax_category_label": "string",
    "eligible_amount": number,
    "confidence": "high | medium | low",
    "reason": "brief explanation of why this category was assigned",
    "notes": "any caveats or advice for the taxpayer, or null"
}

Rules:
- Laptop, smartphone, tablet → MY_LIFESTYLE
- Mixed receipts with some non-eligible items → only include the eligible amount, not the full total
- If the expense clearly does not qualify under any category → NOT_ELIGIBLE
- If you are unsure → use low confidence and NOT_ELIGIBLE, advise user to verify with LHDN
- Be conservative — do not guess eligible amounts
`;

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
    console.log("Log Category Result : ", categoryResult)

    const categoryRows = categoryResult.status ? (categoryResult.data ?? []) : [];
    const categoryList = categoryRows.length > 0
        ? categoryRows.map((c) => `- ${c.tax_code}: ${c.tax_title} (Max Relief: RM${c.tax_max_claim ?? "unlimited"}) — ${c.tax_description ?? ""}`).join("\n")
        : "(no tax categories available for this year)";
    const TAX_ELIGIBILITY_SYSTEM_PROMPT = buildSystemPrompt(categoryList);

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
        model: "gpt-5-nano",
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

    // Enrich with DB category metadata
    const categoryMeta = categoryRows.find((c) => c.tax_code === parsed.tax_category);

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
