const OnboardingEmail = (account_fullname, account_email) => {
	return {
        subject: "🎉 Welcome to TaxLah! Your Smart Tax Relief Companion",
		text: `
        Dear ${account_fullname || "User"},\n\n
        Welcome to TaxLah - your personal tax relief assistant that makes claiming Malaysian tax deductions simple and stress-free!\n\n
        We're excited to help you maximize your tax savings this year. With TaxLah, you'll never miss out on eligible tax reliefs again.\n\n
        What TaxLah Can Do For You:\n
        - Track all your tax-deductible expenses throughout the year\n
        - Get personalized reminders for claimable expenses like lifestyle purchases, medical bills, education fees, and more\n
        - Calculate your potential tax savings in real-time\n
        - Generate reports ready for LHDN e-filing\n
        - Stay updated on the latest tax relief changes in Malaysia\n\n
        Did you know you could claim up to RM2,500 for lifestyle expenses (smartphones, laptops, books, internet bills), RM10,000 for medical expenses, and many more reliefs? Let TaxLah help you track them all!\n\n
        Getting Started:\n
        1. Complete your profile with your basic information\n
        2. Start logging your expenses or upload receipts\n
        3. Watch your potential tax savings grow\n
        4. Export your report when it's time to file\n\n
        Tax season doesn't have to be stressful. Let TaxLah be your trusted companion in maximizing your tax relief claims!\n\n
        Have questions? Our support team is here to help.\n\n
        Best regards,\n
        The TaxLah Team\n\n
        P.S. The tax filing deadline in Malaysia is April 30th - start tracking your expenses now to maximize your savings!
        `,
		html: `
        <!DOCTYPE html><html><head><style>body{font-family:Arial,sans-serif;line-height:1.6;color:#333;max-width:600px;margin:0 auto;padding:20px}.header{background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);color:white;padding:30px 20px;text-align:center;border-radius:10px 10px 0 0}.header h1{margin:0;font-size:28px}.content{background:#f9f9f9;padding:30px;border-radius:0 0 10px 10px}.welcome-text{font-size:16px;margin-bottom:20px}.feature-box{background:white;padding:20px;margin:20px 0;border-radius:8px;border-left:4px solid #667eea}.feature-box h3{color:#667eea;margin-top:0}.features-list{list-style:none;padding-left:0}.features-list li{padding:8px 0;padding-left:25px;position:relative}.features-list li:before{content:'✓';position:absolute;left:0;color:#667eea;font-weight:bold}.highlight-box{background:#fff3cd;border-left:4px solid #ffc107;padding:15px;margin:20px 0;border-radius:5px}.steps{background:white;padding:20px;margin:20px 0;border-radius:8px}.steps ol{padding-left:20px}.steps li{padding:5px 0}.cta-button{display:inline-block;background:#667eea;color:white;padding:12px 30px;text-decoration:none;border-radius:5px;margin:20px 0;font-weight:bold}.footer{text-align:center;padding:20px;color:#666;font-size:14px}.ps-note{background:#e3f2fd;padding:15px;border-radius:5px;margin-top:20px;font-style:italic;border-left:4px solid #2196f3}</style></head><body><div class='header'><h1>🎯 Welcome to TaxLah!</h1><p style='margin:10px 0 0 0;font-size:18px; color: white;'>Your Smart Tax Relief Companion</p></div><div class='content'><div class='welcome-text'><p>Dear Valued User,</p><p>Welcome to <strong>TaxLah</strong> - your personal tax relief assistant that makes claiming Malaysian tax deductions simple and stress-free!</p><p>We're excited to help you <strong>maximize your tax savings</strong> this year. With TaxLah, you'll never miss out on eligible tax reliefs again.</p></div><div class='feature-box'><h3>💡 What TaxLah Can Do For You:</h3><ul class='features-list'><li><strong>Track expenses automatically</strong> - Log all your tax-deductible expenses throughout the year</li><li><strong>Smart reminders</strong> - Get notified about claimable expenses like lifestyle purchases, medical bills, education fees</li><li><strong>Real-time calculations</strong> - See your potential tax savings grow instantly</li><li><strong>LHDN-ready reports</strong> - Generate reports ready for e-filing submission</li><li><strong>Stay updated</strong> - Never miss changes to Malaysian tax relief regulations</li></ul></div><div class='highlight-box'><strong>💰 Did You Know?</strong><br>You could claim up to:<br>• <strong>RM2,500</strong> for lifestyle expenses (smartphones, laptops, books, internet)<br>• <strong>RM10,000</strong> for medical expenses<br>• <strong>RM8,000</strong> for education fees<br>• <strong>RM1,000</strong> for domestic travel<br>And many more! Let TaxLah help you track them all.</div><div class='steps'><h3>🚀 Getting Started:</h3><ol><li><strong>Complete your profile</strong> with your basic information</li><li><strong>Start logging expenses</strong> or upload receipts instantly</li><li><strong>Watch your savings grow</strong> with real-time tax calculations</li><li><strong>Export your report</strong> when it's time to file with LHDN</li></ol></div><p style='text-align:center;font-size:18px;margin:30px 0'><strong>Tax season doesn't have to be stressful!</strong><br>Let TaxLah be your trusted companion in maximizing your claims.</p><div style='text-align:center'><a href='https://taxlah.com/app' class='cta-button'>Start Tracking Now →</a></div><div class='ps-note'><strong>📅 Important Reminder:</strong><br>The tax filing deadline in Malaysia is <strong>April 30th</strong>. Start tracking your expenses now to maximize your savings!</div><p style='margin-top:30px'>Have questions? Our support team is here to help at <a href='mailto:support@taxlah.com'>support@taxlah.com</a></p></div><div class='footer'><p><strong>Best regards,</strong><br>The TaxLah Team</p><p style='font-size:12px;color:#999;margin-top:20px'>Making Malaysian tax relief claims simple, one receipt at a time.</p></div></body></html>
        `,
	};
};

