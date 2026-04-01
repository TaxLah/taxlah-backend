const db = require('../../../utils/sqlbuilder')

async function AdminGetDashboardSummary() {
    try {
        const [users]         = await db.raw(`SELECT COUNT(*) as total, SUM(CASE WHEN account_status='Active' THEN 1 ELSE 0 END) as active FROM account`)
        const [subs]          = await db.raw(`SELECT COUNT(*) as total, SUM(CASE WHEN status IN ('Active','Trial') THEN 1 ELSE 0 END) as active FROM account_subscription`)
        const [receipts]      = await db.raw(`SELECT COUNT(*) as total FROM receipt WHERE status != 'Deleted'`)
        const [revenue]       = await db.raw(`SELECT IFNULL(SUM(amount),0) as total FROM subscription_payment WHERE payment_status = 'Paid'`)
        const [revenueMonth]  = await db.raw(`SELECT IFNULL(SUM(amount),0) as total FROM subscription_payment WHERE payment_status = 'Paid' AND MONTH(paid_date) = MONTH(NOW()) AND YEAR(paid_date) = YEAR(NOW())`)
        const [newUsersMonth] = await db.raw(`SELECT COUNT(*) as total FROM account WHERE MONTH(created_date) = MONTH(NOW()) AND YEAR(created_date) = YEAR(NOW())`)
        const [expenses]      = await db.raw(`SELECT COUNT(*) as total, IFNULL(SUM(expenses_total_amount),0) as amount FROM account_expenses WHERE status = 'Active'`)

        return {
            status: true,
            data: {
                total_users:          users.total,
                active_users:         users.active,
                total_subscriptions:  subs.total,
                active_subscriptions: subs.active,
                total_receipts:       receipts.total,
                total_revenue:        parseFloat(revenue.total),
                revenue_this_month:   parseFloat(revenueMonth.total),
                new_users_this_month: newUsersMonth.total,
                total_expenses:       expenses.total,
                total_expense_amount: parseFloat(expenses.amount)
            }
        }
    } catch (e) {
        console.error('[AdminModel/Dashboard] AdminGetDashboardSummary:', e)
        return { status: false, data: null }
    }
}

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December']

async function AdminGetYearlyRevenue(year) {
    try {
        const targetYear = parseInt(year) || new Date().getFullYear()
        const rows = await db.raw(`
            SELECT MONTH(paid_date) as month_num, IFNULL(SUM(amount), 0) as total
            FROM subscription_payment
            WHERE payment_status = 'Paid' AND YEAR(paid_date) = ?
            GROUP BY MONTH(paid_date)
        `, [targetYear])

        // Build a full 12-month array — zero for months with no data
        const monthMap = {}
        rows.forEach(r => { monthMap[r.month_num] = parseFloat(r.total) })

        const result = MONTH_NAMES.map((month, i) => ({
            month,
            total: monthMap[i + 1] || 0
        }))

        return { status: true, data: { year: targetYear, revenue: result } }
    } catch (e) {
        console.error('[AdminModel/Dashboard] AdminGetYearlyRevenue:', e)
        return { status: false, data: null }
    }
}

module.exports = { AdminGetDashboardSummary, AdminGetYearlyRevenue }
