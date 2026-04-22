/**
 * ReceiptExtractionService.js
 *
 * Responsible ONLY for OCR / data extraction from a receipt image or PDF.
 * Does NOT perform any tax classification.
 *
 * Used by: POST /api/expenses/extract-receipt (premium, synchronous preview step)
 *
 * Returns structured receipt data for the user to review before confirming.
 */

const OpenAI = require("openai");
const fs     = require("fs");

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const EXTRACTION_SYSTEM_PROMPT = `
You are a receipt data extraction assistant.
Your ONLY job is to read the receipt image and extract the raw data.
Do NOT classify, categorise, or judge tax eligibility.

Return ONLY valid JSON with this exact structure:
{
    "merchant": "string or null",
    "date": "YYYY-MM-DD or null",
    "total_amount": number or null,
    "currency": "MYR",
    "items": [
        { 
            "item_name": "string",
            "item_quantity": "string"
            "item_description": "string", 
            "item_unit_price": number,
            "item_total_price" number
        }
    ],
    "notes": "any ambiguity or unreadable parts, or null"
}

Rules:
- If the receipt is unreadable or not a receipt image, return all fields as null and explain in notes.
- Use MYR as default currency. If another currency is shown, convert if possible and note it.
- Do not invent data — if a field is unclear, set it to null.
- Include ALL line items found on the receipt in the items array.
`;

/**
 * Convert the first page of a PDF to a base64 PNG.
 * @param {string} filePath
 * @returns {Promise<string>} base64-encoded PNG
 */
async function convertPdfToImageBase64(filePath) {
    const { pdf } = await import("pdf-to-img");
    const pages = await pdf(filePath, { scale: 1.0 });
    for await (const page of pages) {
        return page.toString("base64");
    }
    throw new Error("PDF has no pages");
}

/**
 * Extract raw data from a receipt image or PDF.
 * This is the synchronous step — user waits for the result to preview before confirming.
 *
 * @param {string} filePath  - Absolute path to the uploaded file on disk
 * @param {string} mimeType  - File mime type (e.g. image/jpeg, application/pdf)
 * @returns {Promise<object>} Extracted receipt data
 */
async function extractReceiptData(filePath, mimeType) {
    console.log("[ReceiptExtractionService] Starting OCR extraction...");

    let base64Image;
    let imageMimeType = mimeType;

    if (mimeType === "application/pdf") {
        console.log("[ReceiptExtractionService] Converting PDF to image...");
        base64Image   = await convertPdfToImageBase64(filePath);
        imageMimeType = "image/png";
    } else {
        const fileBuffer = fs.readFileSync(filePath);
        base64Image      = fileBuffer.toString("base64");
    }

    const response = await openai.chat.completions.create({
        model: "gpt-5-mini",
        max_completion_tokens: 5000,
        messages: [
            {
                role: "system",
                content: EXTRACTION_SYSTEM_PROMPT
            },
            {
                role: "user",
                content: [
                    {
                        type: "text",
                        text: "Please extract all data from this receipt."
                    },
                    {
                        type: "image_url",
                        image_url: {
                            url: `data:${imageMimeType};base64,${base64Image}`,
                            detail: "low"
                        }
                    }
                ]
            }
        ],
        response_format: { type: "json_object" }
    });

    console.log("[ReceiptExtractionService] OCR complete.");

    const rawContent   = response.choices[0].message.content;
    const finishReason = response.choices[0].finish_reason;

    if (!rawContent || finishReason === "length") {
        throw new Error("OpenAI response was truncated. Try uploading a clearer or smaller image.");
    }

    const parsed = JSON.parse(rawContent);
    console.log('Log Parsed : ', parsed)

    return {
        merchant:      parsed.merchant      ?? null,
        date:          parsed.date          ?? null,
        total_amount:  parsed.total_amount  ?? 0.00,
        currency:      parsed.currency      ?? "MYR",
        items:         Array.isArray(parsed.items) ? parsed.items : [],
        notes:         parsed.notes         ?? null,
        tokens_used:   response.usage.total_tokens
    };
}

module.exports = { extractReceiptData };
