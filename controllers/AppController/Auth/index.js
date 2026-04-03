const express = require('express')
const router = express.Router()

const Onboarding      = require("./AuthRegister")
const SignIn          = require("./AuthLogin")
const Authenticate    = require("./Authenticate")
const ForgotPassword  = require("./AuthForgotPassword")

router.use("/onboard",          Onboarding)
router.use("/signin",           SignIn)
router.use("/authenticate",     Authenticate)
router.use("/",                 ForgotPassword)  // POST /forgot-password  &  POST /reset-password

module.exports = router