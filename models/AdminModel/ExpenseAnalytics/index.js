const db = require('../../../utils/sqlbuilder')

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const DAYS   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']

/* ─────────────────────────────────────────────────────────────
   1. SUMMARY CARDS
   Returns the 7 header KPI cards + budget overview numbers
──────────────────────────────────────────────────────────────── */
async function AdminExpenseAnalyticsSummary(year) {
    const targetYear    = parseInt(year) || new Date().getFullYear()
    const prevYear      = targetYear - 1

    try {
        // ── Current-year totals ──────────────────────────────
        const [curr] = await db.raw(`
            SELECT
                IFNULL(SUM(expenses_total_amount), 0)                                               AS total_amount,
                COUNT(*)                                                                             AS total_expenses,
                IFNULL(AVG(expenses_total_amount), 0)                                               AS avg_amount,
                SUM(CASE WHEN expenses_mapping_status IN ('Confirmed','Manual') THEN 1 ELSE 0 END)  AS approved,
                SUM(CASE WHEN expenses_mapping_status IN ('Pending','Estimated') THEN 1 ELSE 0 END) AS pending,
                SUM(CASE WHEN status IN ('Inactive','Others') THEN 1 ELSE 0 END)                    AS rejected
            FROM account_expenses
            WHERE expenses_year = ? AND status != 'Deleted'
        `, [targetYear])

        // ── Previous-year total for % change ────────────────
        const [prev] = await db.raw(`
            SELECT IFNULL(SUM(expenses_total_amount), 0) AS total_amount
            FROM account_expenses
            WHERE expenses_year = ? AND status != 'Deleted'
        `, [prevYear])

        // ── Receipt count for the year ───────────────────────
        const [receipts] = await db.raw(`
            SELECT COUNT(*) AS total
            FROM receipt
            WHERE YEAR(created_date) = ? AND status != 'Deleted'
        `, [targetYear])

        // ── Budget = sum of tax max_claim for the year ────────
        const [budget] = await db.raw(`
            SELECT IFNULL(SUM(tax_max_claim), 0) AS total_budget
            FROM tax_category
            WHERE tax_year = ? AND status = 'Active'
        `, [targetYear])

        const totalAmount  = parseFloat(curr.total_amount)
        const prevAmount   = parseFloat(prev.total_amount)
        const totalBudget  = parseFloat(budget.total_budget)
        const budgetUsed   = totalBudget > 0 ? parseFloat(((totalAmount / totalBudget) * 100).toFixed(2)) : 0
        const yoyChangePct = prevAmount > 0 ? parseFloat((((totalAmount - prevAmount) / prevAmount) * 100).toFixed(2)) : null

        return {
            status: true,
            data: {
                year:           targetYear,
                totalExpenses:  totalAmount,
                yoyChangePct,
                totalReceipts:  parseInt(receipts.total),
                avgTransaction: parseFloat(parseFloat(curr.avg_amount).toFixed(2)),
                approvedClaims: parseInt(curr.approved),
                pendingReview:  parseInt(curr.pending),
                rejectedClaims: parseInt(curr.rejected),
                monthlyBudget:  totalBudget,
                budgetUsed,
            }
        }
    } catch (e) {
        console.error('[AdminModel/ExpenseAnalytics] Summary:', e)
        return { status: false, data: null }
    }
}

