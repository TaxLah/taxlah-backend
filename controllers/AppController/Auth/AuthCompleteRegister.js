const express = require('express')
const { DEFAULT_API_RESPONSE, INTERNAL_SERVER_ERROR_API_RESPONSE, CHECK_EMPTY, BAD_REQUEST_API_RESPONSE, FORBIDDEN_API_RESPONSE, SUCCESS_API_RESPONSE, SEND_EMAIL_NOTIFICATION } = require('../../../configs/helper')
const { CheckApprovalAccountByEmail, AccountCreate, UpdateApprovalAccount, CheckAccountByEmail } = require('../../../models/AppModel/Account')
const router = express.Router()

const moment = require('moment')
const { AuthCreateAccessAccount } = require('../../../models/AppModel/Auth')

const EmailService = require("../../../services/MailService")
const { ApprovalCodeEmail, OnboardingEmail } = require('../../../services/MailTemplate')
const mailService = require('../../../services/MailService')
const { UserNotificationCreate } = require('../../../models/AppModel/Notification')

function generateOtp() {
    return String(Math.floor(100000 + Math.random() * 900000))
}

router.post("/resend-otp", async(req , res) => {
    let response        = DEFAULT_API_RESPONSE
    let email_account   = null

    try {
        
        let params = req.body
        console.log("Log Params : ", params)

        email_account = params.email_account || null

        if(CHECK_EMPTY(email_account)) {
            response = BAD_REQUEST_API_RESPONSE
            response.message = "Field email account is empty."
            return res.status(response.status_code).json(response)
        } else {
            let temp_acc = await CheckApprovalAccountByEmail(email_account)
            console.log("Log Check Approval Account : ", temp_acc)

            if(!temp_acc.status) {
                response = FORBIDDEN_API_RESPONSE
                response.message = "Invalid email address or account not found."
                return res.status(response.status_code).json(response)
            } else { 
                let { id, email, account, is_verified, verified_date, otp_number, otp_expired_date } = temp_acc.data
                console.log("Log ID : ", id)
                console.log("Log Email : ", email)
                console.log("Log Account : ", account)
                console.log("Log Is Account Verified : ", is_verified)
                console.log("Log Verified Date : ", verified_date)
                console.log("Log OTP Number : ", otp_number)
                console.log("Log OTP Expired : ", otp_expired_date)

                if(is_verified !== 'Approved') {

                    let new_approval_code = generateOtp()
                    console.log("Log New Approval Code : ", new_approval_code)

                    const updateApproval = await UpdateApprovalAccount(id, {
                        is_verified: 'Pending',
                        otp_number: new_approval_code,
                        otp_expired_date: moment.utc().add(10, 'minutes').format("YYYY-MM-DD HH:mm:ss"),
                        last_modified: moment.utc().format("YYYY-MM-DD HH:mm:ss")
                    })

                    if(!updateApproval.status) {
                        response            = INTERNAL_SERVER_ERROR_API_RESPONSE
                        response.message    = "Unable to refresh OTP at the moment. Please try again."
                        return res.status(response.status_code).json(response)
                    }

                    const latestApproval = await CheckApprovalAccountByEmail(email_account)
                    if(!latestApproval.status || !latestApproval.data || !latestApproval.data.otp_number) {
                        response            = INTERNAL_SERVER_ERROR_API_RESPONSE
                        response.message    = "Unable to read refreshed OTP. Please try again."
                        return res.status(response.status_code).json(response)
                    }

                    let html = ApprovalCodeEmail(email_account, latestApproval.data.otp_number)
                    await EmailService.sendMail({ 
                        to: email_account,
                        ...html,
                        subject: `🔐 Your New Account Approval Code (${moment.utc().format('HH:mm')} UTC)`
                    })

                    response = SUCCESS_API_RESPONSE
                    response.message = "Request success. Please check your mailbox to get your new approval code."
                    return res.status(response.status_code).json(response)
                } else {
                    response = FORBIDDEN_API_RESPONSE
                    response.message = "Your account has approved. Please proceed to login into your account."
                    return res.status(response.status_code).json(response)
                }
            }
        }
    } catch (e) {
        console.log("[AuthApprovalRetryOTP] error : ", e)
        response = INTERNAL_SERVER_ERROR_API_RESPONSE
    }

    return res.status(response.status_code).json(response)
})

