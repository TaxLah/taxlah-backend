const express = require('express')
const router = express.Router()

const AuthRouter            = require("../../controllers/AppController/Auth")
const AccountRouter         = require("../../controllers/AppController/Account")
const DeviceRouter          = require("../../controllers/AppController/Device")
const NotificationRouter    = require("../../controllers/AppController/Notification")
const PackageRouter         = require("../../controllers/AppController/Package")
const TaxCategory           = require("../../controllers/AppController/TaxCategory")
const ReceiptCategoryRouter = require("../../controllers/AppController/ReceiptCategory")
const ReceiptRouter         = require("../../controllers/AppController/Receipt")

router.use("/auth", AuthRouter)
router.use("/profile", AccountRouter)
router.use("/device", DeviceRouter)
router.use("/notification", NotificationRouter)
router.use("/package", PackageRouter)
router.use("/tax-category", TaxCategory)
router.use("/receipt-category", ReceiptCategoryRouter)
router.use("/receipt", ReceiptRouter)

module.exports = router