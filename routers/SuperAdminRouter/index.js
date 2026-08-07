const express = require('express')
const router  = express.Router()
const { csrfProtection } = require('../../configs/adminSession')

// Auth now rides in an httpOnly cookie, which browsers attach automatically — so unlike
// the previous Authorization-header scheme, these routes are reachable cross-site.
// Every mutating request must prove it came from our own SPA.
router.use(csrfProtection())

router.use('/auth',          require('../../controllers/AdminController/Auth'))
router.use('/users',         require('../../controllers/AdminController/UserManagement'))
router.use('/expenses',      require('../../controllers/AdminController/Expenses'))
router.use('/receipts',      require('../../controllers/AdminController/Receipt'))
router.use('/packages',      require('../../controllers/AdminController/Package'))
router.use('/transactions',  require('../../controllers/AdminController/Transaction'))
router.use('/subscriptions',      require('../../controllers/AdminController/Subscription'))
router.use('/dashboard',          require('../../controllers/AdminController/Dashboard'))
router.use('/reports',            require('../../controllers/AdminController/Report'))
router.use('/tax-categories',        require('../../controllers/AdminController/TaxCategory'))
router.use('/tax-subcategories',     require('../../controllers/AdminController/TaxSubCategory'))
router.use('/analytics/expenses',    require('../../controllers/AdminController/ExpenseAnalytics'))
router.use('/payment-gateways',      require('../../controllers/AdminController/PaymentGateway'))
router.use('/bills',                 require('../../controllers/AdminController/Bill'))
router.use('/billing-transactions',  require('../../controllers/AdminController/BillingTransaction'))
router.use('/config',              require('../../controllers/AdminController/SystemConfig'))
router.use('/advertisements',      require('../../controllers/AdminController/Advertisement'))
router.use('/blaster',               require('../../controllers/AdminController/Blaster'))
router.use("/ai", require("../../controllers/AdminRouter/AI"))

module.exports = router
