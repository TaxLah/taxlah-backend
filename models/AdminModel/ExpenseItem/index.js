const db = require("../../../utils/sqlbuilder")

/**
 * Get list of items for a specific expense
 * @param {number} expenses_id - Expense ID
 * @returns {object} { status: boolean, data: array|null }
 */
async function AdminGetExpenseItems(expenses_id) {
    let result = null
    try {
        const sql = `
            SELECT 
                item_id, 
                item_sku_unit,
                item_name, 
                item_unit_price, 
                item_quantity,
                item_total_price,
                status, 
                created_date, 
                last_modified 
            FROM account_expenses_item 
            WHERE expenses_id = ? AND status != 'Deleted'
            ORDER BY item_id ASC
        `
        const data = await db.raw(sql, [expenses_id])
        
        result = { 
            status: true, 
            data: data 
        }
    } catch (e) {
        console.log("Error AdminGetExpenseItems: ", e)
        result = { status: false, data: null }
    } finally {
        return result
    }
}

/**
 * Get single expense item details
 * @param {number} item_id - Item ID
 * @returns {object} { status: boolean, data: object|null }
 */
async function AdminGetExpenseItemDetails(item_id) {
    let result = null
    try {
        const sql = `
            SELECT 
                item_id, 
                item_sku_unit,
                item_name, 
                item_unit_price, 
                item_quantity,
                item_total_price,
                expenses_id,
                status, 
                created_date, 
                last_modified 
            FROM account_expenses_item 
            WHERE item_id = ? 
            LIMIT 1
        `
        const data = await db.raw(sql, [item_id])
        
        if(data.length) {
            result = { status: true, data: data[0] }
        } else {
            result = { status: false, data: null }
        }
    } catch (e) {
        console.log("Error AdminGetExpenseItemDetails: ", e)
        result = { status: false, data: null }
    } finally {
        return result
    }
}

/**
 * Create expense item
 * @param {number} expenses_id - Expense ID
 * @param {object} itemData - { item_sku_unit, item_name, item_unit_price, item_quantity, item_total_price, status }
 * @returns {object} { status: boolean, data: object|null }
 */
async function AdminCreateExpenseItem(expenses_id, itemData = {}) {
    let result = null
    try {
        const { item_sku_unit, item_name, item_unit_price = 0, item_quantity = 0, item_total_price = 0, status = 'Active' } = itemData

        if (!item_name) {
            return { status: false, message: 'Item name is required', data: null }
        }

        const sql = `
            INSERT INTO account_expenses_item 
            (item_sku_unit, item_name, item_unit_price, item_quantity, item_total_price, status, created_date, last_modified, expenses_id)
            VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW(), ?)
        `

        const result_insert = await db.raw(sql, [item_sku_unit || '', item_name, item_unit_price, item_quantity, item_total_price, status, expenses_id])
        
        if (result_insert.insertId) {
            const getResult = await AdminGetExpenseItemDetails(result_insert.insertId)
            result = getResult
        } else {
            result = { status: false, message: 'Failed to create expense item', data: null }
        }

    } catch (e) {
        console.log("Error AdminCreateExpenseItem: ", e)
        result = { status: false, message: e.message, data: null }
    } finally {
        return result
    }
}

/**
 * Update expense item
 * @param {number} item_id - Item ID
 * @param {object} updateData - { item_sku_unit, item_name, item_unit_price, item_quantity, item_total_price, status }
 * @returns {object} { status: boolean, data: object|null }
 */
async function AdminUpdateExpenseItem(item_id, updateData = {}) {
    let result = null
    try {
        const updates = []
        const values = []

        if (updateData.item_sku_unit !== undefined) {
            updates.push(`item_sku_unit = ?`)
            values.push(updateData.item_sku_unit)
        }

        if (updateData.item_name !== undefined) {
            updates.push(`item_name = ?`)
            values.push(updateData.item_name)
        }

        if (updateData.item_unit_price !== undefined) {
            updates.push(`item_unit_price = ?`)
            values.push(updateData.item_unit_price)
        }

        if (updateData.item_quantity !== undefined) {
            updates.push(`item_quantity = ?`)
            values.push(updateData.item_quantity)
        }

        if (updateData.item_total_price !== undefined) {
            updates.push(`item_total_price = ?`)
            values.push(updateData.item_total_price)
        }

        if (updateData.status !== undefined) {
            updates.push(`status = ?`)
            values.push(updateData.status)
        }

        if (updates.length === 0) {
            return { status: false, message: 'No data to update', data: null }
        }

        updates.push(`last_modified = NOW()`)

        const sql = `UPDATE account_expenses_item SET ${updates.join(', ')} WHERE item_id = ?`
        values.push(item_id)

        await db.raw(sql, values)

        // Fetch and return updated item
        const getResult = await AdminGetExpenseItemDetails(item_id)
        result = getResult

    } catch (e) {
        console.log("Error AdminUpdateExpenseItem: ", e)
        result = { status: false, message: e.message, data: null }
    } finally {
        return result
    }
}

/**
 * Delete expense item (soft delete)
 * @param {number} item_id - Item ID
 * @returns {object} { status: boolean, message: string }
 */
async function AdminDeleteExpenseItem(item_id) {
    let result = null
    try {
        const sql = `UPDATE account_expenses_item SET status = 'Deleted', last_modified = NOW() WHERE item_id = ?`
        
        await db.raw(sql, [item_id])

        result = { status: true, message: 'Expense item deleted successfully' }

    } catch (e) {
        console.log("Error AdminDeleteExpenseItem: ", e)
        result = { status: false, message: 'Failed to delete expense item' }
    } finally {
        return result
    }
}

module.exports = {
    AdminGetExpenseItems,
    AdminGetExpenseItemDetails,
    AdminCreateExpenseItem,
    AdminUpdateExpenseItem,
    AdminDeleteExpenseItem
}
