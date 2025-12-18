const db = require("../../../utils/sqlbuilder")

// CREATE TABLE `account_expenses_item` (
//   `item_id` int NOT NULL AUTO_INCREMENT,
//   `item_sku_unit` varchar(256) DEFAULT NULL,
//   `item_name` varchar(256) DEFAULT NULL,
//   `item_unit_price` decimal(15,2) NOT NULL DEFAULT '0.00',
//   `item_quantity` int NOT NULL DEFAULT '0',
//   `item_total_price` decimal(10,0) NOT NULL DEFAULT '0',
//   `status` enum('Active','Inactive','Deleted') NOT NULL DEFAULT 'Active',
//   `created_date` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
//   `last_modified` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
//   `expenses_id` int NOT NULL,
//   PRIMARY KEY (`item_id`),
//   KEY `expenses_id` (`expenses_id`),
//   KEY `expenses_item_idx` (`item_id`,`item_name`,`status`,`expenses_id`),
//   CONSTRAINT `account_expenses_item_ibfk_1` FOREIGN KEY (`expenses_id`) REFERENCES `account_expenses` (`expenses_id`) ON DELETE CASCADE
// ) ENGINE=InnoDB DEFAULT CHARSET=latin1;

let table       = 'account_expenses_item'
let error_db    = 'Sistem Ralat! Terdapat masalah pada pangkalan data. Sila hubungi sistem pentadbir anda.'
let result      = { status: false, message: '', data: null }

const ExpensesItem = {

    GetExpensesItemByExpensesId: async (expenses_id, offset = 0, limit = 100) => {
        result = { status: false, message: '', data: null }
        try {
            const data = await db.select(
                table,
                { expenses_id: expenses_id, status: 'Active' },
                '*',
                offset,
                limit
            )
            result.status   = true
            result.message  = 'Berjaya mendapatkan senarai item perbelanjaan.'
            result.data     = data
        } catch (error) {
            console.error('GetExpensesItemByExpensesId Error:', error)
            result.message = error_db
        }
        return result
    },

    CreateExpensesItem: async (payload) => {
        result = { status: false, message: '', data: null }
        try {
            const data = {
                item_sku_unit: payload.item_sku_unit || null,
                item_name: payload.item_name,
                item_unit_price: payload.item_unit_price || 0.00,
                item_quantity: payload.item_quantity || 0,
                item_total_price: payload.item_total_price || 0,
                expenses_id: payload.expenses_id
            }
            const inserted = await db.insert(table, data)
            result.status   = true
            result.message  = 'Item perbelanjaan berjaya ditambah.'
            result.data     = { item_id: inserted.insertId }
        } catch (error) {
            console.error('CreateExpensesItem Error:', error)
            result.message = error_db
        }
        return result
    },

    UpdateExpensesItem: async (item_id, payload) => {
        result = { status: false, message: '', data: null }
        try {
            const data = {
                item_sku_unit: payload.item_sku_unit,
                item_name: payload.item_name,
                item_unit_price: payload.item_unit_price,
                item_quantity: payload.item_quantity,
                item_total_price: payload.item_total_price,
                last_modified: new Date()
            }
            // Remove undefined fields
            Object.keys(data).forEach(key => data[key] === undefined && delete data[key])

            const affectedRows = await db.update(table, data, { item_id: item_id })
            if (affectedRows > 0) {
                result.status   = true
                result.message  = 'Item perbelanjaan berjaya dikemaskini.'
                result.data     = { affectedRows }
            } else {
                result.message  = 'Tiada item perbelanjaan ditemui untuk dikemaskini.'
            }
        } catch (error) {
            console.error('UpdateExpensesItem Error:', error)
            result.message = error_db
        }
        return result
    },

    DeleteExpensesItem: async (item_id) => {
        result = { status: false, message: '', data: null }
        try {
            const data = {
                status: 'Deleted',
                last_modified: new Date()
            }
            const affectedRows = await db.update(table, data, { item_id: item_id })
            if (affectedRows > 0) {
                result.status   = true
                result.message  = 'Item perbelanjaan berjaya dipadam.'
                result.data     = { affectedRows }
            } else {
                result.message  = 'Tiada item perbelanjaan ditemui untuk dipadam.'
            }
        } catch (error) {
            console.error('DeleteExpensesItem Error:', error)
            result.message = error_db
        }
        return result
    },

    HardDeleteExpensesItem: async (item_id) => {
        result = { status: false, message: '', data: null }
        try {
            const deleted = await db.delete(table, { item_id: item_id })
            if (deleted.affectedRows > 0) {
                result.status   = true
                result.message  = 'Item perbelanjaan berjaya dipadam sepenuhnya.'
                result.data     = { affectedRows: deleted.affectedRows }
            } else {
                result.message  = 'Tiada item perbelanjaan ditemui untuk dipadam.'
            }
        } catch (error) {
            console.error('HardDeleteExpensesItem Error:', error)
            result.message = error_db
        }
        return result
    },

    TotalData: async (expenses_id) => {
        result = { status: false, message: '', data: null }
        try {
            const sql = `SELECT COUNT(*) as total FROM ${table} WHERE expenses_id = ? AND status = 'Active'`
            const data = await db.raw(sql, [expenses_id])
            result.status   = true
            result.message  = 'Berjaya mendapatkan jumlah item.'
            result.data     = { total: data[0].total }
        } catch (error) {
            console.error('TotalData Error:', error)
            result.message = error_db
        }
        return result
    }

}

module.exports = ExpensesItem