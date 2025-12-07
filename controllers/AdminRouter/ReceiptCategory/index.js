const express = require('express')
const router = express.Router()

// Import controllers
const GetReceiptCategoriesList = require('./GetReceiptCategoriesList')
const GetReceiptCategoryDetails = require('./GetReceiptCategoryDetails')
const CreateReceiptCategory = require('./CreateReceiptCategory')
const UpdateReceiptCategory = require('./UpdateReceiptCategory')
const UpdateReceiptCategoryStatus = require('./UpdateReceiptCategoryStatus')
const DeleteReceiptCategory = require('./DeleteReceiptCategory')
const GetReceiptCategoryStats = require('./GetReceiptCategoryStats')

// Receipt category routes (all protected with auth middleware in parent)
router.use(GetReceiptCategoriesList)
router.use(GetReceiptCategoryDetails)
router.use(CreateReceiptCategory)
router.use(UpdateReceiptCategory)
router.use(UpdateReceiptCategoryStatus)
router.use(DeleteReceiptCategory)
router.use(GetReceiptCategoryStats)

module.exports = router
