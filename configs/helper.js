require("dotenv").config()

const jwt                       = require('jsonwebtoken');
const sha256                    = require('js-sha256').sha256;
const { default: axios }        = require('axios');
const { toyyibpay, devtoyyib }  = require('./constant');

const nodemailer                = require("nodemailer");
const postmark                  = require("postmark");

const ACCESS_TOKEN_SECRET   = '54b041d5e63eeb9b4487fc54efd9c8de077b1ae068471439600a00a874157acbbc27e3333383e9564e7153a36a7157c9e5fa7d56ad305d1c66b16264d1a9071a';
const REFRESH_TOKEN_SECRET  = '9c1a4a435c35feb51d5a25f81234033cfedbc1b69ca521e0c2316cc725f9803936bb48e6afbaae0f480c0d4e43fd40b9648bf00b6e7913f582d620c33f35d915';

// const fcmadmin          = require("firebase-admin")
// const serviceAccount    = require("./fcmkey.json")

// fcmadmin.initializeApp({
//     credential: fcmadmin.credential.cert(serviceAccount)
// });

let transporter = nodemailer.createTransport({
    host: "host.taxlah.com",
    port: 587,
    secure: false, // true for 465, false for other ports
    tls: {
        rejectUnauthorized: false,
        minVersion: "TLSv1.2"
    },
    auth: {
        user: 'admin@taxlah.com', // generated ethereal user
        pass: 'R@iden28', // generated ethereal password
    },
});

const API_FIRST_RESPONSE = {
    status_code: 500,
    status: "Internal Server Error",
    message: "Internal Server Error. Please contact our support for more information..",
    body: []
}

const API_INTERNAL_SERVER_ERROR = {
    status_code: 500,
    status: "Internal Server Error",
    message: "Internal Server Error. Please contact our support for more information..",
    body: []
}

const API_FORBIDDEN_RESPONSE = {
    status_code: 403,
    status: "Unauthorized",
    message: "Your're not authorized. Please login or contact our support for more information..",
    body: []
}

const API_BAD_REQUEST_RESPONSE = {
    status_code: 400,
    status: "Bad Request",
    message: "Bad request. Please check one of your parameter value.",
    body: []
}

const API_SUCCESS_RESPONSE = {
    status_code: 200,
    status: "success",
    message: "success",
    body: []
}

const CHECK_EMPTY = (string) => {
    if(!string || string === "" || string === " " || string === null) {
        return true
    } else {
        return false
    }
}

const DEFAULT_API_RESPONSE = {
    status_code: 500,
    status: 'Internal Server Error',
    message: 'Technical Issue. Please contact our support for more information..',
    data: []
}

const INTERNAL_SERVER_ERROR_API_RESPONSE = {
    status_code: 500,
    status: 'Internal Server Error',
    message: 'Internal Server Error. Please contact our support for more information..',
    data: []
}

const SUCCESS_API_RESPONSE = {
    status_code: 200,
    status: 'Success',
    message: 'API Request Success.',
    data: []
}

const FORBIDDEN_API_RESPONSE = {
    status_code: 403,
    status: 'Forbidden',
    message: `You're not authorized from accessing the server. Please contact our support for more information..`,
    data: []
}

const UNAUTHORIZED_API_RESPONSE = {
    status_code: 401,
    status: 'Unauthorized',
    message: `You're not authorized from accessing the server. Please contact our support for more information..`,
    data: []
}

const BAD_REQUEST_API_RESPONSE = {
    status_code: 400,
    status: 'Bad Request',
    message: `Please check your API paramater value. It might be one of the parameter has incorrect format.`,
    data: []
}

const ERROR_MISSING_TOKEN   = "The requested operation could not be completed because a valid session token was not provided. In order to access this API endpoint, you must include a valid session token in the request headers."
const ERROR_UNAUTHENTICATED = "Unauthenticated. Please login." 
const ERROR_TECHNICAL_ERROR = "Internal Server Error. Please contact our system administrator for more information."
const ERROR_PERMISSION      = "Insufficient Permission. You are not allowed to process the data. Please contact our system administrator."
const ERROR_BUKAN_KARIAH    = "Akaun anda tidak mempunyai rekod sebagai seorang ahli kariah. Sila buat pendaftaran sebagai ahli kariah."
const ERROR_RALAT           = "Sistem Ralat! Terdapat masalah pada pangkalan data. Sila hubungi pihak sistem pentadbir untuk keterangan lebih lanjut."

