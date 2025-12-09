const express = require('express')
const router = express.Router()

// Import controllers
const GetExpensesList = require('./GetExpensesList')
const GetExpenseDetails = require('./GetExpenseDetails')
const UpdateExpense = require('./UpdateExpense')
const UpdateExpenseStatus = require('./UpdateExpenseStatus')
const DeleteExpense = require('./DeleteExpense')
const GetExpenseStats = require('./GetExpenseStats')

// Expense routes (all protected with auth middleware in parent)
router.use(GetExpensesList)
router.use(GetExpenseDetails)
router.use(UpdateExpense)
router.use(UpdateExpenseStatus)
router.use(DeleteExpense)
router.use(GetExpenseStats)

module.exports = router
