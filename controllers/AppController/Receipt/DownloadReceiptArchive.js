/**
 * Bulk receipt download for the Receipts screen.
 *
 * GET /api/receipt/archive?<same filters as /receipt/list>
 *
 * Streams a ZIP of the caller's own receipt files matching the current filter —
 * with no filter that is every receipt, with a filter it is exactly what the
 * user was looking at. Modelled on the expenses archive: store-only compression
 * (receipts are already-compressed JPEG/PDF), nothing buffered in memory, and
 * every path resolved and confined to the account's own upload directory so a
 * poisoned DB URL cannot reach another user's file.
 */

const express = require('express')
const router = express.Router()
const path = require('path')
const fs = require('fs')
const {
    DEFAULT_API_RESPONSE,
    INTERNAL_SERVER_ERROR_API_RESPONSE,
    NOT_FOUND_API_RESPONSE,
    UNAUTHORIZED_API_RESPONSE,
    ERROR_UNAUTHENTICATED,
    CHECK_EMPTY
} = require('../../../configs/helper')
const { BASE_UPLOAD_DIR } = require('../../../configs/fileUpload')
const { GetReceiptFilesForArchive } = require('../../../models/AppModel/Receipt')

router.get('/', async (req, res) => {
    let response = { ...DEFAULT_API_RESPONSE }
    const user = req.user || null

    if (CHECK_EMPTY(user)) {
        response = { ...UNAUTHORIZED_API_RESPONSE, message: ERROR_UNAUTHENTICATED }
        return res.status(response.status_code).json(response)
    }

    try {
        const account_id = user.account_id

        const rows = await GetReceiptFilesForArchive(account_id, {
            search: req.query.search,
            rc_id: req.query.rc_id,
            status: req.query.status,
            date_from: req.query.date_from,
            date_to: req.query.date_to,
            amount_min: req.query.amount_min,
            amount_max: req.query.amount_max
        })

        const ownDir = path.resolve(BASE_UPLOAD_DIR, String(account_id)) + path.sep
        const files = []
        const seen = new Set()

        for (const row of rows) {
            try {
                const urlPath = new URL(row.receipt_image_url, 'https://taxlah.com').pathname
                const relative = urlPath.replace(/^\/asset\//, '')
                const abs = path.resolve(BASE_UPLOAD_DIR, relative)
                if (!abs.startsWith(ownDir) || !fs.existsSync(abs)) continue
                if (seen.has(abs)) continue
                seen.add(abs)

                const d = row.created_date instanceof Date ? row.created_date : new Date(row.created_date)
                const date = isNaN(d.getTime())
                    ? 'undated'
                    : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
                const name = String(row.receipt_name || 'receipt')
                    .replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'receipt'
                files.push({ abs, name: `${date}_${name}_${row.receipt_id}${path.extname(abs)}` })
            } catch {
                // A malformed URL skips that file, never the whole archive.
            }
        }

        if (!files.length) {
            response = { ...NOT_FOUND_API_RESPONSE, message: 'No receipt files found for the current filter.' }
            return res.status(response.status_code).json(response)
        }

        const archiver = require('archiver')
        const archive = archiver('zip', { store: true })

        res.setHeader('Content-Type', 'application/zip')
        res.setHeader('Content-Disposition', `attachment; filename="TaxLah-Receipts.zip"`)

        archive.on('error', (err) => {
            console.error('[DownloadReceiptArchive] archive error:', err.message)
            res.destroy(err)
        })

        archive.pipe(res)
        for (const f of files) archive.file(f.abs, { name: f.name })
        await archive.finalize()
    } catch (error) {
        console.error('[DownloadReceiptArchive] Error:', error)
        if (!res.headersSent) {
            response = { ...INTERNAL_SERVER_ERROR_API_RESPONSE, message: 'Could not build the receipts archive.' }
            return res.status(response.status_code).json(response)
        }
        res.destroy(error)
    }
})

module.exports = router