async function ENCRYPT_PASSWORD(password) {
    let encrypt = await sha256(password);
    console.log("Encrypting Password : ", encrypt);

    return encrypt;
}

async function CREATE_ACCESS_TOKEN(data) {
    let sign = jwt.sign(data, process.env.APP_SECRET, { expiresIn: '180d' })
    return sign;
}

async function CREATE_REFRESH_TOKEN(data) {
    let sign = jwt.sign(data, process.env.APP_SECRET, { expiresIn: '180d' })
    return sign;
}

async function VERIFY_TOKEN(jwt_token) {
    let verifyToken = jwt.verify(jwt_token, process.env.APP_SECRET)
    return verifyToken;
}

// GLOBAL FUNCTION UNTUK VERIFY TOKEN
async function AUTH_TOKEN(jwt_token) {
    let result = null
    try {
        const decoded = jwt.verify(jwt_token, process.env.APP_SECRET); // Replace 'your-secret-key' with your actual secret key
        // If the token is valid, you can return the decoded data
        result = {
            status: true,
            user: decoded,
            message: 'Authenticated!'
        }
        return result
    } catch (error) {
        if (error.name === 'TokenExpiredError') 
        {
            result = {
                status: false,
                user: null,
                message: 'Token Expired!'
            }
            return result
        } 
        else 
        {
            console.error('JWT verification error:', error.message);
            result = {
                status: false,
                user: null,
                message: error.message
            }
            return result
        }
    }
}

// GLOBAL FUNCTION UNTUK VERIFY TOKEN
async function SUPER_AUTH_TOKEN(jwt_token) {
    let result = null
    try {
        const decoded = jwt.verify(jwt_token, process.env.ADMIN_SECRET); // Replace 'your-secret-key' with your actual secret key
        // If the token is valid, you can return the decoded data
        result = {
            status: true,
            user: decoded,
            message: 'Authenticated!'
        }
        return result
    } catch (error) {
        if (error.name === 'TokenExpiredError') 
        {
            result = {
                status: false,
                user: null,
                message: 'Token Expired!'
            }
            return result
        } 
        else 
        {
            console.error('JWT verification error:', error.message);
            result = {
                status: false,
                user: null,
                message: error.message
            }
            return result
        }
    }
}

async function CREATE_PAYMENT_INVOICE_NO(length) {

    var result = '';
    var characters = '0123456789';
    var charactersLength = characters.length;

    for (var i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * charactersLength));
    }

    return "YI" + result.toString();
}

async function CREATE_CREDIT_PAYMENT_INVOICE_NO(length) {

    var result = '';
    var characters = '0123456789';
    var charactersLength = characters.length;

    for (var i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * charactersLength));
    }

    return "EW" + result.toString();
}

async function GENERATE_BILLCODE(length) {
    let result = '';
    let characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let charactersLength = characters.length;
    for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() *
            charactersLength));
    }

    return result;
}

async function GENERATE_WALLET_ACCOUNT_NUMBER(length) {
    let result = '';
    let characters = '0123456789';
    let charactersLength = characters.length;
    for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() *
            charactersLength));
    }

    return result;
}

function GENERATE_OTP_CODE(length) {
    let result = '';
    let characters = '0123456789';
    let charactersLength = characters.length;
    for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() *
            charactersLength));
    }

    return result;
}

function CREATE_NEW_PASSWORD(length) {
    let result = '';
    let characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let charactersLength = characters.length;
    for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() *
            charactersLength));
    }

    return result;
}

function GetReturnURL() {
    if(process.env.NODE_ENV === "development") {
        return 'https://dev.taxlah.com/payment/receipt'
    }
    else if(process.env.NODE_ENV === "demo") {
        return 'https://dev.taxlah.com/payment/receipt'
    }  
    else if(process.env.NODE_ENV === "staging") {
        return 'https://dev.taxlah.com/payment/receipt'
    }  
    else if(process.env.NODE_ENV === "production") {
        return 'https://taxlah.com/payment/receipt'
    } 
    else {
        return 'http://127.0.0.1:5173/api/payment/callback'
    }
}