const ForgotPasswordEmail = (accountFullname, otp) => {
    return {
        subject: '🔐 Your TaxLah Password Reset OTP',
        text: `
        Dear ${accountFullname || 'User'},

        We received a request to reset your TaxLah account password.

        Your One-Time Password (OTP) is: ${otp}

        This OTP is valid for 10 minutes. Do not share it with anyone.

        If you did not request a password reset, please ignore this email. Your account remains secure.

        Best regards,
        The TaxLah Team
                `,
                html: `
        <!DOCTYPE html><html><head><style>body{font-family:Arial,sans-serif;line-height:1.6;color:#333;max-width:600px;margin:0 auto;padding:20px}.header{background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);color:white;padding:30px 20px;text-align:center;border-radius:10px 10px 0 0}.header h1{margin:0;font-size:26px}.content{background:#f9f9f9;padding:30px;border-radius:0 0 10px 10px}.otp-box{background:white;border:2px dashed #667eea;border-radius:10px;padding:25px;text-align:center;margin:25px 0}.otp-code{font-size:42px;font-weight:bold;letter-spacing:12px;color:#667eea;margin:10px 0}.warning-box{background:#fff3cd;border-left:4px solid #ffc107;padding:15px;margin:20px 0;border-radius:5px;font-size:14px}.footer{text-align:center;padding:20px;color:#666;font-size:13px}</style></head>
        <body>
        <div class='header'><h1>🔐 Password Reset Request</h1></div>
        <div class='content'>
        <p>Dear <strong>${accountFullname || 'User'}</strong>,</p>
        <p>We received a request to reset your <strong>TaxLah</strong> account password. Use the OTP below to proceed:</p>
        <div class='otp-box'>
        <p style='margin:0;color:#666;font-size:14px'>YOUR ONE-TIME PASSWORD</p>
        <div class='otp-code'>${otp}</div>
        <p style='margin:0;color:#888;font-size:13px'>Valid for <strong>10 minutes</strong></p>
        </div>
        <div class='warning-box'>
        ⚠️ <strong>Do not share this OTP</strong> with anyone. TaxLah staff will never ask for your OTP.
        </div>
        <p>If you did not request a password reset, you can safely ignore this email. Your account remains secure.</p>
        <p style='margin-top:30px'>Best regards,<br><strong>The TaxLah Team</strong></p>
        </div>
        <div class='footer'><p style='font-size:12px;color:#999'>Making Malaysian tax relief claims simple, one receipt at a time.</p></div>
        </body></html>
        `,
    };
};

const ApprovalCodeEmail = (email_account, otp) => {
    return {
        subject: '🔐 Your Account Approval Code',
        text: `
        Dear ${email_account || 'User'},

        We are sending your the account approval code.

        Your One-Time Password (OTP) is: ${otp}

        This OTP is valid for 10 minutes. Do not share it with anyone.

        If this is not you, please ignore this email. Your account remains secure.

        Best regards,
        The TaxLah Team
                `,
                html: `
        <!DOCTYPE html><html><head><style>body{font-family:Arial,sans-serif;line-height:1.6;color:#333;max-width:600px;margin:0 auto;padding:20px}.header{background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);color:white;padding:30px 20px;text-align:center;border-radius:10px 10px 0 0}.header h1{margin:0;font-size:26px}.content{background:#f9f9f9;padding:30px;border-radius:0 0 10px 10px}.otp-box{background:white;border:2px dashed #667eea;border-radius:10px;padding:25px;text-align:center;margin:25px 0}.otp-code{font-size:42px;font-weight:bold;letter-spacing:12px;color:#667eea;margin:10px 0}.warning-box{background:#fff3cd;border-left:4px solid #ffc107;padding:15px;margin:20px 0;border-radius:5px;font-size:14px}.footer{text-align:center;padding:20px;color:#666;font-size:13px}</style></head>
        <body>
        <div class='header'><h1>🔐 OTP Approval Code</h1></div>
        <div class='content'>
        <p>Dear <strong>${email_account || 'User'}</strong>,</p>
        <p>We are sending you a <strong>Taxlah</strong> account approval code. Use the OTP below to proceed:</p>
        <div class='otp-box'>
        <p style='margin:0;color:#666;font-size:14px'>YOUR ONE-TIME PASSWORD</p>
        <div class='otp-code'>${otp}</div>
        <p style='margin:0;color:#888;font-size:13px'>Valid for <strong>10 minutes</strong></p>
        </div>
        <div class='warning-box'>
        ⚠️ <strong>Do not share this OTP</strong> with anyone. Taxlah staff will never ask for your OTP.
        </div>
        <p>If you did not request this, you can safely ignore this email. Your account remains secure.</p>
        <p style='margin-top:30px'>Best regards,<br><strong>The Taxlah Team</strong></p>
        </div>
        <div class='footer'><p style='font-size:12px;color:#999'>Making Malaysian tax relief claims simple, one receipt at a time.</p></div>
        </body></html>
        `,
    };
};

module.exports = {
    OnboardingEmail,
    ForgotPasswordEmail,
    ApprovalCodeEmail
};
