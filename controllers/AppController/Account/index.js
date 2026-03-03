const express = require('express')
const router = express.Router()
const { auth } = require('../../../configs/auth')

const GetProfile            = require("./GetProfile")
const UpdateProfile         = require("./UpdateProfile")
const UpdateProfilePicture  = require("./UpdateProfilePicture")
const DeleteProfile         = require("./DeleteProfile")

router.get("/", auth(), GetProfile)
router.patch("/", auth(), UpdateProfile)
// router.put("/", auth(), UpdateProfile)
router.use("/picture", auth(), UpdateProfilePicture)
router.use("/", auth(), DeleteProfile)

module.exports = router