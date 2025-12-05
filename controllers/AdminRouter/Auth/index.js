const express = require('express')
const router = express.Router()

const AdminLogin        = require("./AdminLogin")
const AdminAuthenticate = require("./AdminAuthenticate")

router.use("/login", AdminLogin)
router.use("/authenticate", AdminAuthenticate)

module.exports = router
