const express = require('express')
const router = express.Router()

const AuthRouter            = require("../../controllers/AdminRouter/Auth")
const UserManagementRouter  = require("../../controllers/AdminRouter/UserManagement")
const TaxManagementRouter   = require("../../controllers/AdminRouter/TaxManagement")
const MerchantRouter        = require("../../controllers/AdminRouter/Merchant")
const ReceiptRouter         = require("../../controllers/AdminRouter/Receipt")
const ReceiptCategoryRouter = require("../../controllers/AdminRouter/ReceiptCategory")

router.use("/auth", AuthRouter)
router.use("/users", UserManagementRouter)
router.use("/tax", TaxManagementRouter)
router.use("/merchant", MerchantRouter)
router.use("/receipt", ReceiptRouter)
router.use("/receipt-category", ReceiptCategoryRouter)

module.exports = router
