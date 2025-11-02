const db = require("../../../utils/sqlbuilder")

async function TaxCategoryList(params) {
    let result = null
    try {
        let sql     = `SELECT * FROM tax_category WHERE status LIKE 'Active'`
        let query   = await db.raw(sql)
        result = {
            status: true,
            data: query
        }
    } catch (e) {
        result = { status: false, data: null }
    } finally {
        return result
    }
}

module.exports = {
    TaxCategoryList
}