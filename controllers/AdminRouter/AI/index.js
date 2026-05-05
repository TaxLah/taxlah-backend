const express  = require('express')
const multer   = require('multer')
const os       = require('os')
const fs       = require('fs')
const path     = require('path')
const OpenAI   = require('openai')
const router   = express.Router()

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

const { superauth } = require('../../../configs/auth')
const {
    DEFAULT_API_RESPONSE,
    INTERNAL_SERVER_ERROR_API_RESPONSE,
    SUCCESS_API_RESPONSE,
    BAD_REQUEST_API_RESPONSE,
    NOT_FOUND_API_RESPONSE,
} = require('../../../configs/helper')

const { extractReceiptData }    = require('../../../services/ReceiptExtractionService')
const { classifyTaxEligibility } = require('../../../services/TaxEligibilityService')
const {
    GetAllPromptTemplates,
    GetPromptTemplateById,
    UpdatePromptTemplate,
} = require('../../../models/AdminModel/AIPrompts')

// Temp storage for admin test uploads — files are deleted after each request
const tempUpload = multer({
    dest: os.tmpdir(),
    limits: { fileSize: 15 * 1024 * 1024 }, // 15 MB
    fileFilter: (req, file, cb) => {
        const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf']
        if (allowed.includes(file.mimetype)) {
            cb(null, true)
        } else {
            cb(new Error('Only images (JPEG, PNG, WEBP) and PDF files are allowed'), false)
        }
    },
})

// Helper — delete a temp file silently after use
function cleanupTempFile(filePath) {
    try {
        if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath)
    } catch (_) { /* ignore */ }
}

/* ═══════════════════════════════════════════════════════
   PROMPT TEMPLATE MANAGEMENT
   ═══════════════════════════════════════════════════════ */

/**
 * GET /superadmin/ai/prompts
 * List all prompt templates (metadata only, no template text).
 */
router.get('/prompts', superauth(), async (req, res) => {
    let response = DEFAULT_API_RESPONSE
    try {
        const result = await GetAllPromptTemplates()
        response = result.status
            ? { ...SUCCESS_API_RESPONSE, data: result.data }
            : INTERNAL_SERVER_ERROR_API_RESPONSE
    } catch (e) {
        console.error('[AdminAI] GET /prompts:', e)
        response = INTERNAL_SERVER_ERROR_API_RESPONSE
    }
    return res.status(response.status_code).json(response)
})

/**
 * GET /superadmin/ai/prompts/:id
 * Get a single prompt template including its full template text.
 */
router.get('/prompts/:id', superauth(), async (req, res) => {
    let response = DEFAULT_API_RESPONSE
    try {
        const id = parseInt(req.params.id)
        if (!id || isNaN(id)) {
            return res.status(400).json({ ...BAD_REQUEST_API_RESPONSE, message: 'Invalid prompt template ID' })
        }

        const result = await GetPromptTemplateById(id)

        if (result.notFound) {
            return res.status(404).json({ ...NOT_FOUND_API_RESPONSE, message: 'Prompt template not found' })
        }

        response = result.status
            ? { ...SUCCESS_API_RESPONSE, data: result.data }
            : INTERNAL_SERVER_ERROR_API_RESPONSE
    } catch (e) {
        console.error('[AdminAI] GET /prompts/:id:', e)
        response = INTERNAL_SERVER_ERROR_API_RESPONSE
    }
    return res.status(response.status_code).json(response)
})

/**
 * PUT /superadmin/ai/prompts/:id
 * Update a prompt template's text, description, or active state.
 *
 * Body: { template?: string, description?: string, is_active?: 0|1 }
 */
router.put('/prompts/:id', superauth(), async (req, res) => {
    let response = DEFAULT_API_RESPONSE
    try {
        const id = parseInt(req.params.id)
        if (!id || isNaN(id)) {
            return res.status(400).json({ ...BAD_REQUEST_API_RESPONSE, message: 'Invalid prompt template ID' })
        }

        const { template, description, is_active } = req.body

        if (template === undefined && description === undefined && is_active === undefined) {
            return res.status(400).json({
                ...BAD_REQUEST_API_RESPONSE,
                message: 'Provide at least one field to update: template, description, or is_active',
            })
        }

        const result = await UpdatePromptTemplate(id, { template, description, is_active })

        if (result.notFound) {
            return res.status(404).json({ ...NOT_FOUND_API_RESPONSE, message: 'Prompt template not found' })
        }

        response = result.status
            ? { ...SUCCESS_API_RESPONSE, message: 'Prompt template updated successfully', data: result.data }
            : INTERNAL_SERVER_ERROR_API_RESPONSE
    } catch (e) {
        console.error('[AdminAI] PUT /prompts/:id:', e)
        response = INTERNAL_SERVER_ERROR_API_RESPONSE
    }
    return res.status(response.status_code).json(response)
})