function GetCallbackURL() {
    if(process.env.NODE_ENV === "development") {
        return 'https://dev.taxlah.com/api/payment/callback'
    }
    else if(process.env.NODE_ENV === "demo") {
        return 'https://dev.taxlah.com/api/payment/callback'
    }  
    else if(process.env.NODE_ENV === "staging") {
        return 'https://dev.taxlah.com/api/payment/callback'
    } 
    else if(process.env.NODE_ENV === "production") {
        return 'https://taxlah.com/api/payment/callback'
    } 
    else {
        return 'https://dev.taxlah.com/api/payment/callback'
    }
}

function GetCallbackURL2() {
    if(process.env.NODE_ENV === "development") {
        return 'https://dev.taxlah.com/api/payment/callback2'
    }
    else if(process.env.NODE_ENV === "demo") {
        return 'https://dev.taxlah.com/api/payment/callback2'
    }  
    else if(process.env.NODE_ENV === "staging") {
        return 'https://dev.taxlah.com/api/payment/callback2'
    } 
    else if(process.env.NODE_ENV === "production") {
        return 'https://taxlah.com/api/payment/callback2'
    } 
    else {
        return 'https://dev.taxlah.com/api/payment/callback2'
    }
}

function GetKariahCallbackURL() {
    if(process.env.NODE_ENV === "development") {
        return 'https://dev.taxlah.com/api/ahli-kariah/payment/callback'
    } 
    else if(process.env.NODE_ENV === "demo") {
        return 'https://dev.taxlah.com/api/ahli-kariah/payment/callback'
    } 
    else if(process.env.NODE_ENV === "staging") {
        return 'https://dev.taxlah.com/api/ahli-kariah/payment/callback'
    } 
    else if(process.env.NODE_ENV === "production") {
        return 'https://taxlah.com/api/ahli-kariah/payment/callback'
    } 
    else {
        return 'https://dev.taxlah.com/api/ahli-kariah/payment/callback'
    }
}

async function CREATE_BILL_TOYYIBPAY(bill_name, bill_desc, bill_amount, bill_payment_channel, bill_payor_name, bill_payor_email, bill_payor_phone, invoice, billReturnUrl, billCallbackUrl) {

    let result = null;

    console.log("Log ENV: ", process.env.NODE_ENV)
    console.log("Log toyyibPay Secret Key : ", process.env.NODE_ENV === "production" ? toyyibpay.toyyibpay_secret_key : devtoyyib.toyyibpay_secret_key)

    let formdata = new FormData();
    formdata.append('userSecretKey', process.env.NODE_ENV === "production" ? toyyibpay.toyyibpay_secret_key : devtoyyib.toyyibpay_secret_key);
    formdata.append('categoryCode', process.env.NODE_ENV === "production" ? toyyibpay.toyyibpay_category_code : devtoyyib.toyyibpay_category_code);
    formdata.append('billName', bill_name.length > 30 ? bill_name.substr(0, 26) + '...' : bill_name);
    formdata.append('billDescription', bill_desc.length > 100 ? bill_desc.substr(0, 96) + '...' : bill_desc);
    formdata.append('billAmount', parseFloat(bill_amount) * 100);
    formdata.append('billPriceSetting', 1);
    formdata.append('billPayorInfo', 1);
    formdata.append('billTo', bill_payor_name);
    formdata.append('billEmail', bill_payor_email);
    formdata.append('billPhone', bill_payor_phone);
    formdata.append('billPaymentChannel', bill_payment_channel === 'Online Banking' ? 0 : 1);
    formdata.append('billExternalReferenceNo', invoice)

    formdata.append('paymentTitle', bill_name.length > 30 ? bill_name.substr(0, 26) + '...' : bill_name);
    formdata.append('paymentDescription', bill_desc.length > 100 ? bill_desc.substr(0, 96) + '...' : bill_desc);
    formdata.append('topupAmount', (parseFloat(bill_amount) * 100) - 100);
    formdata.append('payorName', bill_payor_name);
    formdata.append('payorEmail', bill_payor_email);
    formdata.append('payorPhone', bill_payor_phone);
    formdata.append('paymentOrderId', invoice)

    formdata.append('billReturnUrl', billReturnUrl ? billReturnUrl : 'taxlah://resit')
    formdata.append('returnUrl', billReturnUrl ? billReturnUrl : 'taxlah://resit');

    //formdata.append('billReturnUrl', billReturnUrl ? billReturnUrl : 'https://al-jariyah.com/PaymentReceipt')
    //formdata.append('returnUrl', billReturnUrl ? billReturnUrl : 'https://al-jariyah.com/PaymentReceipt');

    formdata.append('billCallbackUrl', billCallbackUrl ? billCallbackUrl : GetCallbackURL())
    formdata.append('callbackUrl', billCallbackUrl ? billCallbackUrl : GetCallbackURL());


    var config = {
        method: 'post',
        url: process.env.NODE_ENV === "production" ? "https://toyyibpay.com/api/createBill" : "https://dev.toyyibpay.com/api/createBill",
        data : formdata,
        //body: formdata,
        redirect: "follow"
    };
      
    await axios(config)
    .then(function (response) {

        console.log(response.data)
        let jsonize = response.data

        try {

            if(jsonize[0]["BillCode"]) {
                result = {
                    status: true,
                    billcode: jsonize[0]["BillCode"]
                }
            } else {
                result = {
                    status: false,
                    billcode: null
                }
            }

        }catch(e) {
            console.log("ERROR TOYYIBPAY : ", e);
            console.log("UNABLE TO GET BILLCODE");
            result = {
                status: false,
                billcode: null
            }
        }
    })
    .catch(function (error) {
        console.log(error);
        console.log("SYNTAX ERROR API : ", e);
        console.log("UNABLE TO GET BILLCODE");
        result = {
            status: false,
            billcode: null
        }
    });

    return result;
}

