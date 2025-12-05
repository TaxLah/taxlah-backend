const express = require('express')
const router = express.Router()
const { auth } = require('../../../configs/auth')

// Import controllers
const GetReceiptsList = require('./GetReceiptsList')
const GetReceiptDetails = require('./GetReceiptDetails')
const CreateReceipt = require('./CreateReceipt')
const UpdateReceipt = require('./UpdateReceipt')
const DeleteReceipt = require('./DeleteReceipt')
const GetReceiptStats = require('./GetReceiptStats')

// Receipt routes (all protected with auth middleware)
router.use("/list", auth(), GetReceiptsList)
router.use("/details", auth(), GetReceiptDetails)
router.use("/create", auth(), CreateReceipt)
router.use("/update", auth(), UpdateReceipt)
router.use("/delete", auth(), DeleteReceipt)
router.use("/stats", auth(), GetReceiptStats)

module.exports = router
