const express = require('express')
const router = express.Router()

const GetSubcategoriesList          = require("./GetSubcategoriesList")
const GetSubcategoryDetails         = require("./GetSubcategoryDetails")
const CreateSubcategory             = require("./CreateSubcategory")
const UpdateSubcategory             = require("./UpdateSubcategory")
const UpdateSubcategoryStatus       = require("./UpdateSubcategoryStatus")
const DeleteSubcategory             = require("./DeleteSubcategory")
const GetSubcategoryStats           = require("./GetSubcategoryStats")

router.use("/list", GetSubcategoriesList)
router.use("/view", GetSubcategoryDetails)
router.use("/create", CreateSubcategory)
router.use("/update", UpdateSubcategory)
router.use("/status", UpdateSubcategoryStatus)
router.use("/delete", DeleteSubcategory)
router.use("/stats", GetSubcategoryStats)

module.exports = router
