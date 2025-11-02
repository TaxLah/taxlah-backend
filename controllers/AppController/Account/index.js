const express = require('express')
const router = express.Router()
const { auth } = require('../../../configs/auth')

const GetProfile    = require("./GetProfile")
const UpdateProfile = require("./UpdateProfile")

router.get("/", auth(), GetProfile)
router.patch("/", auth(), UpdateProfile)

module.exports = router