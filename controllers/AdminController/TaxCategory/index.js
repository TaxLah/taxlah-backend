const express = require('express')
const router  = express.Router()

const {
    DEFAULT_API_RESPONSE, INTERNAL_SERVER_ERROR_API_RESPONSE,
    SUCCESS_API_RESPONSE, BAD_REQUEST_API_RESPONSE, NOT_FOUND_API_RESPONSE, CHECK_EMPTY, sanitize
} = require('../../../configs/helper')

const { superauth } = require('../../../configs/auth')

const {
    AdminGetTaxCategoriesList,
    AdminGetTaxCategoryDetails,
    AdminCreateTaxCategory,
    AdminUpdateTaxCategory,
    AdminUpdateTaxCategoryStatus,
    AdminDeleteTaxCategory,
    AdminGetTaxCategoryStats,
    AdminCheckTaxCategoryDuplicate
} = require('../../../models/AdminModel/TaxCategory')

/* ─── GET /superadmin/tax-categories ─── */
// Query params: page, limit, search, status, year (e.g. ?year=2024)
router.get('/', superauth(), async (req, res) => {
    let response = DEFAULT_API_RESPONSE
    try {
        const result = await AdminGetTaxCategoriesList(req.query)
        response = result.status
            ? { ...SUCCESS_API_RESPONSE, data: result.data }
            : INTERNAL_SERVER_ERROR_API_RESPONSE
    } catch (e) {
        console.error('[AdminController/TaxCategory] List:', e)
        response = INTERNAL_SERVER_ERROR_API_RESPONSE
    }
    return res.status(response.status_code).json(response)
})

/* ─── GET /superadmin/tax-categories/stats ─── */
router.get('/stats', superauth(), async (req, res) => {
    let response = DEFAULT_API_RESPONSE
    try {
        const result = await AdminGetTaxCategoryStats()
        response = result.status
            ? { ...SUCCESS_API_RESPONSE, data: result.data }
            : INTERNAL_SERVER_ERROR_API_RESPONSE
    } catch (e) {
        console.error('[AdminController/TaxCategory] Stats:', e)
        response = INTERNAL_SERVER_ERROR_API_RESPONSE
    }
    return res.status(response.status_code).json(response)
})

/* ─── GET /superadmin/tax-categories/:tax_id ─── */
router.get('/:tax_id', superauth(), async (req, res) => {
    let response = DEFAULT_API_RESPONSE
    try {
        const result = await AdminGetTaxCategoryDetails(req.params.tax_id)
        response = result.status
            ? { ...SUCCESS_API_RESPONSE, data: result.data }
            : { ...NOT_FOUND_API_RESPONSE, message: 'Tax category not found.' }
    } catch (e) {
        console.error('[AdminController/TaxCategory] View:', e)
        response = INTERNAL_SERVER_ERROR_API_RESPONSE
    }
    return res.status(response.status_code).json(response)
})

/* ─── POST /superadmin/tax-categories ─── */
router.post('/', superauth(), async (req, res) => {
    let response = DEFAULT_API_RESPONSE
    try {
        const {
            tax_code, tax_title, tax_description, tax_max_claim = 0,
            tax_year, tax_content, tax_mapping_status = 'Draft',
            tax_published_date, tax_based_on_year, tax_eligibility_criteria,
            tax_requires_receipt = 'No', tax_claim_for = 'Self',
            tax_frequency = 'Yearly', tax_sort_order = 0,
            tax_claim_type = 'Self', tax_is_auto_claim = 'No',
            status = 'Active'
        } = req.body

        if (CHECK_EMPTY(tax_title) || CHECK_EMPTY(tax_year)) {
            response = { ...BAD_REQUEST_API_RESPONSE, message: 'tax_title and tax_year are required.' }
            return res.status(response.status_code).json(response)
        }

        // Duplicate guard: same tax_code in the same year cannot coexist
        if (!CHECK_EMPTY(tax_code)) {
            const dupCheck = await AdminCheckTaxCategoryDuplicate(tax_code, tax_year)
            if (dupCheck.exists) {
                response = {
                    ...BAD_REQUEST_API_RESPONSE,
                    message: `Tax category with code "${tax_code}" already exists for year ${tax_year}. Each year may only have one entry per code.`
                }
                return res.status(response.status_code).json(response)
            }
        }

        const VALID_MAPPING = ['Draft', 'Preliminary', 'Official', 'Archived']
        if (!VALID_MAPPING.includes(tax_mapping_status)) {
            response = { ...BAD_REQUEST_API_RESPONSE, message: `tax_mapping_status must be one of: ${VALID_MAPPING.join(', ')}.` }
            return res.status(response.status_code).json(response)
        }

        const result = await AdminCreateTaxCategory({
            tax_code:               tax_code ? sanitize(tax_code) : null,
            tax_title:              sanitize(tax_title),
            tax_description:        tax_description || null,
            tax_max_claim:          parseFloat(tax_max_claim),
            tax_year,
            tax_content:            tax_content ? JSON.stringify(tax_content) : null,
            tax_mapping_status,
            tax_published_date:     tax_published_date || null,
            tax_based_on_year:      tax_based_on_year  || null,
            tax_eligibility_criteria: tax_eligibility_criteria ? JSON.stringify(tax_eligibility_criteria) : null,
            tax_requires_receipt,
            tax_claim_for,
            tax_frequency,
            tax_sort_order,
            tax_claim_type,
            tax_is_auto_claim,
            status,
            created_date:  new Date(),
            last_modified: new Date()
        })

        response = result.status
            ? { ...SUCCESS_API_RESPONSE, message: 'Tax category created.', data: { tax_id: result.data } }
            : INTERNAL_SERVER_ERROR_API_RESPONSE
    } catch (e) {
        console.error('[AdminController/TaxCategory] Create:', e)
        response = INTERNAL_SERVER_ERROR_API_RESPONSE
    }
    return res.status(response.status_code).json(response)
})

