const db = require("../../../utils/sqlbuilder")

async function DeviceUser(account_id = '') {
    let result = null
    try {
        let query = await db.select("account_device", { account_id, device_status: 'Active' }, '*', 0, 100)
        if(query.length > 0) {
            result = { status: true, data: query }
        } else {
            result = { status: false, data: [] }
        }
    } catch (e) {
        result = { status: false, data: [] }
    } finally {
        return result
    }
}

async function DeviceGetByUUID(account_id = '', device_uuid = '') {
    let result = null
    try {
        let query = await db.select("account_device", { account_id, device_uuid }, '*', 0, 1)
        if(query.length > 0) {
            result = { status: true, data: query[0] }
        } else {
            result = { status: false, data: null }
        }
    } catch (e) {
        result = { status: false, data: null }
    } finally {
        return result
    }
}

async function DeviceDeactivate(account_id = '', device_id = '') {
    let result = null
    try {
        let query = await db.update("account_device", { device_status: 'Inactive' }, { account_id, device_id })
        if(query > 0) {
            result = { status: true, data: null }
        } else {
            result = { status: false, data: null }
        }
    } catch (e) {
        result = { status: false, data: null }
    } finally {
        return result
    }
}

async function DeviceCreate(params = { account_id: '', device_uuid: '', device_name: '', device_os: '', device_enable_fcm: 'Yes', device_fcm_token: ''}) {
    let result = null
    try {
        let query = await db.insert("account_device", params)
        if(query.insertId) {
            result = { status: true, data: query.insertId }
        } else {
            result = { status: false, data: null }
        }
    } catch (e) {
        result = { status: false, data: null }
    } finally {
        return result
    }
}

async function DeviceUpdate(params = { account_id: '', device_id: '',  device_uuid: '', device_name: '', device_os: '', device_enable_fcm: 'Yes', device_fcm_token: ''}) {
    let result = null
    try {
        let query = await db.update("account_device", params, { account_id: params.account_id, device_id: params.device_id })
        if(query) {
            result = { status: true, data: query }
        } else {
            result = { status: false, data: null }
        }
    } catch (e) {
        result = { status: false, data: null }
    } finally {
        return result
    }
}

module.exports = {
    DeviceUser,
    DeviceGetByUUID,
    DeviceCreate,
    DeviceUpdate,
    DeviceDeactivate
}