const express = require('express')
const router = express.Router()
const FileUploaderController = require('../../controllers/FileUploader')

// File upload routes
router.use("/", FileUploaderController)

module.exports = router
