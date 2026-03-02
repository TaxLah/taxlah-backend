const db = require("../../../utils/sqlbuilder")

let error_db    = 'Sistem Ralat! Terdapat masalah pada pangkalan data. Sila hubungi sistem pentadbir anda.'
let result      = { status: false, message: '', data: null }

const Expenses = {
    GetAllExpenses: async (account_id, offset = 0, limit = 10, search = "") => {
        let whereSearch = ``
        if(search) {
            whereSearch = `AND (expenses_tags LIKE '%${search}%' OR expenses_tax_category LIKE '%${search}%' OR expenses_receipt_no LIKE '%${search}%' OR expenses_merchant_name LIKE '%${search}%')`
        }

        try {
            let sql = await db.raw(`
                SELECT 
                expenses_id, 
                expenses_tags, 
                expenses_receipt_no, 
                expenses_merchant_name, 
                expenses_total_amount, 
                expenses_date, 
                expenses_year 
                FROM account_expenses
                WHERE status = 'Active'
                AND account_id = ?
                ${whereSearch}
                LIMIT ${limit} OFFSET ${offset}
            `, [account_id])   
            
            let totalData = await Expenses.TotalData(account_id, search)

            result = {
                status: true,
                message: "Berjaya",
                data: {
                    row: sql,
                    total: totalData.data,
                    totalPages: Math.ceil(totalData.data / limit)
                }
            }
        } catch (e) {
            console.log("Syntax error at model get all expenses : ", e)
            result = { status: false, message: error_db, data: null }
        } finally {
            return result
        }
    },

    GetExpensesById: async (account_id, expenses_id) => {
        try {
            let sql     = `SELECT * FROM account_expenses WHERE account_id ? AND expenses_id = ? LIMIT 1`
            let query   = await db.raw(sql, [account_id, expenses_id])

            if(query.length) {
                result = { status: true, message: `${query.length} rekod ditemui.`, data: query[0]}
            } else {
                result = { status: false, message: error_db, data: null }
            }
        } catch (e) {
            result = { status: false, message: error_db, data: null }
        } finally {
            return result
        }
    },

    GetExpensesByReceipt: async () => {

    },

    CreateExpenses: async (params) => {
        try {
            let query = await db.insert("account_expenses", params)
            if(query.insertId) {
                let data = (await Expenses.GetExpensesById(query.insertId)).data
                result = { status: true, message: "Rekod perbelanjaan berjaya disimpan.", data }
            } else {
                result = { status: false, message: error_db, data: null }
            }
        } catch (e) {
            result = { status: false, message: error_db, data: null }
        } finally {
            return result
        }
    },

    UpdateExpenses: async (expenses_id, params) => {
        try {
            let query = await db.update("account_expenses", params, { expenses_id })
            if(query) {
                result = { status: true, message: 'Rekod perbelanjaan telah berjaya dikemaskini.', data: null }
            } else {
                result = { status: false, message: error_db, data: null }
            }
        } catch (e) {
            result = { status: false, message: error_db, data: null }
        } finally {
            return result
        }
    },

    DeleteExpenses: async (account_id, expenses_id) => {
        try {
            let query = await db.update("account_expenses", { status: 'Deleted' }, { expenses_id, account_id })
            if(query) {
                result = { status: true, message: 'Rekod perbelanjaan telah berjaya dipadam.', data: null }
            } else {
                result = { status: false, message: error_db, data: null }
            }
        } catch (e) {
            result = { status: false, message: error_db, data: null }
        } finally {
            return result
        }
    },

    HardDeleteExpenses: async (account_id, expenses_id) => {
        try {
            let query = await db.delete("account_expenses", { account_id, expenses_id })
            if(query) {
                result = { status: true, message: 'Rekod perbelanjaan telah berjaya dipadam selamanya.', data: null }
            } else {
                result = { status: false, message: error_db, data: null }
            }
        } catch (e) {
            result = { status: false, message: error_db, data: null }
        } finally {
            return result
        }
    },

    TotalData: async (account_id, search) => {
        let whereSearch = ``
        if(search) {
            whereSearch = `AND (expenses_tags LIKE '%${search}%' OR expenses_tax_category LIKE '%${search}%' OR expenses_receipt_no LIKE '%${search}%' OR expenses_merchant_name LIKE '%${search}%')`
        }
        try {
            let sql     = `SELECT COUNT(*) AS TOTAL FROM account_expenses WHERE account_id = ? ${search}`
            let query   = await db.raw(sql, [account_id])
            result = { status: true, message: 'Berjaya', data: query[0]["TOTAL"]}
        } catch (e) {
            result = { status: false, message: error_db, data: null }
        } finally {
            return result
        }
    }
}

// Export new enhanced model instead of old one
const ExpensesModel = require('./ExpensesModel');
module.exports = ExpensesModel;

// Old model kept for reference (commented out)
// module.exports = Expenses