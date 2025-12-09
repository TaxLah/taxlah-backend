const express = require('express')
const router = express.Router()

// Import controllers
const CreateExpenseItem = require('./CreateExpenseItem')
const UpdateExpenseItem = require('./UpdateExpenseItem')
const DeleteExpenseItem = require('./DeleteExpenseItem')

// Expense item routes (all protected with auth middleware in parent)
router.use(CreateExpenseItem)
router.use(UpdateExpenseItem)
router.use(DeleteExpenseItem)

module.exports = router
