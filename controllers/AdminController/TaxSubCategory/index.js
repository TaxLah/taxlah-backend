const express = require('express')
const router  = express.Router()

const {
    DEFAULT_API_RESPONSE, INTERNAL_SERVER_ERROR_API_RESPONSE,
    SUCCESS_API_RESPONSE, BAD_REQUEST_API_RESPONSE, NOT_FOUND_API_RESPONSE, CHECK_EMPTY, sanitize
} = require('../../../configs/helper')

const { superauth } = require('../../../configs/auth')

const {
    AdminGetTaxSubcategoriesList,
    AdminGetTaxSubcategoryDetails,
    AdminCreateTaxSubcategory,
    AdminUpdateTaxSubcategory,
    AdminUpdateTaxSubcategoryStatus,
    AdminDeleteTaxSubcategory,
    AdminGetTaxSubcategoryStats,
    AdminCheckTaxSubcategoryDuplicate
} = require('../../../models/AdminModel/TaxSubcategory')

/* ─── GET /superadmin/tax-subcategories ─── */
// Query params: page, limit, search, status, tax_id (filter by parent category)
router.get('/', superauth(), async (req, res) => {
    let response = DEFAULT_API_RESPONSE
    try {
        const result = await AdminGetTaxSubcategoriesList(req.query)
        response = result.status
            ? { ...SUCCESS_API_RESPONSE, data: result.data }
            : INTERNAL_SERVER_ERROR_API_RESPONSE
    } catch (e) {
        console.error('[AdminController/TaxSubCategory] List:', e)
        response = INTERNAL_SERVER_ERROR_API_RESPONSE
    }
    return res.status(response.status_code).json(response)
})

/* ─── GET /superadmin/tax-subcategories/stats ─── */
router.get('/stats', superauth(), async (req, res) => {
    let response = DEFAULT_API_RESPONSE
    try {
        const result = await AdminGetTaxSubcategoryStats()
        response = result.status
            ? { ...SUCCESS_API_RESPONSE, data: result.data }
            : INTERNAL_SERVER_ERROR_API_RESPONSE
    } catch (e) {
        console.error('[AdminController/TaxSubCategory] Stats:', e)
        response = INTERNAL_SERVER_ERROR_API_RESPONSE
    }
    return res.status(response.status_code).json(response)
})

/* ─── GET /superadmin/tax-subcategories/:taxsub_id ─── */
router.get('/:taxsub_id', superauth(), async (req, res) => {
    let response = DEFAULT_API_RESPONSE
    try {
        const result = await AdminGetTaxSubcategoryDetails(req.params.taxsub_id)
        response = result.status
            ? { ...SUCCESS_API_RESPONSE, data: result.data }
            : { ...NOT_FOUND_API_RESPONSE, message: 'Tax subcategory not found.' }
    } catch (e) {
        console.error('[AdminController/TaxSubCategory] View:', e)
        response = INTERNAL_SERVER_ERROR_API_RESPONSE
    }
    return res.status(response.status_code).json(response)
})

/* ─── POST /superadmin/tax-subcategories ─── */
router.post('/', superauth(), async (req, res) => {
    let response = DEFAULT_API_RESPONSE
    try {
        const {
            tax_id, taxsub_code, taxsub_title, taxsub_description,
            taxsub_content, taxsub_max_claim = 0, taxsub_tags,
            taxsub_claim_for = 'Self', taxsub_requires_receipt = 'Yes',
            taxsub_sort_order = 0, status = 'Active'
        } = req.body

        if (CHECK_EMPTY(taxsub_title) || CHECK_EMPTY(tax_id)) {
            response = { ...BAD_REQUEST_API_RESPONSE, message: 'taxsub_title and tax_id are required.' }
            return res.status(response.status_code).json(response)
        }

        // Duplicate guard: same taxsub_code under the same tax_id
        if (!CHECK_EMPTY(taxsub_code)) {
            const dupCheck = await AdminCheckTaxSubcategoryDuplicate(taxsub_code, tax_id)
            if (dupCheck.exists) {
                response = {
                    ...BAD_REQUEST_API_RESPONSE,
                    message: `Tax subcategory with code "${taxsub_code}" already exists under this tax category.`
                }
                return res.status(response.status_code).json(response)
            }
        }

        const result = await AdminCreateTaxSubcategory({
            tax_id,
            taxsub_code:            taxsub_code ? sanitize(taxsub_code) : null,
            taxsub_title:           sanitize(taxsub_title),
            taxsub_description:     taxsub_description || null,
            taxsub_content:         taxsub_content ? JSON.stringify(taxsub_content) : null,
            taxsub_max_claim:       parseFloat(taxsub_max_claim),
            taxsub_tags:            taxsub_tags ? JSON.stringify(taxsub_tags) : null,
            taxsub_claim_for,
            taxsub_requires_receipt,
            taxsub_sort_order,
            status,
            created_date:  new Date(),
            last_modified: new Date()
        })

        response = result.status
            ? { ...SUCCESS_API_RESPONSE, message: 'Tax subcategory created.', data: { taxsub_id: result.data } }
            : INTERNAL_SERVER_ERROR_API_RESPONSE
    } catch (e) {
        console.error('[AdminController/TaxSubCategory] Create:', e)
        response = INTERNAL_SERVER_ERROR_API_RESPONSE
    }
    return res.status(response.status_code).json(response)
})