async function CREATE_BILL_TOYYIBPAY2(bill_name, bill_desc, bill_amount, bill_payment_channel, bill_payor_name, bill_payor_email, bill_payor_phone, invoice, billReturnUrl, billCallbackUrl) {

    let result = null;

    console.log("Log ENV: ", process.env.NODE_ENV)
    console.log("Log toyyibPay Secret Key : ", process.env.NODE_ENV === "production" ? toyyibpay.toyyibpay_secret_key : devtoyyib.toyyibpay_secret_key)

    let formdata = new FormData();
    formdata.append('userSecretKey', process.env.NODE_ENV === "production" ? toyyibpay.toyyibpay_secret_key : devtoyyib.toyyibpay_secret_key);
    formdata.append('categoryCode', process.env.NODE_ENV === "production" ? toyyibpay.toyyibpay_category_code : devtoyyib.toyyibpay_category_code);
    formdata.append('billName', bill_name.length > 30 ? bill_name.substr(0, 26) + '...' : bill_name);
    formdata.append('billDescription', bill_desc.length > 100 ? bill_desc.substr(0, 96) + '...' : bill_desc);
    formdata.append('billAmount', parseFloat(bill_amount) * 100);
    formdata.append('billPriceSetting', 1);
    formdata.append('billPayorInfo', 1);
    formdata.append('billTo', bill_payor_name);
    formdata.append('billEmail', bill_payor_email);
    formdata.append('billPhone', bill_payor_phone);
    formdata.append('billPaymentChannel', bill_payment_channel === 'Online Banking' ? 0 : 1);
    formdata.append('billExternalReferenceNo', invoice)

    formdata.append('paymentTitle', bill_name.length > 30 ? bill_name.substr(0, 26) + '...' : bill_name);
    formdata.append('paymentDescription', bill_desc.length > 100 ? bill_desc.substr(0, 96) + '...' : bill_desc);
    formdata.append('topupAmount', (parseFloat(bill_amount) * 100) - 100);
    formdata.append('payorName', bill_payor_name);
    formdata.append('payorEmail', bill_payor_email);
    formdata.append('payorPhone', bill_payor_phone);
    formdata.append('paymentOrderId', invoice)

    formdata.append('billReturnUrl', billReturnUrl ? billReturnUrl : 'taxlah://PaymentReceipt')
    formdata.append('returnUrl', billReturnUrl ? billReturnUrl : 'taxlah://PaymentReceipt');

    //formdata.append('billReturnUrl', billReturnUrl ? billReturnUrl : 'https://al-jariyah.com/PaymentReceipt')
    //formdata.append('returnUrl', billReturnUrl ? billReturnUrl : 'https://al-jariyah.com/PaymentReceipt');

    formdata.append('billCallbackUrl', billCallbackUrl ? billCallbackUrl : GetCallbackURL2())
    formdata.append('callbackUrl', billCallbackUrl ? billCallbackUrl : GetCallbackURL2());


    var config = {
        method: 'post',
        url: process.env.NODE_ENV === "production" ? "https://toyyibpay.com/api/createBill" : "https://dev.toyyibpay.com/api/createBill",
        data : formdata,
        //body: formdata,
        redirect: "follow"
    };
      
    await axios(config)
    .then(function (response) {

        console.log(response.data)
        let jsonize = response.data

        try {

            if(jsonize[0]["BillCode"]) {
                result = {
                    status: true,
                    billcode: jsonize[0]["BillCode"]
                }
            } else {
                result = {
                    status: false,
                    billcode: null
                }
            }

        }catch(e) {
            console.log("ERROR TOYYIBPAY : ", e);
            console.log("UNABLE TO GET BILLCODE");
            result = {
                status: false,
                billcode: null
            }
        }
    })
    .catch(function (error) {
        console.log(error);
        console.log("SYNTAX ERROR API : ", e);
        console.log("UNABLE TO GET BILLCODE");
        result = {
            status: false,
            billcode: null
        }
    });

    return result;
}