/* ═══════════════════════════════════════════════════════
   AI TESTING ENDPOINTS
   ═══════════════════════════════════════════════════════ */

/**
 * POST /superadmin/ai/test/ocr
 * Upload a receipt file and run only the OCR extraction step.
 *
 * Form-data: file (image or PDF)
 *
 * Returns the raw structured receipt data extracted by the AI.
 * Use this to verify the OCR prompt before running tax classification.
 */
router.post('/test/ocr', superauth(), tempUpload.single('file'), async (req, res) => {
    let response = DEFAULT_API_RESPONSE
    const uploadedFile = req.file

    try {
        if (!uploadedFile) {
            return res.status(400).json({
                ...BAD_REQUEST_API_RESPONSE,
                message: 'No file uploaded. Attach a receipt image or PDF as "file" in form-data.',
            })
        }

        console.log('[AdminAI] OCR test — file:', uploadedFile.originalname, uploadedFile.mimetype)

        const extracted = await extractReceiptData(uploadedFile.path, uploadedFile.mimetype)

        response = {
            ...SUCCESS_API_RESPONSE,
            message: 'OCR extraction completed',
            data: {
                file: {
                    original_name: uploadedFile.originalname,
                    mimetype:      uploadedFile.mimetype,
                    size_bytes:    uploadedFile.size,
                },
                extracted,
            },
        }
    } catch (e) {
        console.error('[AdminAI] POST /test/ocr:', e)
        response = {
            ...INTERNAL_SERVER_ERROR_API_RESPONSE,
            message: e.message || 'OCR extraction failed',
        }
    } finally {
        cleanupTempFile(uploadedFile?.path)
    }

    return res.status(response.status_code).json(response)
})

/**
 * POST /superadmin/ai/test/tax
 * Run tax category classification on pre-extracted receipt data (no file upload).
 *
 * Body (JSON): {
 *   merchant:     string,
 *   date:         "YYYY-MM-DD",
 *   total_amount: number,
 *   currency:     "MYR",
 *   items:        [{ item_name, item_description, item_quantity, item_unit_price, item_total_price }],
 *   notes:        string | null
 * }
 *
 * Use this to test tax classification independently or with custom data.
 */
router.post('/test/tax', superauth(), async (req, res) => {
    let response = DEFAULT_API_RESPONSE
    try {
        const { merchant, date, total_amount, currency, items, notes } = req.body

        if (total_amount === undefined || total_amount === null) {
            return res.status(400).json({
                ...BAD_REQUEST_API_RESPONSE,
                message: 'total_amount is required in the request body',
            })
        }

        const receiptData = {
            merchant:     merchant     ?? null,
            date:         date         ?? null,
            total_amount: Number(total_amount),
            currency:     currency     ?? 'MYR',
            items:        Array.isArray(items) ? items : [],
            notes:        notes        ?? null,
        }

        console.log('[AdminAI] Tax classification test — merchant:', merchant)

        const classification = await classifyTaxEligibility(receiptData)

        response = {
            ...SUCCESS_API_RESPONSE,
            message: 'Tax category classification completed',
            data: {
                input:          receiptData,
                classification,
            },
        }
    } catch (e) {
        console.error('[AdminAI] POST /test/tax:', e)
        response = {
            ...INTERNAL_SERVER_ERROR_API_RESPONSE,
            message: e.message || 'Tax classification failed',
        }
    }
    return res.status(response.status_code).json(response)
})

/**
 * POST /superadmin/ai/test/pipeline
 * Upload a receipt file and run the FULL pipeline: OCR extraction → Tax classification.
 *
 * Form-data: file (image or PDF)
 *
 * Returns both the raw OCR output and the tax classification result.
 * Use this to test the entire AI flow end-to-end.
 */
router.post('/test/pipeline', superauth(), tempUpload.single('file'), async (req, res) => {
    let response = DEFAULT_API_RESPONSE
    const uploadedFile = req.file

    try {
        if (!uploadedFile) {
            return res.status(400).json({
                ...BAD_REQUEST_API_RESPONSE,
                message: 'No file uploaded. Attach a receipt image or PDF as "file" in form-data.',
            })
        }

        console.log('[AdminAI] Full pipeline test — file:', uploadedFile.originalname, uploadedFile.mimetype)

        // Step 1: OCR
        const extracted = await extractReceiptData(uploadedFile.path, uploadedFile.mimetype)
        console.log('[AdminAI] Pipeline — OCR done, classifying...')

        // Step 2: Tax classification
        const classification = await classifyTaxEligibility(extracted)
        console.log('[AdminAI] Pipeline — Classification done.')

        response = {
            ...SUCCESS_API_RESPONSE,
            message: 'Full pipeline completed (OCR + Tax classification)',
            data: {
                file: {
                    original_name: uploadedFile.originalname,
                    mimetype:      uploadedFile.mimetype,
                    size_bytes:    uploadedFile.size,
                },
                ocr:            extracted,
                classification,
            },
        }
    } catch (e) {
        console.error('[AdminAI] POST /test/pipeline:', e)
        response = {
            ...INTERNAL_SERVER_ERROR_API_RESPONSE,
            message: e.message || 'Pipeline processing failed',
        }
    } finally {
        cleanupTempFile(uploadedFile?.path)
    }

    return res.status(response.status_code).json(response)
})