/* ─── PUT /superadmin/tax-subcategories/:taxsub_id ─── */
router.put('/:taxsub_id', superauth(), async (req, res) => {
    let response = DEFAULT_API_RESPONSE
    try {
        const { taxsub_id } = req.params
        const allowed = [
            'taxsub_title', 'taxsub_description', 'taxsub_content', 'taxsub_max_claim',
            'taxsub_tags', 'taxsub_claim_for', 'taxsub_requires_receipt', 'taxsub_sort_order'
        ]
        const update = {}
        allowed.forEach(k => {
            if (req.body[k] !== undefined) {
                const jsonFields = ['taxsub_content', 'taxsub_tags']
                update[k] = jsonFields.includes(k) && typeof req.body[k] === 'object'
                    ? JSON.stringify(req.body[k])
                    : req.body[k]
            }
        })

        // Allow updating taxsub_code + tax_id together, with duplicate check
        if (req.body.taxsub_code !== undefined && req.body.tax_id !== undefined) {
            const dupCheck = await AdminCheckTaxSubcategoryDuplicate(req.body.taxsub_code, req.body.tax_id, taxsub_id)
            if (dupCheck.exists) {
                response = {
                    ...BAD_REQUEST_API_RESPONSE,
                    message: `Tax subcategory with code "${req.body.taxsub_code}" already exists under this tax category.`
                }
                return res.status(response.status_code).json(response)
            }
            update.taxsub_code = sanitize(req.body.taxsub_code)
            update.tax_id      = req.body.tax_id
        }

        if (!Object.keys(update).length) {
            response = { ...BAD_REQUEST_API_RESPONSE, message: 'No updatable fields provided.' }
            return res.status(response.status_code).json(response)
        }

        update.last_modified = new Date()

        const result = await AdminUpdateTaxSubcategory(taxsub_id, update)
        response = result.status
            ? { ...SUCCESS_API_RESPONSE, message: 'Tax subcategory updated.' }
            : { ...NOT_FOUND_API_RESPONSE, message: 'Tax subcategory not found.' }
    } catch (e) {
        console.error('[AdminController/TaxSubCategory] Update:', e)
        response = INTERNAL_SERVER_ERROR_API_RESPONSE
    }
    return res.status(response.status_code).json(response)
})

/* ─── PUT /superadmin/tax-subcategories/:taxsub_id/status ─── */
router.put('/:taxsub_id/status', superauth(), async (req, res) => {
    let response = DEFAULT_API_RESPONSE
    try {
        const { status } = req.body
        const VALID = ['Active', 'Inactive', 'Deleted', 'Others']
        if (!status || !VALID.includes(status)) {
            response = { ...BAD_REQUEST_API_RESPONSE, message: `status must be one of: ${VALID.join(', ')}.` }
            return res.status(response.status_code).json(response)
        }

        const result = await AdminUpdateTaxSubcategoryStatus(req.params.taxsub_id, status)
        response = result.status
            ? { ...SUCCESS_API_RESPONSE, message: `Tax subcategory status updated to ${status}.` }
            : { ...NOT_FOUND_API_RESPONSE, message: 'Tax subcategory not found.' }
    } catch (e) {
        console.error('[AdminController/TaxSubCategory] UpdateStatus:', e)
        response = INTERNAL_SERVER_ERROR_API_RESPONSE
    }
    return res.status(response.status_code).json(response)
})

/* ─── DELETE /superadmin/tax-subcategories/:taxsub_id ─── */
router.delete('/:taxsub_id', superauth(), async (req, res) => {
    let response = DEFAULT_API_RESPONSE
    try {
        const result = await AdminDeleteTaxSubcategory(req.params.taxsub_id)
        response = result.status
            ? { ...SUCCESS_API_RESPONSE, message: 'Tax subcategory deleted.' }
            : { ...NOT_FOUND_API_RESPONSE, message: 'Tax subcategory not found.' }
    } catch (e) {
        console.error('[AdminController/TaxSubCategory] Delete:', e)
        response = INTERNAL_SERVER_ERROR_API_RESPONSE
    }
    return res.status(response.status_code).json(response)
})

module.exports = router
