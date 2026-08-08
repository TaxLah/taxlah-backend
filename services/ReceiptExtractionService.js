const db = require("../utils/sqlbuilder")
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

const ConfigService = require("./ConfigService");

/**
 * OpenAI client, resolved per call.
 *
 * Previously this module ran `new OpenAI({ apiKey: process.env.OPENAI_API_KEY })` at
 * require() time. The SDK throws when the key is absent, so a missing key did not degrade
 * OCR — it crashed the whole API during boot. And because production supplies the key
 * from the shell PM2 was launched with rather than env.yaml, a `pm2 restart` from a clean
 * shell was enough to trigger it.
 *
 * Reading through ConfigService also means a rotated key takes effect without a restart.
 */
let _client = null;
let _key = null;

async function getOpenAI() {
    const apiKey = await ConfigService.get("openai", "OPENAI_API_KEY");

    if (!apiKey) {
        throw new Error(
            "OPENAI_API_KEY is not configured. Set it in the admin portal under System Configuration, or in the environment."
        );
    }

    // Rebuild only when the key actually changes.
    if (!_client || _key !== apiKey) {
        _client = new OpenAI({ apiKey });
        _key = apiKey;
    }

    return _client;
}

/**
 * Fallback prompt, used when the prompt_templates table has no receipt_ocr row.
 *
 * The previous version of this constant was never actually used as a fallback —
 * a missing DB row sent a null system prompt to the model — and its JSON example
 * was itself invalid (a missing comma and a missing colon), which taught the
 * model the wrong shape on the rare occasion someone pasted it into the DB.
 */
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
    "receipt_no": "string or null",
    "items": [
        {
            "item_name": "string",
            "item_quantity": number,
            "item_unit_price": number,
            "item_total_price": number
        }
    ],
    "notes": "any ambiguity or unreadable parts, or null"
}

Rules for items:
- items contains ONLY purchasable goods and services, each with a POSITIVE unit price and total.
- NEVER put these in items: discounts, vouchers, rebates, rounding adjustments, service charges, SST/GST/tax lines, subtotals, change due, payment lines.
- item_quantity is a number; default to 1 when not shown.
- Never output a negative number anywhere.

