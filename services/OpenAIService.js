// src/services/openaiService.js

const OpenAI = require("openai");
const fs = require("fs");
const path = require("path");
const MY_TAX_RELIEF_CATEGORIES = require("../configs/taxCategories");

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Build category list dynamically for the prompt
const categoryList = Object.values(MY_TAX_RELIEF_CATEGORIES)
	.map(
		(c) =>
			`- ${c.code}: ${c.label} (Max Relief: RM${c.maxRelief}) — ${c.description}`,
	)
	.join("\n");

// const HIGH_SYSTEM_PROMPT = `
// You are TaxLah's intelligent tax relief assistant specialising in Malaysian Income Tax (LHDN).
// Your job is to analyse receipt images and extract their data, then categorise them according to
// Malaysian personal income tax relief categories under the Income Tax Act 1967.

// Available Malaysian Tax Relief Categories:
// ${categoryList}

// You must respond ONLY in valid JSON format with this exact structure:
// {
//     "merchant": "string",
//     "date": "YYYY-MM-DD or null",
//     "total_amount": number or null,
//     "currency": "MYR",
//     "items": [
//         { "description": "string", "amount": number }
//     ],
//     "tax_category": "CATEGORY_CODE",
//     "tax_category_label": "string",
//     "eligible_amount": number,
//     "confidence": "high | medium | low",
//     "reason": "Brief explanation of why this category was assigned or why it's not eligible",
//     "notes": "Any additional advice or caveats for the taxpayer"
// }

// Rules:
// 1. If a receipt has mixed items (some eligible, some not), only include the eligible amount.
// 2. Use MYR as default currency. Convert if receipt shows another currency and note it.
// 3. If the receipt is unreadable or not a receipt, set tax_category to "NOT_ELIGIBLE" and explain in reason.
// 4. Be conservative — if unsure, use lower confidence and advise the user to verify with LHDN.
// `;

const BASIC_SYSTEM_PROMPT = `
You are a Malaysian tax assistant.

Classify receipts into one of these categories:
${categoryList}

Return ONLY JSON:
{
    "merchant": "string",
    "date": "YYYY-MM-DD or null",
    "total_amount": number or null,
    "currency": "MYR",
    "items": [{ "description": "string", "amount": number }],
    "tax_category": "CATEGORY_CODE",
    "tax_category_label": "string",
    "eligible_amount": number,
    "confidence": "high | medium | low",
    "reason": "short reason",
    "notes": "short notes"
}

Rules:
- Laptop, smartphone, tablet → MY_LIFESTYLE
- Mixed items → only include eligible amount
- If unsure → NOT_ELIGIBLE
`;

async function convertPdfToImageBase64(filePath) {
	// pdf-to-img is ESM-only, use dynamic import for CommonJS compatibility
	const { pdf } = await import("pdf-to-img");
	const pages = await pdf(filePath, { scale: 1.0 });
	for await (const page of pages) {
		// Return only the first page as base64-encoded PNG
		return page.toString("base64");
	}
	throw new Error("PDF has no pages");
}

async function analyseReceipt(filePath, mimeType) {

    console.log("🖨️ Start to processing your receipt...")

	let base64Image;
	let imageMimeType = mimeType;

	if (mimeType === "application/pdf") {
		console.log("📄 Converting PDF first page to image...");
		base64Image = await convertPdfToImageBase64(filePath);
		imageMimeType = "image/png";
	} else {
		const fileBuffer = fs.readFileSync(filePath);
		base64Image = fileBuffer.toString("base64");
	}

	// GPT-4o supports image inputs directly
	const response = await openai.chat.completions.create({
		model: "gpt-5-nano",
		max_completion_tokens: 5000,
		messages: [
			{
				role: "system",
				content: BASIC_SYSTEM_PROMPT,
			},
			{
				role: "user",
				content: [
					{
						type: "text",
						text: "Please analyse this receipt and extract all relevant information for Malaysian tax relief purposes.",
					},
					{
						type: "image_url",
						image_url: {
							url: `data:${imageMimeType};base64,${base64Image}`,
							detail: "low", // Use high detail for better OCR accuracy
						},
					},
				],
			},
		],
		response_format: { type: "json_object" }, // Enforce JSON output
	});

    console.log("✅ Finish processing your receipt...")

    console.log("Log Raw Response : ", response)
    console.log("Log Choices 1 : ", response.choices[0])

	const rawContent    = response.choices[0].message.content;
	const finishReason  = response.choices[0].finish_reason;

	if (!rawContent || finishReason === "length") {
		throw new Error(
			"OpenAI response was truncated. Try uploading a clearer or smaller image.",
		);
	}

	// Parse and enrich with category metadata
	const parsed        = JSON.parse(rawContent);
	const categoryMeta  = Object.values(MY_TAX_RELIEF_CATEGORIES).find(
		(c) => c.code === parsed.tax_category,
	);

	return {
		...parsed,
		max_relief_limit: categoryMeta?.maxRelief ?? 0,
		tokens_used: response.usage.total_tokens,
	};
}

module.exports = { analyseReceipt };
