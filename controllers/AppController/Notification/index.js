const express = require('express')
const { auth } = require('../../../configs/auth')
const router = express.Router()

router.use("/", auth(), require("./GetListNotification"))

module.exports = router