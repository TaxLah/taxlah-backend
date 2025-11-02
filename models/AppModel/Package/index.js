const db = require("../../../utils/sqlbuilder")

async function GetPackage(limit = 1) {
    let result = null
    try {
        let sql     = `SELECT * FROM package WHERE status LIKE 'Active' LIMIT ${limit}`
        let query   = await db.raw(sql)
        result = {
            status: true,
            data: {...query[0], package_content: JSON.parse(query[0]["package_content"])}
        }
    } catch (e) {
        result = { status: false, data: null }
    } finally {
        return result
    }
}

module.exports = {
    GetPackage
}