async function CREATE_BILL_TOYYIBPAY_KARIAH(bill_name, bill_desc, bill_amount, bill_payment_channel, bill_payor_name, bill_payor_email, bill_payor_phone, invoice, billReturnUrl, billCallbackUrl) {

    let result = null;

    console.log("Log ENV: ", process.env.NODE_ENV)
    console.log("Log toyyibPay Secret Key : ", process.env.NODE_ENV === "production" ? toyyibpay.toyyibpay_secret_key : devtoyyib.toyyibpay_secret_key)

    let formdata = new FormData();
    formdata.append('userSecretKey', process.env.NODE_ENV === "production" ? toyyibpay.toyyibpay_secret_key : devtoyyib.toyyibpay_secret_key);
    formdata.append('categoryCode', process.env.NODE_ENV === "production" ? toyyibpay.toyyibpay_category_code : devtoyyib.toyyibpay_category_code);
    formdata.append('billName', bill_name.length > 30 ? bill_name.substr(0, 26) + '...' : bill_name);
    formdata.append('billDescription', bill_desc.length > 100 ? bill_desc.substr(0, 96) + '...' : bill_desc);
    formdata.append('billAmount', (parseFloat(bill_amount) * 100));
    formdata.append('billPriceSetting', 1);
    formdata.append('billPayorInfo', 1);
    formdata.append('billTo', bill_payor_name);
    formdata.append('billEmail', bill_payor_email);
    formdata.append('billPhone', bill_payor_phone);
    formdata.append('billPaymentChannel', bill_payment_channel === 'Online Banking' ? 0 : 1);
    formdata.append('billExternalReferenceNo', invoice)
    formdata.append('billReturnUrl', billReturnUrl ? billReturnUrl : GetReturnURL())
    formdata.append('billCallbackUrl', billCallbackUrl ? billCallbackUrl : GetKariahCallbackURL())

    formdata.append('paymentTitle', bill_name.length > 30 ? bill_name.substr(0, 26) + '...' : bill_name);
    formdata.append('paymentDescription', bill_desc.length > 100 ? bill_desc.substr(0, 96) + '...' : bill_desc);
    formdata.append('topupAmount', (parseFloat(bill_amount) * 100));
    formdata.append('payorName', bill_payor_name);
    formdata.append('payorEmail', bill_payor_email);
    formdata.append('payorPhone', bill_payor_phone);
    formdata.append('paymentOrderId', invoice)
    formdata.append('returnUrl', billReturnUrl ? billReturnUrl : GetReturnURL());
    formdata.append('callbackUrl', billCallbackUrl ? billCallbackUrl : GetKariahCallbackURL());


    var config = {
        method: 'post',
        url: process.env.NODE_ENV === "production" ? "https://toyyibpay.com/api/creditTopup" : "https://dev.toyyibpay.com/api/creditTopup",
        data : formdata,
        redirect: "follow"
    };
      
    await axios(config)
    .then(function (response) {

        console.log(response.data)
        let jsonize = response.data

        try {

            if(jsonize[0]["BillCode"]) {
                result = {
                    status: true,
                    billcode: jsonize[0]["BillCode"]
                }
            } else {
                result = {
                    status: false,
                    billcode: null
                }
            }

        } catch(e) {
            console.log("ERROR TOYYIBPAY : ", e);
            console.log("UNABLE TO GET BILLCODE");
            result = {
                status: false,
                billcode: null
            }
        }
    })
    .catch(function (error) {
        console.log(error);
        console.log("SYNTAX ERROR API : ", e);
        console.log("UNABLE TO GET BILLCODE");
        result = {
            status: false,
            billcode: null
        }
    });

    return result;
}

