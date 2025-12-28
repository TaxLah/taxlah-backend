const express = require('express')
const router = express.Router()
const FileUploaderController = require('../../controllers/FileUploader')
const FileUploaderController2 = require("../../controllers/FileUploader/FileExtractor")

// File upload routes
router.use("/", FileUploaderController)
router.use("/v2", FileUploaderController2)

module.exports = router