/* ─────────────────────────────────────────────────────────────
   2. MONTHLY TREND
   Returns 12-month array with expense + budget per month.
   Budget line = total tax max_claim / 12 (flat monthly target).
──────────────────────────────────────────────────────────────── */
async function AdminExpenseAnalyticsMonthlyTrend(year) {
    const targetYear = parseInt(year) || new Date().getFullYear()

    try {
        const rows = await db.raw(`
            SELECT
                MONTH(expenses_date) AS month_num,
                IFNULL(SUM(expenses_total_amount), 0) AS total,
                COUNT(*) AS count
            FROM account_expenses
            WHERE expenses_year = ? AND status != 'Deleted'
            GROUP BY MONTH(expenses_date)
        `, [targetYear])

        const [budget] = await db.raw(`
            SELECT IFNULL(SUM(tax_max_claim), 0) AS total_budget
            FROM tax_category
            WHERE tax_year = ? AND status = 'Active'
        `, [targetYear])

        const monthlyBudget = parseFloat((parseFloat(budget.total_budget) / 12).toFixed(2))

        // Build map for fast lookup
        const expenseMap = {}
        rows.forEach(r => {
            expenseMap[r.month_num] = { total: parseFloat(r.total), count: parseInt(r.count) }
        })

        const data = MONTHS.map((month, i) => ({
            month,
            amount:   expenseMap[i + 1]?.total || 0,
            receipts: expenseMap[i + 1]?.count || 0,
            budget:   monthlyBudget
        }))

        return { status: true, data }
    } catch (e) {
        console.error('[AdminModel/ExpenseAnalytics] MonthlyTrend:', e)
        return { status: false, data: null }
    }
}

/* ─────────────────────────────────────────────────────────────
   3. EXPENSE CATEGORIES
   Breakdown by tax_category with trend vs previous year.
──────────────────────────────────────────────────────────────── */
async function AdminExpenseAnalyticsCategories(year) {
    const targetYear = parseInt(year) || new Date().getFullYear()
    const prevYear   = targetYear - 1

    try {
        // Current-year totals per category
        const currRows = await db.raw(`
            SELECT
                tc.tax_id,
                tc.tax_code,
                tc.tax_title,
                tc.tax_max_claim,
                IFNULL(SUM(e.expenses_total_amount), 0) AS total_amount,
                COUNT(e.expenses_id)                     AS expense_count
            FROM tax_category tc
            LEFT JOIN account_expenses e
                ON tc.tax_id = e.expenses_tax_category
                AND e.expenses_year = ?
                AND e.status != 'Deleted'
            WHERE tc.tax_year = ? AND tc.status = 'Active'
            GROUP BY tc.tax_id
        `, [targetYear, targetYear])

        // Previous-year totals per category (for trend %)
        const prevRows = await db.raw(`
            SELECT
                tc.tax_id,
                IFNULL(SUM(e.expenses_total_amount), 0) AS total_amount
            FROM tax_category tc
            LEFT JOIN account_expenses e
                ON tc.tax_id = e.expenses_tax_category
                AND e.expenses_year = ?
                AND e.status != 'Deleted'
            WHERE tc.tax_year = ? AND tc.status = 'Active'
            GROUP BY tc.tax_id
        `, [prevYear, prevYear])

        const prevMap = {}
        prevRows.forEach(r => { prevMap[r.tax_id] = parseFloat(r.total_amount) })

        const grandTotal = currRows.reduce((s, r) => s + parseFloat(r.total_amount), 0)

        const data = currRows
            .map(r => {
                const amount = parseFloat(r.total_amount)
                const prev   = prevMap[r.tax_id] || 0
                const trend  = prev > 0 ? parseFloat((((amount - prev) / prev) * 100).toFixed(1)) : null
                return {
                    id:      r.tax_id,
                    category: r.tax_title,
                    amount,
                    count:   parseInt(r.expense_count),
                    percent: grandTotal > 0 ? parseFloat(((amount / grandTotal) * 100).toFixed(1)) : 0,
                    trend,
                }
            })
            .sort((a, b) => b.amount - a.amount)

        return { status: true, data }
    } catch (e) {
        console.error('[AdminModel/ExpenseAnalytics] Categories:', e)
        return { status: false, data: null }
    }
}