/* ═══════════════════════════════════════════════════════
   OPENAI ACCOUNT OVERVIEW
   ═══════════════════════════════════════════════════════ */

/**
 * GET /superadmin/ai/account
 * Returns OpenAI credit balance and current-month token usage in one call.
 *
 * Calls two OpenAI REST endpoints in parallel:
 *   1. GET /dashboard/billing/credit_grants   → credit balance (prepaid accounts)
 *   2. GET /v1/organization/usage/completions → token usage for the current calendar month
 *
 * Either section may be null if the API key does not have the required org-level
 * permissions (e.g. restricted keys), but the other section will still be returned.
 */
router.get('/account', superauth(), async (req, res) => {
    let response = DEFAULT_API_RESPONSE
    try {
        if (!process.env.OPENAI_API_KEY) {
            return res.status(500).json({
                ...INTERNAL_SERVER_ERROR_API_RESPONSE,
                message: 'OPENAI_API_KEY is not configured on this server',
            })
        }

        // Current-month window as Unix timestamps
        const now            = new Date()
        const startOfMonth   = new Date(now.getFullYear(), now.getMonth(), 1)
        const startTimestamp = Math.floor(startOfMonth.getTime() / 1000)
        const endTimestamp   = Math.floor(now.getTime() / 1000)

        const query = { start_time: startTimestamp, end_time: endTimestamp, limit: 180 }

        // Use the SDK's built-in get() — handles auth headers, base URL, retries automatically.
        // The SDK base URL already includes /v1, so paths here are relative to that.
        const [costResult, usageResult] = await Promise.allSettled([
            openai.get('/organization/costs',               { query }),
            openai.get('/organization/usage/completions',   { query }),
        ])

        // --- Parse costs ---
        let credit = null
        if (costResult.status === 'fulfilled') {
            const buckets = costResult.value?.data ?? []
            let total_cost_usd = 0
            const breakdown = []

            for (const bucket of buckets) {
                for (const result of (bucket.results ?? [])) {
                    total_cost_usd += result.amount?.value ?? 0
                    if (result.amount?.value) {
                        breakdown.push({
                            date:        new Date(bucket.start_time * 1000).toISOString().slice(0, 10),
                            cost_usd:    result.amount.value,
                            line_item:   result.line_item ?? null,
                        })
                    }
                }
            }

            credit = {
                period: {
                    start: startOfMonth.toISOString().slice(0, 10),
                    end:   now.toISOString().slice(0, 10),
                },
                total_cost_usd: Math.round(total_cost_usd * 10000) / 10000,
                breakdown,
            }
        } else {
            const status = costResult.reason?.status
            const msg    = costResult.reason?.message
            console.warn('[AdminAI] Costs API unavailable:', status, msg)
            credit = {
                error:   true,
                status,
                message: status === 403
                    ? 'API key lacks "Read usage" permission. Regenerate your key on platform.openai.com/api-keys with "Read usage" enabled.'
                    : msg,
            }
        }

        // --- Parse token usage ---
        let usage = null
        if (usageResult.status === 'fulfilled') {
            const buckets = usageResult.value?.data ?? []
            let total_input_tokens    = 0
            let total_output_tokens   = 0
            let total_requests        = 0

            for (const bucket of buckets) {
                for (const result of (bucket.results ?? [])) {
                    total_input_tokens  += result.input_tokens  ?? 0
                    total_output_tokens += result.output_tokens ?? 0
                    total_requests      += result.num_model_requests ?? 0
                }
            }

            usage = {
                period: {
                    start: startOfMonth.toISOString().slice(0, 10),
                    end:   now.toISOString().slice(0, 10),
                },
                total_input_tokens,
                total_output_tokens,
                total_tokens:   total_input_tokens + total_output_tokens,
                total_requests,
                buckets_count:  buckets.length,
            }
        } else {
            const status = usageResult.reason?.status
            const msg    = usageResult.reason?.message
            console.warn('[AdminAI] Usage API unavailable:', status, msg)
            usage = {
                error:   true,
                status,
                message: status === 403
                    ? 'API key lacks "Read usage" permission. Regenerate your key on platform.openai.com/api-keys with "Read usage" enabled.'
                    : msg,
            }
        }

        response = {
            ...SUCCESS_API_RESPONSE,
            data: {
                credit,
                usage,
            },
        }
    } catch (e) {
        console.error('[AdminAI] GET /account:', e)
        response = INTERNAL_SERVER_ERROR_API_RESPONSE
    }
    return res.status(response.status_code).json(response)
})

module.exports = router
