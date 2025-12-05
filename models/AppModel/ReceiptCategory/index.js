const db = require("../../../utils/sqlbuilder")

/**
 * Get list of active receipt categories for user selection
 * @returns {object} { status: boolean, data: array|null }
 */
async function GetReceiptCategoriesList() {
    let result = null
    try {
        const sql = `
            SELECT 
                rc_id, 
                rc_name, 
                rc_description, 
                status, 
                created_date, 
                last_modified 
            FROM receipt_category 
            WHERE status = 'Active' 
            ORDER BY rc_name ASC
        `
        const data = await db.raw(sql, [])
        
        result = { 
            status: true, 
            data: data 
        }
    } catch (e) {
        console.log("Error GetReceiptCategoriesList: ", e)
        result = { status: false, data: null }
    } finally {
        return result
    }
}

/**
 * Get single receipt category details by ID
 * @param {number} rc_id - Receipt category ID
 * @returns {object} { status: boolean, data: object|null }
 */
async function GetReceiptCategoryDetails(rc_id) {
    let result = null
    try {
        const sql = `
            SELECT 
                rc_id, 
                rc_name, 
                rc_description, 
                status, 
                created_date, 
                last_modified 
            FROM receipt_category 
            WHERE rc_id = ? AND status = 'Active' 
            LIMIT 1
        `
        const data = await db.raw(sql, [rc_id])
        
        if(data.length) {
            result = { status: true, data: data[0] }
        } else {
            result = { status: false, data: null }
        }
    } catch (e) {
        console.log("Error GetReceiptCategoryDetails: ", e)
        result = { status: false, data: null }
    } finally {
        return result
    }
}

/**
 * Get list of active receipt categories for user selection (value/label format)
 * @returns {object} { status: boolean, data: array|null }
 */
async function GetReceiptCategoriesOptions() {
    let result = null
    try {
        const sql = `
            SELECT rc_id, rc_name 
            FROM receipt_category 
            WHERE status = 'Active' 
            ORDER BY rc_id ASC
        `
        const data = await db.raw(sql)
        
        result = { 
            status: true, 
            data: data
        }
    } catch (e) {
        console.log("Error GetReceiptCategoriesOptions: ", e)
        result = { status: false, data: null }
    } finally {
        return result
    }
}

module.exports = {
    GetReceiptCategoriesList,
    GetReceiptCategoryDetails,
    GetReceiptCategoriesOptions
}