/* ─────────────────────────────────────────────────────────────
   4. TOP USERS BY EXPENSES
──────────────────────────────────────────────────────────────── */
async function AdminExpenseAnalyticsTopUsers(year, limit = 10) {
    const targetYear = parseInt(year)  || new Date().getFullYear()
    const limitInt   = parseInt(limit) || 10

    try {
        const rows = await db.raw(`
            SELECT
                a.account_id,
                a.account_name,
                a.account_fullname,
                a.account_email,
                a.account_status,
                IFNULL(SUM(e.expenses_total_amount), 0) AS total_amount,
                COUNT(e.expenses_id)                     AS expense_count
            FROM account a
            JOIN account_expenses e
                ON a.account_id = e.account_id
                AND e.expenses_year = ?
                AND e.status != 'Deleted'
            GROUP BY a.account_id
            ORDER BY total_amount DESC
            LIMIT ${limitInt}
        `, [targetYear])

        const data = rows.map(r => {
            const name   = r.account_fullname || ''
            const avatar = name.split(' ').filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('') || '?'
            return {
                id:         r.account_id,
                name,
                department: null,
                total:      parseFloat(r.total_amount),
                receipts:   parseInt(r.expense_count),
                avatar,
                status:     r.account_status?.toLowerCase() || 'active',
            }
        })

        return { status: true, data }
    } catch (e) {
        console.error('[AdminModel/ExpenseAnalytics] TopUsers:', e)
        return { status: false, data: null }
    }
}

/* ─────────────────────────────────────────────────────────────
   5. TOP MERCHANTS BY EXPENSES
──────────────────────────────────────────────────────────────── */
async function AdminExpenseAnalyticsTopMerchants(year, limit = 10) {
    const targetYear = parseInt(year)  || new Date().getFullYear()
    const limitInt   = parseInt(limit) || 10

    try {
        // Named merchants (have a merchant record)
        const namedRows = await db.raw(`
            SELECT
                m.merchant_id,
                m.merchant_name,
                m.merchant_category,
                m.merchant_address,
                IFNULL(SUM(e.expenses_total_amount), 0) AS total_amount,
                COUNT(e.expenses_id)                     AS visit_count
            FROM merchant m
            JOIN account_expenses e
                ON (e.expenses_merchant_id = CAST(m.merchant_id AS CHAR) OR e.expenses_merchant_name = m.merchant_name)
                AND e.expenses_year = ?
                AND e.status != 'Deleted'
            WHERE m.status = 'Active'
            GROUP BY m.merchant_id
            ORDER BY total_amount DESC
            LIMIT ${limitInt}
        `, [targetYear])

        // If fewer than limit named merchants, fill gap with unnamed (by merchant_name string)
        let merchants = namedRows.map(r => ({
            id:       r.merchant_id,
            name:     r.merchant_name,
            category: r.merchant_category || null,
            visits:   parseInt(r.visit_count),
            total:    parseFloat(r.total_amount),
            location: r.merchant_address || null,
        }))

        if (merchants.length < limitInt) {
            const alreadyNamed = namedRows.map(r => r.merchant_name)
            const placeholders = alreadyNamed.length
                ? `AND e.expenses_merchant_name NOT IN (${alreadyNamed.map(() => '?').join(',')})`
                : ''
            const extra = limitInt - merchants.length
            const unnamedRows = await db.raw(`
                SELECT
                    NULL                                         AS merchant_id,
                    e.expenses_merchant_name                     AS merchant_name,
                    NULL                                         AS merchant_category,
                    IFNULL(SUM(e.expenses_total_amount), 0)      AS total_amount,
                    COUNT(e.expenses_id)                         AS visit_count
                FROM account_expenses e
                WHERE e.expenses_year = ?
                    AND e.status != 'Deleted'
                    AND e.expenses_merchant_name IS NOT NULL
                    AND e.expenses_merchant_name != ''
                    ${placeholders}
                GROUP BY e.expenses_merchant_name
                ORDER BY total_amount DESC
                LIMIT ${extra}
            `, [targetYear, ...alreadyNamed])

            unnamedRows.forEach(r => {
                merchants.push({
                    id:       null,
                    name:     r.merchant_name,
                    category: null,
                    visits:   parseInt(r.visit_count),
                    total:    parseFloat(r.total_amount),
                    location: null,
                })
            })

            merchants.sort((a, b) => b.total - a.total)
        }

        return { status: true, data: merchants }
    } catch (e) {
        console.error('[AdminModel/ExpenseAnalytics] TopMerchants:', e)
        return { status: false, data: null }
    }
}

