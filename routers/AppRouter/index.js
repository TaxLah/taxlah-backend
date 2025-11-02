const express = require('express')
const router = express.Router()

const AuthRouter            = require("../../controllers/AppController/Auth")
const AccountRouter         = require("../../controllers/AppController/Account")
const NotificationRouter    = require("../../controllers/AppController/Notification")
const PackageRouter         = require("../../controllers/AppController/Package")

router.use("/auth", AuthRouter)
router.use("/profile", AccountRouter)
router.use("/notification", NotificationRouter)
router.use("/package", PackageRouter)

module.exports = router