/* ─── PUT /superadmin/tax-categories/:tax_id ─── */
router.put('/:tax_id', superauth(), async (req, res) => {
    let response = DEFAULT_API_RESPONSE
    try {
        const { tax_id } = req.params
        const allowed = [
            'tax_title', 'tax_description', 'tax_max_claim', 'tax_content',
            'tax_mapping_status', 'tax_published_date', 'tax_based_on_year',
            'tax_eligibility_criteria', 'tax_requires_receipt', 'tax_claim_for',
            'tax_frequency', 'tax_sort_order', 'tax_claim_type', 'tax_is_auto_claim'
        ]
        const update = {}
        allowed.forEach(k => {
            if (req.body[k] !== undefined) {
                const jsonFields = ['tax_content', 'tax_eligibility_criteria']
                update[k] = jsonFields.includes(k) && typeof req.body[k] === 'object'
                    ? JSON.stringify(req.body[k])
                    : req.body[k]
            }
        })

        // Allow updating tax_code + tax_year together with duplicate check
        if (req.body.tax_code !== undefined && req.body.tax_year !== undefined) {
            const dupCheck = await AdminCheckTaxCategoryDuplicate(req.body.tax_code, req.body.tax_year, tax_id)
            if (dupCheck.exists) {
                response = {
                    ...BAD_REQUEST_API_RESPONSE,
                    message: `Tax category with code "${req.body.tax_code}" already exists for year ${req.body.tax_year}.`
                }
                return res.status(response.status_code).json(response)
            }
            update.tax_code = sanitize(req.body.tax_code)
            update.tax_year = req.body.tax_year
        }

        if (!Object.keys(update).length) {
            response = { ...BAD_REQUEST_API_RESPONSE, message: 'No updatable fields provided.' }
            return res.status(response.status_code).json(response)
        }

        update.last_modified = new Date()

        const result = await AdminUpdateTaxCategory(tax_id, update)
        response = result.status
            ? { ...SUCCESS_API_RESPONSE, message: 'Tax category updated.' }
            : { ...NOT_FOUND_API_RESPONSE, message: 'Tax category not found.' }
    } catch (e) {
        console.error('[AdminController/TaxCategory] Update:', e)
        response = INTERNAL_SERVER_ERROR_API_RESPONSE
    }
    return res.status(response.status_code).json(response)
})

/* ─── PUT /superadmin/tax-categories/:tax_id/status ─── */
router.put('/:tax_id/status', superauth(), async (req, res) => {
    let response = DEFAULT_API_RESPONSE
    try {
        const { status } = req.body
        const VALID = ['Active', 'Inactive', 'Deleted', 'Others']
        if (!status || !VALID.includes(status)) {
            response = { ...BAD_REQUEST_API_RESPONSE, message: `status must be one of: ${VALID.join(', ')}.` }
            return res.status(response.status_code).json(response)
        }

        const result = await AdminUpdateTaxCategoryStatus(req.params.tax_id, status)
        response = result.status
            ? { ...SUCCESS_API_RESPONSE, message: `Tax category status updated to ${status}.` }
            : { ...NOT_FOUND_API_RESPONSE, message: 'Tax category not found.' }
    } catch (e) {
        console.error('[AdminController/TaxCategory] UpdateStatus:', e)
        response = INTERNAL_SERVER_ERROR_API_RESPONSE
    }
    return res.status(response.status_code).json(response)
})

/* ─── DELETE /superadmin/tax-categories/:tax_id ─── */
router.delete('/:tax_id', superauth(), async (req, res) => {
    let response = DEFAULT_API_RESPONSE
    try {
        const result = await AdminDeleteTaxCategory(req.params.tax_id)
        response = result.status
            ? { ...SUCCESS_API_RESPONSE, message: 'Tax category deleted.' }
            : { ...NOT_FOUND_API_RESPONSE, message: 'Tax category not found.' }
    } catch (e) {
        console.error('[AdminController/TaxCategory] Delete:', e)
        response = INTERNAL_SERVER_ERROR_API_RESPONSE
    }
    return res.status(response.status_code).json(response)
})

module.exports = router
