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

// Configure storage
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        // Get upload type from request (image, document, etc.)
        const uploadType = req.body.upload_type || req.query.upload_type || 'document'
        
        // Create directory path based on upload type
        const uploadDir = path.join(BASE_UPLOAD_DIR, uploadType)
        
        // Ensure directory exists
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true })
        }
        
        cb(null, uploadDir)
    },
    filename: function (req, file, cb) {
        // Generate unique filename
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9)
        const ext = path.extname(file.originalname)
        const basename = path.basename(file.originalname, ext)
        const sanitizedBasename = basename.replace(/[^a-zA-Z0-9]/g, '_')
        
        cb(null, sanitizedBasename + '-' + uniqueSuffix + ext)
    }
})

// File filter for allowed file types
const fileFilter = function (req, file, cb) {
    // Get allowed types from request or use defaults
    const allowedTypes = req.body.allowed_types || req.query.allowed_types
    
    if (allowedTypes) {
        const types = allowedTypes.split(',').map(t => t.trim())
        const mimeType = file.mimetype
        const isAllowed = types.some(type => mimeType.includes(type))
        
        if (isAllowed) {
            cb(null, true)
        } else {
            cb(new Error(`File type not allowed. Allowed types: ${allowedTypes}`), false)
        }
    } else {
        // Default: allow images, PDFs, and common documents
        const allowedMimeTypes = [
            'image/heic',
            'image/heif',           // Alternative HEIC format
            'image/heic-sequence',  // For HEIC image sequences
            'image/heif-sequence',  // For HEIF image sequences
            'image/jpeg',
            'image/jpg',
            'image/png',
            'image/gif',
            'image/webp',
            'application/pdf',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        ]
        
        if (allowedMimeTypes.includes(file.mimetype)) {
            cb(null, true)
        } else {
            cb(new Error('File type not allowed. Allowed: images, PDF, Word, Excel'), false)
        }
    }
}

// Configure multer
const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 15 * 1024 * 1024 // 10MB limit
    }
})

// Helper function to get file URL based on environment
function getFileUrl(filePath) {
    // Remove base directory from path to get relative path
    const relativePath = filePath.replace(BASE_UPLOAD_DIR, '').replace(/\\/g, '/')
    
    // Get base URL based on environment
    let baseUrl
    if (ENV === 'production') {
        baseUrl = 'https://taxlah.com'
    } else if (ENV === 'staging') {
        baseUrl = 'https://staging.taxlah.com'
    } else if (ENV === 'development') {
        baseUrl = 'https://dev.taxlah.com' // development
    } else {
        baseUrl = 'http://localhost:3000' // local
    }
    
    return `${baseUrl}/assets${relativePath}`
}

module.exports = {
    upload,
    getFileUrl,
    BASE_UPLOAD_DIR
}
