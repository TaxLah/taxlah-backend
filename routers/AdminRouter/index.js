const express = require('express')
const router = express.Router()

const AuthRouter            = require("../../controllers/AdminRouter/Auth")
const UserManagementRouter  = require("../../controllers/AdminRouter/UserManagement")

router.use("/auth", AuthRouter)
router.use("/users", UserManagementRouter)

module.exports = router
