const express = require('express')
const router = express.Router()

const GetCategoriesList         = require("./GetCategoriesList")
const GetCategoryDetails        = require("./GetCategoryDetails")
const CreateCategory            = require("./CreateCategory")
const UpdateCategory            = require("./UpdateCategory")
const UpdateCategoryStatus      = require("./UpdateCategoryStatus")
const DeleteCategory            = require("./DeleteCategory")
const GetCategoryStats          = require("./GetCategoryStats")

router.use("/list", GetCategoriesList)
router.use("/view", GetCategoryDetails)
router.use("/create", CreateCategory)
router.use("/update", UpdateCategory)
router.use("/status", UpdateCategoryStatus)
router.use("/delete", DeleteCategory)
router.use("/stats", GetCategoryStats)

module.exports = router
