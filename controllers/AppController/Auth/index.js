const express = require('express')
const router = express.Router()

const Onboarding    = require("./AuthRegister")
const SignIn        = require("./AuthLogin")
const Authenticate  = require("./Authenticate")

router.use("/onboard", Onboarding)
router.use("/signin", SignIn)
router.use("/authenticate", Authenticate)

module.exports = router