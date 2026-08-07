const express = require('express')
const router = express.Router()
const { auth } = require('../../configs/auth')
const FileUploaderController = require('../../controllers/FileUploader')
const FileUploaderController2 = require("../../controllers/FileUploader/FileExtractor")

// File upload routes.
// auth() is required here: without it req.user is undefined, uploads land in
// asset/unknown/, and /asset is served statically — i.e. anonymous write access to a
// public directory on the production origin.
router.use("/", auth(), FileUploaderController)
router.use("/v2", FileUploaderController2)

module.exports = router
