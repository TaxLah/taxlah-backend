/**
 * Expenses Router Index
 * Main router for all expense-related operations with tax categorization
 * 
 * @author TaxLah Development Team
 * @date 2026-03-02
 * 
 * Routes:
 * - POST   /api/expenses/extract-receipt    - (Premium) OCR receipt preview before saving
 * - POST   /api/expenses/create            - Create new expense with AI categorization
 * - GET    /api/expenses/list              - Get expenses list with filtering
 * - GET    /api/expenses/details/:id       - Get single expense details
 * - GET    /api/expenses/:id/items         - Get expense items by expense ID
 * - PUT    /api/expenses/update/:id        - Update expense
 * - DELETE /api/expenses/delete/:id        - Soft delete expense
 * - PUT    /api/expenses/override-category/:id - Override AI category manually
 * - GET    /api/expenses/requiring-review  - Get expenses needing review
 * - GET    /api/expenses/mapping-dashboard - Get mapping status dashboard
 * - GET    /api/expenses/stats             - Get expense statistics
 * - GET    /api/expenses/dashboard         - Get comprehensive dashboard summary
 */

const express = require('express');
const router = express.Router();

// Import controllers
const ExtractReceipt     = require('./ExtractReceipt');
const CreateExpense      = require('./CreateExpense');
const GetExpensesList    = require('./GetExpensesList');
const GetExpenseDetails  = require('./GetExpenseDetails');
const GetExpenseItems    = require('./GetExpenseItems');
const UpdateExpense      = require('./UpdateExpense');
const DeleteExpense      = require('./DeleteExpense');
const OverrideTaxCategory    = require('./OverrideTaxCategory');
const GetRequiringReview     = require('./GetRequiringReview');
const GetMappingDashboard    = require('./GetMappingDashboard');
const GetExpenseStats        = require('./GetExpenseStats');
const GetDashboardSummary    = require('./GetDashboardSummary');

// Mount routes
router.use('/extract-receipt', ExtractReceipt);
router.use('/create', CreateExpense);
router.use('/list', GetExpensesList);
router.use('/details', GetExpenseDetails);
router.use('/', GetExpenseItems); // Must be after more specific routes
router.use('/update', UpdateExpense);
router.use('/delete', DeleteExpense);
router.use('/override-category', OverrideTaxCategory);
router.use('/requiring-review', GetRequiringReview);
router.use('/mapping-dashboard', GetMappingDashboard);
router.use('/stats', GetExpenseStats);
router.use('/dashboard', GetDashboardSummary);

module.exports = router;
