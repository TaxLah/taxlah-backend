const express = require('express')
const router = express.Router()

const GetUsersList          = require("./GetUsersList")
const GetUserDetails        = require("./GetUserDetails")
const CreateUser            = require("./CreateUser")
const UpdateUser            = require("./UpdateUser")
const UpdateUserStatus      = require("./UpdateUserStatus")
const ResetUserPassword     = require("./ResetUserPassword")
const DeleteUser            = require("./DeleteUser")
const GetUserStats          = require("./GetUserStats")
const GetUserActivity       = require("./GetUserActivity")

router.use("/list", GetUsersList)
router.use("/view", GetUserDetails)
router.use("/create", CreateUser)
router.use("/update", UpdateUser)
router.use("/status", UpdateUserStatus)
router.use("/reset-password", ResetUserPassword)
router.use("/delete", DeleteUser)
router.use("/stats", GetUserStats)
router.use("/activity", GetUserActivity)

module.exports = router
