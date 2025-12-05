const express = require('express')
const router = express.Router()
const { upload, getFileUrl } = require('../../configs/fileUpload')
const { 
    DEFAULT_API_RESPONSE, 
    INTERNAL_SERVER_ERROR_API_RESPONSE,
    BAD_REQUEST_API_RESPONSE,
    SUCCESS_API_RESPONSE
} = require('../../configs/helper')

/**
 * POST /file-uploader
 * Upload single or multiple files
 * Form-data: 
 *  - file or files (single or multiple files)
 *  - upload_type (optional: 'image', 'document', default: 'document')
 *  - allowed_types (optional: comma-separated mime types)
 */
router.post("/", upload.array('files', 10), async(req, res) => {
    let response = DEFAULT_API_RESPONSE

    try {
        const files = req.files

        if(!files || files.length === 0) {
            response = BAD_REQUEST_API_RESPONSE
            response.message = "Error. No files uploaded."
            return res.status(response.status_code).json(response)
        }

        console.log("File Upload Request - Files: ", files.length)

        // Process uploaded files
        const uploadedFiles = files.map(file => {
            const fileUrl = getFileUrl(file.path)
            
            return {
                filename: file.filename,
                original_name: file.originalname,
                mimetype: file.mimetype,
                size: file.size,
                path: file.path,
                url: fileUrl
            }
        })

        response = SUCCESS_API_RESPONSE
        response.message = `${files.length} file(s) uploaded successfully.`
        response.data = {
            files: uploadedFiles,
            count: files.length
        }

        res.status(response.status_code).json(response)

    } catch (error) {
        console.log("Error File Upload: ", error)
        response = INTERNAL_SERVER_ERROR_API_RESPONSE
        response.message = error.message || "Error. An error occurred while uploading files."
        res.status(response.status_code).json(response)
    }
})

/**
 * POST /file-uploader/single
 * Upload single file
 * Form-data: 
 *  - file (single file)
 *  - upload_type (optional: 'image', 'document', default: 'document')
 *  - allowed_types (optional: comma-separated mime types)
 */
router.post("/single", upload.single('file'), async(req, res) => {
    let response = DEFAULT_API_RESPONSE

    try {
        const file = req.file

        if(!file) {
            response = BAD_REQUEST_API_RESPONSE
            response.message = "Error. No file uploaded."
            return res.status(response.status_code).json(response)
        }

        console.log("Single File Upload Request - File: ", file.originalname)

        const fileUrl = getFileUrl(file.path)

        response = SUCCESS_API_RESPONSE
        response.message = "File uploaded successfully."
        response.data = {
            filename: file.filename,
            original_name: file.originalname,
            mimetype: file.mimetype,
            size: file.size,
            path: file.path,
            url: fileUrl
        }

        res.status(response.status_code).json(response)

    } catch (error) {
        console.log("Error Single File Upload: ", error)
        response = INTERNAL_SERVER_ERROR_API_RESPONSE
        response.message = error.message || "Error. An error occurred while uploading file."
        res.status(response.status_code).json(response)
    }
})

module.exports = router