async function SEND_EMAIL_NOTIFICATION(email_address, email_subject, email_body, email_html) {

    try {

        let info = await transporter.sendMail({
            from: 'Admin TXL <admin@taxlah.com>', // sender address
            to: email_address, // list of receivers
            subject: email_subject, // Subject line
            text: email_body, // plain text body
            html: email_html, // html body
        });
    
        console.log("Message sent: %s", info.messageId);
        console.log("Preview URL: %s", nodemailer.getTestMessageUrl(info));
        
    } catch (e) {
        console.log("error send email : ", e)
    }
    // try {
    //     const myHeaders = new Headers();
    //     myHeaders.append("Content-Type", "application/json");

    //     const raw = JSON.stringify({
    //         email_address,
    //         email_subject,
    //         email_body,
    //         email_html
    //     });

    //     const requestOptions = {
    //     method: "POST",
    //     headers: myHeaders,
    //     body: raw,
    //     redirect: "follow"
    //     };

    //     await fetch("https://dev.infaqyide.xyz/api/email/send", requestOptions)
    //     .then((response) => response.json())
    //     .then((result) => console.log(result))
    //     .catch((error) => console.error(error));   
    // } catch (e) {
        
    // }

}

async function FirebaseFCM(notification_title, notification_body, notification_token, notification_status) {

    let result              = null

    try {

        if(notification_token) {
            fcmadmin.messaging().send({
                token: notification_token,
                android: {
                    priority: "high",
                    notification: {
                        sound: "default"
                    }
                },
                apns: {
                    headers: {
                        'apns-priority': '10' // 10 = high priority
                    },
                    payload: {
                        aps: {
                            sound: 'default'
                        }
                    }
                },
                notification: {
                    title: notification_title,
                    body: notification_body,
    
                },
                data: {}
            })
            .then((response) => {
                console.log('Successfully sent message:', response);
                result = response
            })
            .catch((error) => {
                console.error('Error sending message:', error);
                result = error
            });
        }
        
    } catch (e) {
        console.log("[ERROR-FCM-API] : ", e)
        result = null
    }

    return result
}

/**
 * Validate and sanitize pagination parameters
 * @param {Object} params - Request parameters
 * @param {number} params.page - Page number
 * @param {number} params.limit - Records per page
 * @param {number} maxLimit - Maximum allowed limit
 * @returns {Object} Sanitized pagination parameters
 */
function validatePagination(params = {}, maxLimit = 100) {
    const page = Math.max(1, parseInt(params.page) || 1);
    const limit = Math.min(maxLimit, Math.max(1, parseInt(params.limit) || 10));
    const offset = (page - 1) * limit;

    return { page, limit, offset };
}

/**
 * Validate search parameters
 * @param {string} searchTerm - Search term
 * @param {number} minLength - Minimum search term length
 * @returns {Object} Validation result
 */
function validateSearchTerm(searchTerm, minLength = 2) {
    if (!searchTerm || typeof searchTerm !== 'string') {
        return { valid: false, message: 'Search term is required' };
    }

    const trimmed = searchTerm.trim();
    if (trimmed.length < minLength) {
        return { 
            valid: false, 
            message: `Search term must be at least ${minLength} characters long` 
        };
    }

    return { valid: true, term: trimmed };
}