router.post("/", async(req , res) => {
    
    let response        = DEFAULT_API_RESPONSE
    let email_account   = null
    let email_otp       = null

    try {

        let params = req.body
        console.log("Log Params : ", params)
        
        email_account   = params.email_account || null
        email_otp       = params.email_otp || null

        if(CHECK_EMPTY(email_account)) {
            response = BAD_REQUEST_API_RESPONSE
            response.message = "Field email account is empty."
            return res.status(response.status_code).json(response)
        }
        else if(CHECK_EMPTY(email_otp)) {
            response = BAD_REQUEST_API_RESPONSE
            response.message = "Field email account otp number is empty."
            return res.status(response.status_code).json(response)
        }
        else {
            let temp_acc = await CheckApprovalAccountByEmail(email_account)
            console.log("Log Check Approval Account : ", temp_acc)

            if(!temp_acc.status) {
                response = FORBIDDEN_API_RESPONSE
                response.message = "Invalid email address or account not found."
                return res.status(response.status_code).json(response)
            } else {

                let { id, email, account, is_verified, verified_date, otp_number, otp_expired_date } = temp_acc.data
                console.log("Log ID : ", id)
                console.log("Log Email : ", email)
                console.log("Log Account : ", account)
                console.log("Log Is Account Verified : ", is_verified)
                console.log("Log Verified Date : ", verified_date)
                console.log("Log OTP Number : ", otp_number)
                console.log("Log OTP Expired : ", otp_expired_date)

                if(parseFloat(email_otp) !== parseFloat(otp_number)) {
                    response            = FORBIDDEN_API_RESPONSE
                    response.message    = "Invalid OTP number. Please make sure you have valid OTP number and check your email."
                    return res.status(response.status_code).json(response)
                }
                else {
                    
                    const nowUtc = moment.utc()
                    const otpExpiredUtc = moment.utc(otp_expired_date)

                    console.log("Log Now UTC : ", nowUtc.format("YYYY-MM-DD HH:mm:ss"))
                    console.log("Log OTP Expired UTC : ", otpExpiredUtc.format("YYYY-MM-DD HH:mm:ss"))
                    console.log(nowUtc.isAfter(otpExpiredUtc) ? 'true' : 'false')

                    if(nowUtc.isAfter(otpExpiredUtc)) {

                        await UpdateApprovalAccount(id, {
                            is_verified: 'Expired',
                            last_modified: moment.utc().format("YYYY-MM-DD HH:mm:ss")
                        })

                        response = FORBIDDEN_API_RESPONSE
                        response.message = "Your OTP number has expired. Please request for email verification again."
                        return res.status(response.status_code).json(response)
                    } else {

                        console.log("Log Account JSON : ", account)

                        let check_account_if_exist = await CheckAccountByEmail(email)
                        if(check_account_if_exist.status == false && check_account_if_exist.is_error == true) {
                            response            = INTERNAL_SERVER_ERROR_API_RESPONSE
                            response.message    = "Unable to verify your account at the moment. Please contact our support."
                            return res.status(response.status_code).json(response)
                        }
                        else if(check_account_if_exist.status == false && check_account_if_exist.is_error == false) {

                            let create_account  = await AccountCreate({
                                ...account.account,
                                account_status: "Active",
                                account_verified: "Approved"
                            })
                            let create_access   = await AuthCreateAccessAccount({
                                ...account.access, 
                                account_id: create_account.account_id,
                                auth_status: "Active"
                            })

                            if(create_account.status && create_access.status) {
                                let updateApprovalAccount = await UpdateApprovalAccount(id, {
                                    is_verified: 'Approved',
                                    verified_date: moment.utc().format("YYYY-MM-DD HH:mm:ss"),
                                    last_modified: moment.utc().format("YYYY-MM-DD HH:mm:ss")
                                })

                                let { subject, text, html } = OnboardingEmail(account.account_fullname, email)

                                await mailService.sendMail({
                                    to: email,
                                    subject: subject,
                                    text: text,
                                    html: html
                                })

                                let fcm_title       = subject
                                let fcm_text        = "Congratulation! Your Taxlah account has been registered successfully. We're thrilled to have you on board. Your account has been successfully created, and you're now ready to simplify your tax filing journey with Taxlah."
                                let create_fcm      = await UserNotificationCreate({ 
                                    account_id: create_account.account_id, 
                                    notification_title: fcm_title,
                                    notification_description: fcm_text,
                                    read_status: 'No',
                                    archive_status: 'No',
                                    status: 'Active'
                                })

                                response            = SUCCESS_API_RESPONSE
                                response.message    = "Account approved. Please continue to login your account."
                                return res.status(response.status_code).json(response)
                            } else {
                                response            = INTERNAL_SERVER_ERROR_API_RESPONSE
                                response.message    = "Error. Unable to approved your account. Please contact our support for more information."
                                return res.status(response.status_code).json(response)
                            }
                        } else {
                            let updateApprovalAccount = await UpdateApprovalAccount(id, {
                                is_verified: 'Approved',
                                verified_date: moment.utc().format("YYYY-MM-DD HH:mm:ss"),
                                last_modified: moment.utc().format("YYYY-MM-DD HH:mm:ss")
                            })
                            response            = SUCCESS_API_RESPONSE
                            response.message    = "Account approved. Please continue to login your account."
                            return res.status(response.status_code).json(response)
                        }

                    }
                }
            }
        }
        
    } catch (e) {
        console.log("[AuthCompleteRegister] error : ", e)
        response = INTERNAL_SERVER_ERROR_API_RESPONSE
    }

    return res.status(response.status_code).json(response)
})
module.exports = router