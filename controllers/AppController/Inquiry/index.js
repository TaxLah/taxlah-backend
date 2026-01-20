const express = require('express')
const router = express.Router()

const CreateInquiryRouter = require("./CreateInquiry")

// Public route - no authentication required
router.use("/", CreateInquiryRouter)

module.exports = router
