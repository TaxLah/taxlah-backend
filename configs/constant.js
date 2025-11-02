const toyyibpay = {
	toyyibpay_base_url: 'https://toyyibpay.com',
	toyyibpay_create_bill_url: 'https://toyyibpay.com/api/createBill',
	toyyibpay_secret_key: '1ihghw3l-0geu-4ot2-147h-vc2j2dcvpjn7',
	toyyibpay_category_code: '31r77d05',
}

const devtoyyib = {
	toyyibpay_base_url: 'https://dev.toyyibpay.com',
	toyyibpay_create_bill_url: 'https://dev.toyyibpay.com/api/createBill',
	toyyibpay_secret_key: 'en7ngdjm-0log-8h7a-f0rk-wao3za9218e2',
	toyyibpay_category_code: '9hmrsg44'
}

const base_url 			= `https://infaqyide.com.my/api/`
const base_admin_url 	= `https://dev.infaqyide.com.my/admin/` 

const test_template = {
	title: "InfaqYIDE Production Mode"
}

module.exports = {
    toyyibpay,
	devtoyyib,
	base_url,
	base_admin_url
}