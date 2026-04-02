const express = require('express')
const router  = express.Router()

const {
    DEFAULT_API_RESPONSE,
    INTERNAL_SERVER_ERROR_API_RESPONSE,
    SUCCESS_API_RESPONSE,
    BAD_REQUEST_API_RESPONSE
} = require('../../../configs/helper')

const { superauth } = require('../../../configs/auth')

const {
    AdminExpenseAnalyticsSummary,
    AdminExpenseAnalyticsMonthlyTrend,
    AdminExpenseAnalyticsCategories,
    AdminExpenseAnalyticsTopUsers,
    AdminExpenseAnalyticsTopMerchants,
    AdminExpenseAnalyticsRecentTransactions,
    AdminExpenseAnalyticsWeeklyDistribution,
} = require('../../../models/AdminModel/ExpenseAnalytics')

/* ─────────────────────────────────────────────────────────────
   GET /superadmin/analytics/expenses/summary?year=2025
   ─ 7 header KPI cards + budget overview
──────────────────────────────────────────────────────────────── */
router.get('/summary', superauth(), async (req, res) => {
    let response = DEFAULT_API_RESPONSE
    try {
        const { year } = req.query
        const result = await AdminExpenseAnalyticsSummary(year)
        response = result.status
            ? { ...SUCCESS_API_RESPONSE, data: result.data }
            : INTERNAL_SERVER_ERROR_API_RESPONSE
    } catch (e) {
        console.error('[AdminController/ExpenseAnalytics] Summary:', e)
        response = INTERNAL_SERVER_ERROR_API_RESPONSE
    }
    return res.status(response.status_code).json(response)
})

/* ─────────────────────────────────────────────────────────────
   GET /superadmin/analytics/expenses/monthly-trend?year=2025
   ─ 12-month bar chart data (expenses + budget line)
   ─ + highest/lowest/avg stats below chart
──────────────────────────────────────────────────────────────── */
router.get('/monthly-trend', superauth(), async (req, res) => {
    let response = DEFAULT_API_RESPONSE
    try {
        const { year } = req.query
        const result = await AdminExpenseAnalyticsMonthlyTrend(year)
        response = result.status
            ? { ...SUCCESS_API_RESPONSE, data: result.data }
            : INTERNAL_SERVER_ERROR_API_RESPONSE
    } catch (e) {
        console.error('[AdminController/ExpenseAnalytics] MonthlyTrend:', e)
        response = INTERNAL_SERVER_ERROR_API_RESPONSE
    }
    return res.status(response.status_code).json(response)
})

/* ─────────────────────────────────────────────────────────────
   GET /superadmin/analytics/expenses/categories?year=2025
   ─ Expense category breakdown with trend vs previous year
──────────────────────────────────────────────────────────────── */
router.get('/categories', superauth(), async (req, res) => {
    let response = DEFAULT_API_RESPONSE
    try {
        const { year } = req.query
        const result = await AdminExpenseAnalyticsCategories(year)
        response = result.status
            ? { ...SUCCESS_API_RESPONSE, data: result.data }
            : INTERNAL_SERVER_ERROR_API_RESPONSE
    } catch (e) {
        console.error('[AdminController/ExpenseAnalytics] Categories:', e)
        response = INTERNAL_SERVER_ERROR_API_RESPONSE
    }
    return res.status(response.status_code).json(response)
})

/* ─────────────────────────────────────────────────────────────
   GET /superadmin/analytics/expenses/top-users?year=2025&limit=10
   ─ Ranked list of users by total expenses for the year
──────────────────────────────────────────────────────────────── */
router.get('/top-users', superauth(), async (req, res) => {
    let response = DEFAULT_API_RESPONSE
    try {
        const { year, limit = 10 } = req.query

        if (limit && (isNaN(limit) || parseInt(limit) < 1 || parseInt(limit) > 100)) {
            response = { ...BAD_REQUEST_API_RESPONSE, message: 'limit must be a number between 1 and 100.' }
            return res.status(response.status_code).json(response)
        }

        const result = await AdminExpenseAnalyticsTopUsers(year, limit)
        response = result.status
            ? { ...SUCCESS_API_RESPONSE, data: result.data }
            : INTERNAL_SERVER_ERROR_API_RESPONSE
    } catch (e) {
        console.error('[AdminController/ExpenseAnalytics] TopUsers:', e)
        response = INTERNAL_SERVER_ERROR_API_RESPONSE
    }
    return res.status(response.status_code).json(response)
})

/* ─────────────────────────────────────────────────────────────
   GET /superadmin/analytics/expenses/top-merchants?year=2025&limit=10
   ─ Ranked list of merchants by total expense amount for the year
──────────────────────────────────────────────────────────────── */
router.get('/top-merchants', superauth(), async (req, res) => {
    let response = DEFAULT_API_RESPONSE
    try {
        const { year, limit = 10 } = req.query

        if (limit && (isNaN(limit) || parseInt(limit) < 1 || parseInt(limit) > 100)) {
            response = { ...BAD_REQUEST_API_RESPONSE, message: 'limit must be a number between 1 and 100.' }
            return res.status(response.status_code).json(response)
        }

        const result = await AdminExpenseAnalyticsTopMerchants(year, limit)
        response = result.status
            ? { ...SUCCESS_API_RESPONSE, data: result.data }
            : INTERNAL_SERVER_ERROR_API_RESPONSE
    } catch (e) {
        console.error('[AdminController/ExpenseAnalytics] TopMerchants:', e)
        response = INTERNAL_SERVER_ERROR_API_RESPONSE
    }
    return res.status(response.status_code).json(response)
})

/* ─────────────────────────────────────────────────────────────
   GET /superadmin/analytics/expenses/recent-transactions?year=2025&limit=20
   ─ Latest expense transactions for the year
──────────────────────────────────────────────────────────────── */
router.get('/recent-transactions', superauth(), async (req, res) => {
    let response = DEFAULT_API_RESPONSE
    try {
        const { year, limit = 20 } = req.query

        if (limit && (isNaN(limit) || parseInt(limit) < 1 || parseInt(limit) > 100)) {
            response = { ...BAD_REQUEST_API_RESPONSE, message: 'limit must be a number between 1 and 100.' }
            return res.status(response.status_code).json(response)
        }

        const result = await AdminExpenseAnalyticsRecentTransactions(year, limit)
        response = result.status
            ? { ...SUCCESS_API_RESPONSE, data: result.data }
            : INTERNAL_SERVER_ERROR_API_RESPONSE
    } catch (e) {
        console.error('[AdminController/ExpenseAnalytics] RecentTransactions:', e)
        response = INTERNAL_SERVER_ERROR_API_RESPONSE
    }
    return res.status(response.status_code).json(response)
})

/* ─────────────────────────────────────────────────────────────
   GET /superadmin/analytics/expenses/weekly-distribution?year=2025
   ─ Expense totals grouped by day-of-week (Mon–Sun)
──────────────────────────────────────────────────────────────── */
router.get('/weekly-distribution', superauth(), async (req, res) => {
    let response = DEFAULT_API_RESPONSE
    try {
        const { year } = req.query
        const result = await AdminExpenseAnalyticsWeeklyDistribution(year)
        response = result.status
            ? { ...SUCCESS_API_RESPONSE, data: result.data }
            : INTERNAL_SERVER_ERROR_API_RESPONSE
    } catch (e) {
        console.error('[AdminController/ExpenseAnalytics] WeeklyDistribution:', e)
        response = INTERNAL_SERVER_ERROR_API_RESPONSE
    }
    return res.status(response.status_code).json(response)
})

module.exports = router