General rules:
- total_amount is the final amount actually paid, after discounts and including charges.
- If the receipt is unreadable or not a receipt image, return all fields as null and explain in notes.
- Use MYR as default currency. If another currency is shown, note it.
- Do not invent data — if a field is unclear, set it to null.
- Include ALL purchasable line items found on the receipt in the items array.
`;

async function GetReceiptOCRPrompt() {
    let result = null
    let prompt = ``
    try {   
        let sql = await db.raw(`SELECT template FROM prompt_templates WHERE name = 'receipt_ocr' LIMIT 1`)
        if(sql.length) {
            prompt = sql[0]["template"]
            result = prompt
        }
    } catch (e) {
        console.log("Syntax error at model get receipt ocr prompt : ", e)
        result = null
    }

    return result
}

/**
 * Convert the first page of a PDF to a base64 PNG.
 * Uses pdf2pic (GraphicsMagick-based) — no browser APIs required.
 * Server prerequisite: sudo apt-get install -y graphicsmagick ghostscript
 * @param {string} filePath
 * @returns {Promise<string>} base64-encoded PNG
 */
async function convertPdfToImageBase64(filePath) {
    const { fromPath } = require("pdf2pic");
    const os   = require("os");
    const path = require("path");

    const tmpFilename = `receipt_ocr_${Date.now()}`;
    const tmpDir      = os.tmpdir();

    const converter = fromPath(filePath, {
        density:      150,
        saveFilename: tmpFilename,
        savePath:     tmpDir,
        format:       "png",
        width:        1200,
        height:       1600
    });

    let result;
    try {
        result = await converter(1, { responseType: "base64" });
    } catch (e) {
        throw new Error(
            `pdf2pic conversion failed: ${e.message}. ` +
            `Ensure graphicsmagick and ghostscript are installed on the server: ` +
            `sudo apt-get install -y graphicsmagick ghostscript`
        );
    }

    console.log("[ReceiptExtractionService] pdf2pic result keys:", JSON.stringify({
        hasBase64: !!result?.base64,
        hasPath:   !!result?.path,
        page:      result?.page
    }));

    /**
     * pdf2pic reports success even when GraphicsMagick emitted a zero-byte or
     * truncated PNG, and that "image" then went to the model as the receipt.
     * Decoding through sharp is the check: a corrupt buffer fails to decode, a
     * blank page decodes but is caught by size.
     */
    const validated = async (buffer) => {
        if (!buffer || buffer.length < 1024) {
            throw new Error('PDF conversion produced an empty or truncated image.');
        }
        const sharp = require("sharp");
        const meta = await sharp(buffer).metadata();
        if (!meta.width || !meta.height || meta.width < 50 || meta.height < 50) {
            throw new Error('PDF conversion produced an unreadable image.');
        }
        return buffer.toString("base64");
    };

    // Primary: responseType:"base64" returns result.base64
    if (result?.base64) return validated(Buffer.from(result.base64, "base64"));

    // Fallback: read from the saved temp file
    const savedPath = result?.path || path.join(tmpDir, `${tmpFilename}.1.png`);
    if (fs.existsSync(savedPath)) {
        const buffer = fs.readFileSync(savedPath);
        try { fs.unlinkSync(savedPath); } catch (_) {}
        return validated(buffer);
    }

    throw new Error(
        "PDF conversion produced no output. " +
        "Run on server: sudo apt-get install -y graphicsmagick ghostscript"
    );
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
    let pdfFilePart = null;

    if (mimeType === "application/pdf") {
        // Preferred: hand the PDF to the model as a file. OpenAI renders the pages
        // itself, so nothing on this server can corrupt the intermediate image —
        // pdf2pic needs GraphicsMagick and Ghostscript installed and healthy, and its
        // output used to go to the model unchecked. Conversion is now only the
        // fallback, and its output is verified before use.
        const pdfBuffer = fs.readFileSync(filePath);
        pdfFilePart = {
            type: "file",
            file: {
                filename: "receipt.pdf",
                file_data: `data:application/pdf;base64,${pdfBuffer.toString("base64")}`
            }
        };
    } else {
        // Normalise the photo before sending: resize to a readable width and
        // re-encode as JPEG. A raw 12MP camera photo is a ~10MB base64 payload —
        // slow to ship — while 1600px preserves receipt print comfortably. Falls
        // back to the raw file if sharp cannot read it.
        try {
            const sharp = require("sharp");
            const prepared = await sharp(filePath)
                .rotate() // honour EXIF orientation — sideways receipts OCR terribly
                .resize({ width: 1600, withoutEnlargement: true })
                .jpeg({ quality: 85 })
                .toBuffer();
            base64Image   = prepared.toString("base64");
            imageMimeType = "image/jpeg";
        } catch (prepErr) {
            console.warn("[ReceiptExtractionService] Image preparation failed, sending original:", prepErr.message);
            const fileBuffer = fs.readFileSync(filePath);
            base64Image      = fileBuffer.toString("base64");
        }
    }

    // Prefer the editable DB template; fall back to the built-in prompt rather than
    // sending the model a null system message.
    let getPrompt = await GetReceiptOCRPrompt()
    if (!getPrompt) {
        console.warn("[ReceiptExtractionService] prompt_templates.receipt_ocr missing — using built-in prompt");
        getPrompt = EXTRACTION_SYSTEM_PROMPT;
    }

    const openai = await getOpenAI();

    const buildRequest = (contentPart) => ({
        model: "gpt-5-mini",
        max_completion_tokens: 5000,
        messages: [
            {
                role: "system",
                content: getPrompt
            },
            {
                role: "user",
                content: [
                    {
                        type: "text",
                        text: "Please extract all data from this receipt."
                    },
                    contentPart
                ]
            }
        ],
        response_format: { type: "json_object" }
    });

    const imagePart = () => ({
        type: "image_url",
        image_url: {
            url: `data:${imageMimeType};base64,${base64Image}`,
            // "low" fed the model a 512px thumbnail of a document made of small
            // print — the direct cause of misread digits, merged lines and RM0.00
            // unit prices. The image is already downscaled to 1600px above, so
            // "high" stays affordable.
            detail: "high"
        }
    });

    let response;
    if (pdfFilePart) {
        try {
            response = await openai.chat.completions.create(buildRequest(pdfFilePart));
        } catch (pdfErr) {
            // Only if the API refuses the PDF do we fall back to local conversion —
            // whose output is now validated before being trusted.
            console.warn("[ReceiptExtractionService] Direct PDF input rejected, converting locally:", pdfErr.message);
            base64Image   = await convertPdfToImageBase64(filePath);
            imageMimeType = "image/png";
            response = await openai.chat.completions.create(buildRequest(imagePart()));
        }
    } else {
        response = await openai.chat.completions.create(buildRequest(imagePart()));
    }

    console.log("[ReceiptExtractionService] OCR complete.");

    const rawContent   = response.choices[0].message.content;
    const finishReason = response.choices[0].finish_reason;

    if (!rawContent || finishReason === "length") {
        throw new Error("OpenAI response was truncated. Try uploading a clearer or smaller image.");
    }

    const parsed = JSON.parse(rawContent);

    // The model's output is treated as untrusted input: negative or zero prices are
    // repaired from the figures that are present, unusable lines are dropped, and a
    // negative total is never allowed through.
    const { normaliseExtractedItems, parseAmount } = require("../utils/expenseItems");
    const items = normaliseExtractedItems(parsed.items);

    let total = parseAmount(parsed.total_amount);
    if (!Number.isFinite(total) || total < 0) total = null;
    if (total === null && items.length) {
        // A missing total is recoverable from the lines; a fabricated 0.00 is not.
        total = Math.round(items.reduce((s, i) => s + (i.item_total_price || 0), 0) * 100) / 100;
    }

    // Charge lines the prompt now routes out of items. Absolute-valued: a model
    // that reports a discount as -5.00 still yields 5.00 here.
    const charge = (v) => {
        const n = parseAmount(v);
        return Number.isFinite(n) && n !== 0 ? Math.abs(n) : null;
    };

    return {
        merchant:      parsed.merchant      ?? null,
        date:          parsed.date          ?? null,
        total_amount:  total,
        currency:      parsed.currency      ?? "MYR",
        receipt_no:    parsed.receipt_no    ?? null,
        items,
        discount_amount:       charge(parsed.discount_amount),
        service_charge_amount: charge(parsed.service_charge_amount),
        tax_amount:            charge(parsed.tax_amount),
        notes:         parsed.notes         ?? null,
        tokens_used:   response.usage.total_tokens
    };
}

module.exports = { extractReceiptData };
