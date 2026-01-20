const express = require('express')
const router = express.Router()

const GetInquiriesListRouter = require("./GetInquiriesList")
const GetInquiryDetailsRouter = require("./GetInquiryDetails")
const UpdateInquiryStatusRouter = require("./UpdateInquiryStatus")
const DeleteInquiryRouter = require("./DeleteInquiry")

router.use("/list", GetInquiriesListRouter)
router.use("/details", GetInquiryDetailsRouter)
router.use("/status", UpdateInquiryStatusRouter)
router.use("/delete", DeleteInquiryRouter)

module.exports = router