/* ─────────────────────────────────────────────────────────────
   6. RECENT TRANSACTIONS
──────────────────────────────────────────────────────────────── */
async function AdminExpenseAnalyticsRecentTransactions(year, limit = 20) {
    const targetYear = parseInt(year)  || new Date().getFullYear()
    const limitInt   = Math.min(parseInt(limit) || 20, 100)

    try {
        const rows = await db.raw(`
            SELECT
                e.expenses_id,
                a.account_fullname                                            AS user_name,
                COALESCE(m.merchant_name, e.expenses_merchant_name, 'Unknown') AS merchant_name,
                e.expenses_total_amount,
                e.expenses_date,
                tc.tax_title                                                  AS category_name,
                e.expenses_mapping_status,
                e.status
            FROM account_expenses e
            JOIN  account a       ON a.account_id  = e.account_id
            LEFT JOIN merchant m  ON CAST(m.merchant_id AS CHAR) = e.expenses_merchant_id
            LEFT JOIN tax_category tc ON tc.tax_id  = e.expenses_tax_category
            WHERE e.expenses_year = ? AND e.status != 'Deleted'
            ORDER BY e.expenses_date DESC
            LIMIT ${limitInt}
        `, [targetYear])

        const data = rows.map(r => {
            let status = 'pending'
            if (['Confirmed', 'Manual'].includes(r.expenses_mapping_status)) status = 'approved'
            else if (['Inactive', 'Others'].includes(r.status))              status = 'rejected'

            const rawDate = r.expenses_date
            const date    = rawDate instanceof Date
                ? rawDate.toISOString().slice(0, 10)
                : (rawDate ? String(rawDate).slice(0, 10) : null)

            return {
                id:       r.expenses_id,
                user:     r.user_name     || 'Unknown',
                merchant: r.merchant_name,
                amount:   parseFloat(r.expenses_total_amount),
                date,
                category: r.category_name || null,
                status,
            }
        })

        return { status: true, data }
    } catch (e) {
        console.error('[AdminModel/ExpenseAnalytics] RecentTransactions:', e)
        return { status: false, data: null }
    }
}

/* ─────────────────────────────────────────────────────────────
   7. WEEKLY DISTRIBUTION
   Groups all expenses in the year by day-of-week (Mon–Sun).
──────────────────────────────────────────────────────────────── */
async function AdminExpenseAnalyticsWeeklyDistribution(year) {
    const targetYear = parseInt(year) || new Date().getFullYear()

    try {
        const rows = await db.raw(`
            SELECT
                DAYOFWEEK(expenses_date)              AS day_num,
                IFNULL(SUM(expenses_total_amount), 0) AS total,
                COUNT(*)                              AS count
            FROM account_expenses
            WHERE expenses_year = ? AND status != 'Deleted'
            GROUP BY DAYOFWEEK(expenses_date)
        `, [targetYear])

        const dayMap = {}
        rows.forEach(r => { dayMap[r.day_num] = { total: parseFloat(r.total), count: parseInt(r.count) } })

        // DAYOFWEEK: 1=Sun, 2=Mon … 7=Sat — output in Mon–Sun order
        const order = [2, 3, 4, 5, 6, 7, 1]
        const data  = order.map(dNum => ({
            day:    DAYS[dNum - 1],
            amount: dayMap[dNum]?.total || 0,
            count:  dayMap[dNum]?.count || 0,
        }))

        return { status: true, data }
    } catch (e) {
        console.error('[AdminModel/ExpenseAnalytics] WeeklyDistribution:', e)
        return { status: false, data: null }
    }
}

module.exports = {
    AdminExpenseAnalyticsSummary,
    AdminExpenseAnalyticsMonthlyTrend,
    AdminExpenseAnalyticsCategories,
    AdminExpenseAnalyticsTopUsers,
    AdminExpenseAnalyticsTopMerchants,
    AdminExpenseAnalyticsRecentTransactions,
    AdminExpenseAnalyticsWeeklyDistribution,
}
