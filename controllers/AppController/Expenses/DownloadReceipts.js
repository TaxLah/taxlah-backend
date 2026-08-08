/**
 * Bulk receipt download.
 *
 * GET /api/expenses/receipts-archive?year=YYYY
 *
 * Streams a ZIP of the caller's own receipt files for one year. Built for the
 * "I need my receipts back" case — LHDN audits ask for a year at a time, which
 * is why the unit here is a year rather than arbitrary filters.
 *
 * Optimised by construction rather than by cleverness:
 *   - files are read from disk and streamed straight into the ZIP with store-only
 *     compression (receipts are JPEG/PDF — already compressed; deflating them
 *     costs CPU for ~0% gain);
 *   - nothing is buffered in memory or written to a temp file — the response IS
 *     the archive being built;
 *   - every path is resolved and required to sit inside this account's own
 *     upload directory, so a poisoned DB URL cannot pull another user's file.
 */

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const {
    DEFAULT_API_RESPONSE,
    INTERNAL_SERVER_ERROR_API_RESPONSE,
    BAD_REQUEST_API_RESPONSE,
    NOT_FOUND_API_RESPONSE,
} = require('../../../configs/helper');
const { BASE_UPLOAD_DIR } = require('../../../configs/fileUpload');
const db = require('../../../utils/sqlbuilder');

/** Max files in one archive — a hard stop against a pathological request. */
const MAX_FILES = 500;

router.get('/', async (req, res) => {
    let response = { ...DEFAULT_API_RESPONSE };

    try {
        const account_id = req.user.account_id;
        const year = parseInt(req.query.year);

        if (!year || year < 2000 || year > 2100) {
            response = { ...BAD_REQUEST_API_RESPONSE, message: 'A valid year is required, e.g. ?year=2026' };
            return res.status(response.status_code).json(response);
        }

        const rows = await db.raw(
            `SELECT ae.expenses_id, ae.expenses_date, ae.expenses_merchant_name, r.receipt_image_url
               FROM account_expenses ae
               JOIN receipt r ON r.receipt_id = ae.receipt_id
              WHERE ae.account_id = ?
                AND ae.expenses_year = ?
                AND ae.status = 'Active'
                AND r.receipt_image_url IS NOT NULL
              ORDER BY ae.expenses_date
              LIMIT ${MAX_FILES}`,
            [account_id, year]
        );

        // Resolve every URL to a real file inside the caller's own directory.
        const ownDir = path.resolve(BASE_UPLOAD_DIR, String(account_id)) + path.sep;
        const files = [];
        const seen = new Set();

        for (const row of rows) {
            try {
                const urlPath = new URL(row.receipt_image_url, 'https://taxlah.com').pathname;
                const relative = urlPath.replace(/^\/asset\//, '');
                const abs = path.resolve(BASE_UPLOAD_DIR, relative);
                if (!abs.startsWith(ownDir) || !fs.existsSync(abs)) continue;
                if (seen.has(abs)) continue; // two expenses can share one receipt file
                seen.add(abs);

                // Name entries so the archive is browsable without the app:
                // 2026-04-03_MR-DIY_1234.jpg
                // expenses_date arrives as a JS Date from the driver, so it is
                // formatted rather than sliced — String(Date) starts "Thu Aug 14 …".
                const d = row.expenses_date instanceof Date
                    ? row.expenses_date
                    : new Date(row.expenses_date);
                const date = isNaN(d.getTime())
                    ? 'undated'
                    : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                const merchant = String(row.expenses_merchant_name || 'receipt')
                    .replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'receipt';
                files.push({ abs, name: `${date}_${merchant}_${row.expenses_id}${path.extname(abs)}` });
            } catch {
                // A malformed URL skips that file, never the archive.
            }
        }

        if (!files.length) {
            response = { ...NOT_FOUND_API_RESPONSE, message: `No receipt files found for ${year}.` };
            return res.status(response.status_code).json(response);
        }

        const archiver = require('archiver');
        const archive = archiver('zip', { store: true });

        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename="TaxLah-Receipts-${year}.zip"`);

        archive.on('error', (err) => {
            console.error('[DownloadReceipts] archive error:', err.message);
            // Headers are already gone; all we can do is cut the stream so the client
            // sees a broken download instead of a silently truncated "valid" ZIP.
            res.destroy(err);
        });

        archive.pipe(res);
        for (const f of files) {
            archive.file(f.abs, { name: f.name });
        }
        await archive.finalize();
    } catch (error) {
        console.error('[DownloadReceipts] Error:', error);
        if (!res.headersSent) {
            response = { ...INTERNAL_SERVER_ERROR_API_RESPONSE, message: 'Could not build the receipts archive.' };
            return res.status(response.status_code).json(response);
        }
        res.destroy(error);
    }
});

module.exports = router;
