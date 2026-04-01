const express = require('express')
const router  = express.Router()

router.use('/auth',          require('../../controllers/AdminController/Auth'))
router.use('/users',         require('../../controllers/AdminController/UserManagement'))
router.use('/expenses',      require('../../controllers/AdminController/Expenses'))
router.use('/receipts',      require('../../controllers/AdminController/Receipt'))
router.use('/packages',      require('../../controllers/AdminController/Package'))
router.use('/transactions',  require('../../controllers/AdminController/Transaction'))
router.use('/subscriptions',      require('../../controllers/AdminController/Subscription'))
router.use('/dashboard',          require('../../controllers/AdminController/Dashboard'))
router.use('/reports',            require('../../controllers/AdminController/Report'))
router.use('/tax-categories',     require('../../controllers/AdminController/TaxCategory'))
router.use('/tax-subcategories',  require('../../controllers/AdminController/TaxSubCategory'))

module.exports = router
