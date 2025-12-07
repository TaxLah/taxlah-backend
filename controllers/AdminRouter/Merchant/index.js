const express = require('express')
const router = express.Router()

// Import all merchant controllers
const GetMerchantsList      = require("./GetMerchantsList")
const GetMerchantDetails    = require("./GetMerchantDetails")
const CreateMerchant        = require("./CreateMerchant")
const UpdateMerchant        = require("./UpdateMerchant")
const UpdateMerchantStatus  = require("./UpdateMerchantStatus")
const DeleteMerchant        = require("./DeleteMerchant")
const GetMerchantStats      = require("./GetMerchantStats")

// Mount individual routers at root to avoid path duplication
// Each controller handles its own HTTP method and path
router.use("/", GetMerchantsList)
router.use("/", GetMerchantDetails)
router.use("/", CreateMerchant)
router.use("/", UpdateMerchant)
router.use("/", UpdateMerchantStatus)
router.use("/", DeleteMerchant)
router.use("/", GetMerchantStats)

module.exports = router
