const express = require('express')
const router = express.Router()

const AuthRouter            = require("../../controllers/AdminRouter/Auth")
const UserManagementRouter  = require("../../controllers/AdminRouter/UserManagement")
const TaxManagementRouter   = require("../../controllers/AdminRouter/TaxManagement")

router.use("/auth", AuthRouter)
router.use("/users", UserManagementRouter)
router.use("/tax", TaxManagementRouter)

module.exports = router
