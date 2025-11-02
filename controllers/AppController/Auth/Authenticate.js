const express = require('express')
const { SUCCESS_API_RESPONSE, INTERNAL_SERVER_ERROR_API_RESPONSE, CHECK_EMPTY, UNAUTHORIZED_API_RESPONSE, ERROR_UNAUTHENTICATED, CREATE_ACCESS_TOKEN, CREATE_REFRESH_TOKEN } = require('../../../configs/helper')
const { auth } = require('../../../configs/auth')
const router = express.Router()

router.get("/", auth(), async(req , res) => {
    let response    = SUCCESS_API_RESPONSE
    let user        = req.user || null
    console.log("Log User : ", user)

    try {
        if(CHECK_EMPTY(user)) {
            response            = UNAUTHORIZED_API_RESPONSE
            response.message    = ERROR_UNAUTHENTICATED
            response.data       = null
        } else {

            let profile         = { 
                uid: user.uid, 
                aid: user.aid,
                username: user.username,
                usermail: user.usermail,
                account_id: user.account_id,
                account_secret_key: user.account_secret_key,
                account_name: user.account_name,
                account_fullname: user.account_fullname,
                account_email: user.account_email,
                account_contact: user.account_contact,
                account_profile_image: user.account_profile_image,
                account_status: user.account_status
            }
            let access_token    = await CREATE_ACCESS_TOKEN(profile)
            let refresh_token   = await CREATE_REFRESH_TOKEN(profile)
            response            = SUCCESS_API_RESPONSE
            response.message    = "Aunthenticated."
            response.data       = {
                profile: profile,
                new_access_token: access_token,
                new_refresh_token: refresh_token
            }
        }
    } catch (e) {
        console.log("err authenticate : ", e)
        response = INTERNAL_SERVER_ERROR_API_RESPONSE
        response.data = null
    } finally {
        return res.status(response.status_code).json(response)
    }
})
module.exports = router