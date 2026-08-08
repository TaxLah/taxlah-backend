const express = require('express')
const { DEFAULT_API_RESPONSE, INTERNAL_SERVER_ERROR_API_RESPONSE, SUCCESS_API_RESPONSE, FORBIDDEN_API_RESPONSE, NOT_FOUND_API_RESPONSE, ERROR_TECHNICAL_ERROR } = require('../../../configs/helper')
const {
    UserNotificationGetList,
    UserNotificationGetInfo,
    UserNotificationMarkAllRead,
    UserNotificationArchive,
    UserNotificationArchiveAll
} = require('../../../models/AppModel/Notification')
const router = express.Router()

router.get("/", async(req , res) => {
    let response    = DEFAULT_API_RESPONSE
    let user        = req.user

    // page/limit end up interpolated into LIMIT/OFFSET downstream — coerce them here.
    let page        = Math.max(parseInt(req.query.page, 10) || 1, 1)
    let limit       = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 100)
    let offset      = (page - 1) * limit

    try {
        
        let account_id = user.account_id
        console.log("Account ID:", account_id, "Offset:", offset, "Limit:", limit)
        
        let list = await UserNotificationGetList({ account_id, offset, limit })
        if(list.status) {
            response            = SUCCESS_API_RESPONSE
            response.message    = "Success"
            response.data       = list.data
        } else {
            response            = FORBIDDEN_API_RESPONSE
            response.message    = ERROR_TECHNICAL_ERROR
            response.data       = list.data
        }
    } catch (e) {
        response = INTERNAL_SERVER_ERROR_API_RESPONSE
        response.data = null  
    } 

    return res.status(response.status_code).json(response)
})

/**
 * PUT /notification/read-all
 *
 * Declared before "/:id" so "read-all" is never captured as an id.
 */
router.put("/read-all", async (req, res) => {
    let response = DEFAULT_API_RESPONSE

    try {
        const result = await UserNotificationMarkAllRead(req.user.account_id)

        if (!result.status) {
            response = { ...INTERNAL_SERVER_ERROR_API_RESPONSE, message: ERROR_TECHNICAL_ERROR }
            return res.status(response.status_code).json(response)
        }

        response = { ...SUCCESS_API_RESPONSE, message: "All notifications marked as read.", data: { updated: result.data } }
    } catch (e) {
        console.error("Error mark all notifications read:", e)
        response = { ...INTERNAL_SERVER_ERROR_API_RESPONSE, data: null }
    }

    return res.status(response.status_code).json(response)
})

/**
 * DELETE /notification
 *
 * Clears the user's list. Archives rather than deletes — the rows remain, so what the
 * system sent is still on record after a user tidies up.
 */
router.delete("/", async (req, res) => {
    let response = DEFAULT_API_RESPONSE

    try {
        const result = await UserNotificationArchiveAll(req.user.account_id)

        if (!result.status) {
            response = { ...INTERNAL_SERVER_ERROR_API_RESPONSE, message: ERROR_TECHNICAL_ERROR }
            return res.status(response.status_code).json(response)
        }

        response = { ...SUCCESS_API_RESPONSE, message: "Notifications cleared.", data: { removed: result.data } }
    } catch (e) {
        console.error("Error clear notifications:", e)
        response = { ...INTERNAL_SERVER_ERROR_API_RESPONSE, data: null }
    }

    return res.status(response.status_code).json(response)
})

/** DELETE /notification/:id — removes one, scoped to the caller's own account. */
router.delete("/:id", async (req, res) => {
    let response = DEFAULT_API_RESPONSE

    try {
        const result = await UserNotificationArchive(req.user.account_id, req.params.id)

        if (!result.status) {
            // Either it does not exist or it is not theirs — both answer the same way,
            // so an id cannot be probed for existence.
            response = { ...NOT_FOUND_API_RESPONSE, message: "Notification not found." }
            return res.status(response.status_code).json(response)
        }

        response = { ...SUCCESS_API_RESPONSE, message: "Notification removed.", data: null }
    } catch (e) {
        console.error("Error delete notification:", e)
        response = { ...INTERNAL_SERVER_ERROR_API_RESPONSE, data: null }
    }

    return res.status(response.status_code).json(response)
})

router.get("/:id", async(req , res) => {
    let response    = DEFAULT_API_RESPONSE
    let user        = req.user
    let id          = req.params.id

    try {
        
        let account_id = user.account_id
        let list = await UserNotificationGetInfo(account_id, id)
        if (list.status && !list.data) {
            // A missing row still reported status:true, so a deleted or someone else's
            // notification answered 200 with a null body and the detail screen rendered
            // blank rather than saying it was gone.
            response = { ...NOT_FOUND_API_RESPONSE, message: "Notification not found.", data: null }
            return res.status(response.status_code).json(response)
        }
        if(list.status) {
            response            = SUCCESS_API_RESPONSE
            response.message    = "Success"
            response.data       = list.data
        } else {
            response            = FORBIDDEN_API_RESPONSE
            response.message    = ERROR_TECHNICAL_ERROR
            response.data       = list.data
        }
    } catch (e) {
        response = INTERNAL_SERVER_ERROR_API_RESPONSE
        response.data = null  
    } 

    return res.status(response.status_code).json(response)
})
module.exports = router