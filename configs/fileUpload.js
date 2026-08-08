const multer = require('multer')
const path = require('path')
const fs = require('fs')

// Get environment
const ENV = process.env.NODE_ENV || 'development'

// Base upload directory
const BASE_UPLOAD_DIR = path.join(__dirname, '../asset')

// Ensure assets directory exists
if (!fs.existsSync(BASE_UPLOAD_DIR)) {
    fs.mkdirSync(BASE_UPLOAD_DIR, { recursive: true })
}

/**
 * Allowed upload types, and the extension we will store each one as.
 *
 * The stored extension is derived from this map, never from the client-supplied
 * filename. Files under asset/ are served statically, so letting the client choose the
 * extension means letting it choose the Content-Type the browser sees — upload
 * "invoice.html" with Content-Type: image/png and you get stored XSS on our own origin.
 */
const ALLOWED_MIME_EXT = {
    'image/heic': '.heic',
    'image/heif': '.heif',
    'image/heic-sequence': '.heic',
    'image/heif-sequence': '.heif',
    'image/jpeg': '.jpg',
    'image/jpg': '.jpg',
    'image/png': '.png',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'application/pdf': '.pdf'
}

// Configure storage
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        // Scope uploads to the authenticated user's folder: asset/{account_id}/
        const account_id = req.user?.account_id || req.user?.aid || 'unknown'

        const uploadDir = path.join(BASE_UPLOAD_DIR, String(account_id))

        // Ensure per-user directory exists
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true })
        }

        cb(null, uploadDir)
    },
    filename: function (req, file, cb) {
        // Generate unique filename
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9)
        const clientExt = path.extname(file.originalname)
        const basename = path.basename(file.originalname, clientExt)
        const sanitizedBasename = basename.replace(/[^a-zA-Z0-9]/g, '_') || 'file'

        // Extension comes from the validated mime type, not from the client.
        const ext = ALLOWED_MIME_EXT[file.mimetype] || '.bin'

        cb(null, sanitizedBasename + '-' + uniqueSuffix + ext)
    }
})

// File filter for allowed file types
const fileFilter = function (req, file, cb) {
    // NOTE: the allowed_types override that used to be read from req.body/req.query was
    // removed deliberately — it let the caller widen its own allowlist.
    if (Object.prototype.hasOwnProperty.call(ALLOWED_MIME_EXT, file.mimetype)) {
        cb(null, true)
    } else {
        const err = new Error('File type not allowed. Allowed: JPEG, PNG, GIF, WebP, HEIC, PDF')
        err.code = 'LIMIT_UNEXPECTED_FILE_TYPE'
        cb(err, false)
    }
}

/**
 * Magic-byte signatures for the formats we accept.
 *
 * file.mimetype is just the client's Content-Type header, so it proves nothing. This
 * checks the actual leading bytes on disk after multer has written the file.
 */
function sniffFormat(buf) {
    if (buf.length >= 3 && buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return 'image/jpeg'
    if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]))) return 'image/png'
    if (buf.length >= 6 && (buf.subarray(0, 6).toString('latin1') === 'GIF87a' || buf.subarray(0, 6).toString('latin1') === 'GIF89a')) return 'image/gif'
    if (buf.length >= 12 && buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp'
    if (buf.length >= 5 && buf.subarray(0, 5).toString('latin1') === '%PDF-') return 'application/pdf'
    // HEIC/HEIF: ISO-BMFF box — bytes 4..8 are "ftyp", brand follows
    if (buf.length >= 12 && buf.subarray(4, 8).toString('latin1') === 'ftyp') {
        const brand = buf.subarray(8, 12).toString('latin1')
        if (['heic', 'heix', 'hevc', 'heim', 'heis', 'hevm', 'mif1', 'msf1', 'avif'].includes(brand)) return 'image/heic'
    }
    return null
}

// Formats are interchangeable within a group — a .jpg re-encoded as .heic by the OS still
// belongs to the image family we accept, so we only care that it sniffs as an allowed type.
const ALLOWED_SNIFFED = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf', 'image/heic'])

function inspectOne(file) {
    let fd
    try {
        fd = fs.openSync(file.path, 'r')
        const buf = Buffer.alloc(16)
        const read = fs.readSync(fd, buf, 0, 16, 0)
        const sniffed = sniffFormat(buf.subarray(0, read))
        return sniffed && ALLOWED_SNIFFED.has(sniffed) ? null : file.path
    } catch (e) {
        return file.path
    } finally {
        if (fd !== undefined) { try { fs.closeSync(fd) } catch (_) {} }
    }
}

/**
 * Run after multer. Deletes anything whose real content does not match an allowed format.
 */
const verifyUploadedFiles = (req, res, next) => {
    const files = []
    if (req.file) files.push(req.file)
    if (Array.isArray(req.files)) files.push(...req.files)
    else if (req.files && typeof req.files === 'object') {
        for (const key of Object.keys(req.files)) files.push(...req.files[key])
    }

    const rejected = files.map(inspectOne).filter(Boolean)

    if (rejected.length) {
        for (const p of rejected) { try { fs.unlinkSync(p) } catch (_) {} }
        const err = new Error('File content does not match an allowed format. Allowed: JPEG, PNG, GIF, WebP, HEIC, PDF')
        err.code = 'LIMIT_UNEXPECTED_FILE_TYPE'
        return next(err)
    }

    return next()
}

// Configure multer
const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 15 * 1024 * 1024 // 15MB limit
    }
})

/**
 * Builds the public URL for a stored file.
 *
 * @param {string} filePath - absolute path of the file under BASE_UPLOAD_DIR
 * @param {object} [req]    - the incoming request, when available
 *
 * Production and staging keep their fixed, known-correct domains. For
 * development it derives the base from the request that uploaded the file, so a
 * server run locally (e.g. http://192.168.0.248:3000) serves the image back at
 * the same host the app is talking to. The previous hardcoded
 * https://dev.taxlah.com meant a receipt uploaded to a local machine got a URL
 * pointing at a server that never received the file — the image then rendered
 * blank, which is exactly the "new expense photo doesn't show" report.
 */
function getFileUrl(filePath, req = null) {
    const relativePath = filePath.replace(BASE_UPLOAD_DIR, '').replace(/\\/g, '/')

    let baseUrl
    if (ENV === 'production') {
        baseUrl = 'https://taxlah.com'
    } else if (ENV === 'staging') {
        baseUrl = 'https://staging.taxlah.com'
    } else {
        // development / local — follow the request host so the file is served
        // from wherever it was actually stored. X-Forwarded-* is honoured for the
        // real dev.taxlah.com deployment behind nginx.
        if (req) {
            const proto = req.headers['x-forwarded-proto'] || req.protocol || 'http'
            const host = req.headers['x-forwarded-host'] || req.get('host')
            if (host) baseUrl = `${proto}://${host}`
        }
        if (!baseUrl) baseUrl = 'https://dev.taxlah.com'
    }

    return `${baseUrl}/asset${relativePath}`
}

module.exports = {
    upload,
    verifyUploadedFiles,
    getFileUrl,
    BASE_UPLOAD_DIR,
    ALLOWED_MIME_EXT
}
