const express = require('express')
const router = express.Router()

const CategoryRouter        = require("./Category")
const SubcategoryRouter     = require("./Subcategory")

router.use("/category", CategoryRouter)
router.use("/subcategory", SubcategoryRouter)

module.exports = router
