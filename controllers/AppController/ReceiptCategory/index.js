const express = require('express')
const router = express.Router()

// Import controllers
const GetCategoriesList = require('./GetCategoriesList')
const GetCategoryDetails = require('./GetCategoryDetails')
const GetCategoriesOptions = require('./GetCategoriesOptions')

// Receipt Category routes
router.use("/list", GetCategoriesList)
router.use("/details", GetCategoryDetails)
router.use("/options", GetCategoriesOptions)

module.exports = router