/**
 * Sanitize and validate filter parameters
 * @param {Object} filters - Filter parameters
 * @returns {Object} Sanitized filters
 */
function sanitizeFilters(filters = {}) {
    const sanitized = {};
    
    // List of allowed filter fields
    const allowedFields = ['type', 'state', 'city', 'sortBy', 'sortOrder'];
    
    allowedFields.forEach(field => {
        if (filters[field] && typeof filters[field] === 'string') {
            sanitized[field] = filters[field].trim();
        }
    });

    return sanitized;
}

/**
 * Validate organization ID
 * @param {string|number} id - Organization ID
 * @returns {Object} Validation result
 */
function validateOrganizationId(id) {
    if (!id) {
        return { valid: false, message: 'Organization ID is required' };
    }

    const numId = parseInt(id);
    if (isNaN(numId) || numId <= 0) {
        return { valid: false, message: 'Invalid organization ID format' };
    }

    return { valid: true, id: numId };
}

/**
 * Create standardized pagination response
 * @param {Array} data - Data array
 * @param {number} total - Total records
 * @param {number} page - Current page
 * @param {number} limit - Records per page
 * @returns {Object} Pagination response object
 */
function createPaginationResponse(data, total, page, limit) {
    const totalPages = Math.ceil(total / limit);
    const offset = (page - 1) * limit;

    return {
        data,
        pagination: {
            currentPage: page,
            totalPages,
            totalRecords: total,
            limit,
            offset,
            hasNextPage: offset + limit < total,
            hasPrevPage: page > 1
        }
    };
}

/**
 * Create cache key for organization queries
 * @param {Object} params - Query parameters
 * @returns {string} Cache key
 */
function createOrganizationCacheKey(params) {
    const sortedParams = Object.keys(params)
        .sort()
        .map(key => `${key}:${params[key]}`)
        .join('|');
    
    return `org:${sortedParams}`;
}

// Helper functions
function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isStrongPassword(password) {
    // At least 8 chars, 1 uppercase, 1 lowercase, 1 number, 1 special char
    return /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}$/.test(password);
}

function sanitize(input) {
    if (typeof input !== 'string') return '';
    return input.replace(/[<>'"]/g, '');
}

// KALAU BIRU TU CONSTANT KALAU KUNING TU FUNCTION
module.exports = {
    API_FIRST_RESPONSE,
    API_INTERNAL_SERVER_ERROR,
    API_FORBIDDEN_RESPONSE,
    API_BAD_REQUEST_RESPONSE,
    API_SUCCESS_RESPONSE,
    DEFAULT_API_RESPONSE,
    INTERNAL_SERVER_ERROR_API_RESPONSE,
    BAD_REQUEST_API_RESPONSE,
    FORBIDDEN_API_RESPONSE,
    UNAUTHORIZED_API_RESPONSE,
    SUCCESS_API_RESPONSE,
    ERROR_MISSING_TOKEN,
    ERROR_PERMISSION,
    ERROR_TECHNICAL_ERROR,
    ERROR_UNAUTHENTICATED,
    ERROR_BUKAN_KARIAH,
    ERROR_RALAT,
    CHECK_EMPTY,
    ENCRYPT_PASSWORD,
    CREATE_ACCESS_TOKEN,
    CREATE_REFRESH_TOKEN,
    VERIFY_TOKEN,
    AUTH_TOKEN,
    SUPER_AUTH_TOKEN,
    CREATE_PAYMENT_INVOICE_NO,
    CREATE_CREDIT_PAYMENT_INVOICE_NO,
    GENERATE_BILLCODE,
    GENERATE_OTP_CODE,
    GENERATE_WALLET_ACCOUNT_NUMBER,
    CREATE_BILL_TOYYIBPAY,
    CREATE_BILL_TOYYIBPAY2,
    CREATE_BILL_TOYYIBPAY_KARIAH,
    SEND_EMAIL_NOTIFICATION,
    CREATE_NEW_PASSWORD,
    FirebaseFCM,
    validatePagination,
    validateSearchTerm,
    sanitizeFilters,
    validateOrganizationId,
    createPaginationResponse,
    createOrganizationCacheKey,
    isValidEmail,
    isStrongPassword,
    sanitize
}