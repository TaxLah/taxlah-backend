/**
 * Get Dashboard Summary Controller
 * Provides comprehensive dashboard data including expenses and tax relief
 * 
 * GET /api/expenses/dashboard
 * 
 * @author TaxLah Development Team
 * @date 2026-03-31
 */

const express = require('express');
const router = express.Router();
const { 
    DEFAULT_API_RESPONSE, 
    INTERNAL_SERVER_ERROR_API_RESPONSE,
    UNAUTHORIZED_API_RESPONSE,
    ERROR_UNAUTHENTICATED,
    CHECK_EMPTY
} = require('../../../configs/helper');
const db = require('../../../utils/sqlbuilder');

/**
 * GET /api/expenses/dashboard
 * Get comprehensive dashboard summary
 * 
 * Query Parameters:
 * - year: Filter by specific year (optional, defaults to current year)
 * 
 * Response includes:
 * - Total expenses amount
 * - Total expenses count
 * - Total tax relief claimed
 * - Expenses by category
 * - Tax claims by category
 * - Monthly breakdown
 */
router.get('/', async (req, res) => {
    let response = DEFAULT_API_RESPONSE;
    let user = req.user || null;

    if (CHECK_EMPTY(user)) {
        response = UNAUTHORIZED_API_RESPONSE;
        response.message = ERROR_UNAUTHENTICATED;
        return res.status(response.status_code).json(response);
    }

    try {
        const account_id = user.account_id;
        const year = req.query.year ? parseInt(req.query.year) : new Date().getFullYear();

        console.log('[GetDashboardSummary] Request:', { account_id, year });

        // Get expense statistics
        const expenseSql = `
            SELECT 
                COUNT(*) as total_expenses,
                COALESCE(SUM(expenses_total_amount), 0) as total_amount,
                COALESCE(AVG(expenses_total_amount), 0) as avg_amount,
                SUM(CASE WHEN expenses_mapping_status = 'Confirmed' THEN 1 ELSE 0 END) as confirmed_count,
                SUM(CASE WHEN expenses_mapping_status = 'Estimated' THEN 1 ELSE 0 END) as estimated_count,
                SUM(CASE WHEN expenses_mapping_status = 'Pending' THEN 1 ELSE 0 END) as pending_count,
                SUM(CASE WHEN expenses_mapping_status = 'Manual' THEN 1 ELSE 0 END) as manual_count,
                MIN(expenses_date) as earliest_expense,
                MAX(expenses_date) as latest_expense
            FROM account_expenses
            WHERE account_id = ? 
            AND expenses_year = ?
            AND status = 'Active'
        `;
        const expenseStats = await db.raw(expenseSql, [account_id, year]);

        // Get tax relief summary
        const taxReliefSql = `
            SELECT 
                COUNT(DISTINCT atc.claim_id) as total_claims,
                COUNT(DISTINCT atc.tax_id) as unique_categories,
                COALESCE(SUM(atc.claimed_amount), 0) as total_claimed_amount,
                COALESCE(SUM(atc.max_claimable), 0) as total_max_claimable,
                COALESCE(SUM(atc.max_claimable - atc.claimed_amount), 0) as total_remaining
            FROM account_tax_claim atc
            WHERE atc.account_id = ?
            AND atc.tax_year = ?
            AND atc.status = 'Active'
        `;
        const taxReliefStats = await db.raw(taxReliefSql, [account_id, year]);

        // Get expenses by category
        const expensesByCategorySql = `
            SELECT 
                tc.tax_id,
                tc.tax_code,
                tc.tax_title,
                tc.tax_max_claim,
                COUNT(ae.expenses_id) as expense_count,
                COALESCE(SUM(ae.expenses_total_amount), 0) as total_amount,
                COALESCE(AVG(ae.expenses_mapping_confidence), 0) as avg_confidence
            FROM account_expenses ae
            LEFT JOIN tax_category tc ON ae.expenses_tax_category = tc.tax_id
            WHERE ae.account_id = ?
            AND ae.expenses_year = ?
            AND ae.status = 'Active'
            GROUP BY tc.tax_id
            ORDER BY total_amount DESC
        `;
        const expensesByCategory = await db.raw(expensesByCategorySql, [account_id, year]);

        // Get tax claims by category
        const claimsByCategorySql = `
            SELECT 
                tc.tax_id,
                tc.tax_code,
                tc.tax_title,
                tc.tax_max_claim,
                COALESCE(SUM(atc.claimed_amount), 0) as total_claimed,
                COALESCE(tc.tax_max_claim - SUM(atc.claimed_amount), tc.tax_max_claim) as remaining_claimable,
                COUNT(atc.claim_id) as claim_count,
                atc.claim_status
            FROM account_tax_claim atc
            JOIN tax_category tc ON atc.tax_id = tc.tax_id
            WHERE atc.account_id = ?
            AND atc.tax_year = ?
            AND atc.status = 'Active'
            GROUP BY tc.tax_id, atc.claim_status
            ORDER BY total_claimed DESC
        `;
        const claimsByCategory = await db.raw(claimsByCategorySql, [account_id, year]);

        // Get monthly breakdown
        const monthlyBreakdownSql = `
            SELECT 
                DATE_FORMAT(expenses_date, '%Y-%m') as month,
                MONTH(expenses_date) as month_number,
                COUNT(*) as expense_count,
                COALESCE(SUM(expenses_total_amount), 0) as total_amount
            FROM account_expenses
            WHERE account_id = ?
            AND expenses_year = ?
            AND status = 'Active'
            GROUP BY DATE_FORMAT(expenses_date, '%Y-%m'), MONTH(expenses_date)
            ORDER BY month
        `;
        const monthlyBreakdown = await db.raw(monthlyBreakdownSql, [account_id, year]);

        // Calculate percentages and format data
        const totalExpenseAmount = parseFloat(expenseStats[0]?.total_amount || 0);
        const totalClaimedAmount = parseFloat(taxReliefStats[0]?.total_claimed_amount || 0);

        const expensesByCategoryFormatted = expensesByCategory.map(cat => ({
            tax_id: cat.tax_id,
            tax_code: cat.tax_code || 'N/A',
            tax_title: cat.tax_title || 'Uncategorized',
            tax_max_claim: parseFloat(cat.tax_max_claim || 0),
            expense_count: parseInt(cat.expense_count || 0),
            total_amount: parseFloat(cat.total_amount || 0),
            avg_confidence: parseFloat(cat.avg_confidence || 0),
            percentage: totalExpenseAmount > 0 ? 
                ((parseFloat(cat.total_amount || 0) / totalExpenseAmount) * 100).toFixed(2) : 0
        }));

        const claimsByCategoryFormatted = claimsByCategory.map(cat => ({
            tax_id: cat.tax_id,
            tax_code: cat.tax_code,
            tax_title: cat.tax_title,
            tax_max_claim: parseFloat(cat.tax_max_claim || 0),
            total_claimed: parseFloat(cat.total_claimed || 0),
            remaining_claimable: parseFloat(cat.remaining_claimable || 0),
            claim_count: parseInt(cat.claim_count || 0),
            claim_status: cat.claim_status,
            utilization_percentage: parseFloat(cat.tax_max_claim || 0) > 0 ?
                ((parseFloat(cat.total_claimed || 0) / parseFloat(cat.tax_max_claim || 0)) * 100).toFixed(2) : 0
        }));

        const monthlyBreakdownFormatted = monthlyBreakdown.map(month => ({
            month: month.month,
            month_number: month.month_number,
            expense_count: parseInt(month.expense_count || 0),
            total_amount: parseFloat(month.total_amount || 0)
        }));

        // Prepare response
        response.status_code = 200;
        response.status = 'success';
        response.message = 'Dashboard summary retrieved successfully';
        response.data = {
            year: year,
            summary: {
                expenses: {
                    total_count: parseInt(expenseStats[0]?.total_expenses || 0),
                    total_amount: totalExpenseAmount,
                    avg_amount: parseFloat(expenseStats[0]?.avg_amount || 0),
                    confirmed_count: parseInt(expenseStats[0]?.confirmed_count || 0),
                    estimated_count: parseInt(expenseStats[0]?.estimated_count || 0),
                    pending_count: parseInt(expenseStats[0]?.pending_count || 0),
                    manual_count: parseInt(expenseStats[0]?.manual_count || 0),
                    earliest_date: expenseStats[0]?.earliest_expense || null,
                    latest_date: expenseStats[0]?.latest_expense || null
                },
                tax_relief: {
                    total_claims: parseInt(taxReliefStats[0]?.total_claims || 0),
                    unique_categories: parseInt(taxReliefStats[0]?.unique_categories || 0),
                    total_claimed_amount: totalClaimedAmount,
                    total_max_claimable: parseFloat(taxReliefStats[0]?.total_max_claimable || 0),
                    total_remaining: parseFloat(taxReliefStats[0]?.total_remaining || 0),
                    utilization_percentage: parseFloat(taxReliefStats[0]?.total_max_claimable || 0) > 0 ?
                        ((totalClaimedAmount / parseFloat(taxReliefStats[0]?.total_max_claimable || 0)) * 100).toFixed(2) : 0
                }
            },
            expenses_by_category: expensesByCategoryFormatted,
            tax_claims_by_category: claimsByCategoryFormatted,
            monthly_breakdown: monthlyBreakdownFormatted
        };

        console.log('[GetDashboardSummary] Success:', {
            year,
            total_expenses: expenseStats[0]?.total_expenses,
            total_amount: totalExpenseAmount,
            total_claimed: totalClaimedAmount
        });

        return res.status(response.status_code).json(response);

    } catch (error) {
        console.error('[GetDashboardSummary] Error:', error);
        response = INTERNAL_SERVER_ERROR_API_RESPONSE;
        response.message = 'An error occurred while retrieving dashboard summary';
        response.data = { error: error.message };
        return res.status(response.status_code).json(response);
    }
});

module.exports = router;
