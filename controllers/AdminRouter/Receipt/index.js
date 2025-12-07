const express = require('express')
const router = express.Router()

// Import controllers
const GetReceiptsList = require('./GetReceiptsList')
const GetReceiptDetails = require('./GetReceiptDetails')
const GetReceiptsByAccount = require('./GetReceiptsByAccount')
const UpdateReceipt = require('./UpdateReceipt')
const UpdateReceiptStatus = require('./UpdateReceiptStatus')
const DeleteReceipt = require('./DeleteReceipt')
const GetReceiptStats = require('./GetReceiptStats')

// Receipt routes (all protected with auth middleware in parent)
router.use(GetReceiptsList)
router.use(GetReceiptDetails)
router.use(GetReceiptsByAccount)
router.use(UpdateReceipt)
router.use(UpdateReceiptStatus)
router.use(DeleteReceipt)
router.use(GetReceiptStats)

module.exports = router
