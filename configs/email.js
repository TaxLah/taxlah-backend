const OnboardingEmail = (account_fullname) => {
    return (`
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Welcome to TaxLah</title>
        <style>
            body {
                margin: 0;
                padding: 0;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
                background-color: #f4f4f4;
                line-height: 1.6;
            }
            
            .email-container {
                max-width: 600px;
                margin: 0 auto;
                background-color: #ffffff;
            }
            
            .header {
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                padding: 40px 20px;
                text-align: center;
            }
            
            .logo {
                font-size: 32px;
                font-weight: bold;
                color: #ffffff;
                margin: 0;
                letter-spacing: 1px;
            }
            
            .tagline {
                color: #ffffff;
                font-size: 14px;
                margin: 10px 0 0 0;
                opacity: 0.9;
            }
            
            .content {
                padding: 40px 30px;
            }
            
            .welcome-text {
                font-size: 24px;
                color: #333333;
                margin: 0 0 20px 0;
                font-weight: 600;
            }
            
            .intro-text {
                color: #666666;
                font-size: 16px;
                margin: 0 0 30px 0;
            }
            
            .cta-button {
                display: inline-block;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: #ffffff;
                text-decoration: none;
                padding: 16px 40px;
                border-radius: 8px;
                font-weight: 600;
                font-size: 16px;
                margin: 10px 0 30px 0;
                transition: transform 0.2s;
            }
            
            .cta-button:hover {
                transform: translateY(-2px);
            }
            
            .features {
                margin: 30px 0;
            }
            
            .feature-item {
                display: flex;
                margin: 20px 0;
                align-items: flex-start;
            }
            
            .feature-icon {
                width: 48px;
                height: 48px;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                border-radius: 12px;
                display: flex;
                align-items: center;
                justify-content: center;
                color: #ffffff;
                font-size: 24px;
                margin-right: 20px;
                flex-shrink: 0;
            }
            
            .feature-content h3 {
                margin: 0 0 8px 0;
                color: #333333;
                font-size: 18px;
                font-weight: 600;
            }
            
            .feature-content p {
                margin: 0;
                color: #666666;
                font-size: 14px;
            }
            
            .divider {
                height: 1px;
                background-color: #e0e0e0;
                margin: 30px 0;
            }
            
            .next-steps {
                background-color: #f8f9fa;
                padding: 25px;
                border-radius: 12px;
                margin: 30px 0;
            }
            
            .next-steps h3 {
                margin: 0 0 20px 0;
                color: #333333;
                font-size: 20px;
                font-weight: 600;
            }
            
            .step {
                display: flex;
                margin: 15px 0;
                align-items: flex-start;
            }
            
            .step-number {
                width: 32px;
                height: 32px;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                border-radius: 50%;
                color: #ffffff;
                display: flex;
                align-items: center;
                justify-content: center;
                font-weight: bold;
                margin-right: 15px;
                flex-shrink: 0;
            }
            
            .step-text {
                color: #555555;
                font-size: 14px;
                padding-top: 5px;
            }
            
            .help-section {
                background-color: #fff9e6;
                border-left: 4px solid #ffd700;
                padding: 20px;
                border-radius: 8px;
                margin: 30px 0;
            }
            
            .help-section h4 {
                margin: 0 0 10px 0;
                color: #333333;
                font-size: 16px;
            }
            
            .help-section p {
                margin: 0;
                color: #666666;
                font-size: 14px;
            }
            
            .help-section a {
                color: #667eea;
                text-decoration: none;
                font-weight: 600;
            }
            
            .footer {
                background-color: #f8f9fa;
                padding: 30px;
                text-align: center;
            }
            
            .social-links {
                margin: 20px 0;
            }
            
            .social-links a {
                display: inline-block;
                margin: 0 10px;
                color: #667eea;
                text-decoration: none;
                font-size: 14px;
            }
            
            .footer-text {
                color: #999999;
                font-size: 12px;
                line-height: 1.5;
                margin: 15px 0;
            }
            
            .footer-links {
                margin: 15px 0;
            }
            
            .footer-links a {
                color: #667eea;
                text-decoration: none;
                font-size: 12px;
                margin: 0 10px;
            }
            
            @media only screen and (max-width: 600px) {
                .content {
                    padding: 30px 20px;
                }
                
                .welcome-text {
                    font-size: 22px;
                }
                
                .intro-text {
                    font-size: 15px;
                }
                
                .feature-item {
                    flex-direction: column;
                }
                
                .feature-icon {
                    margin-bottom: 15px;
                }
                
                .cta-button {
                    display: block;
                    text-align: center;
                }
                
                .next-steps {
                    padding: 20px;
                }
                
                .footer {
                    padding: 25px 20px;
                }
            }
        </style>
    </head>
    <body>
        <div class="email-container">
            <!-- Header -->
            <div class="header">
                <h1 class="logo">TaxLah</h1>
                <p class="tagline">Your Smart Tax Filing Companion</p>
            </div>
            
            <!-- Main Content -->
            <div class="content">
                <h2 class="welcome-text">Welcome to TaxLah! ${account_fullname} 🎉</h2>
                <p class="intro-text">
                    Hi there! We're thrilled to have you on board. Your account has been successfully created, and you're now ready to simplify your tax filing journey with TaxLah.
                </p>
                
                <center>
                    <a href="https://taxlah.com/login" class="cta-button">Get Started Now</a>
                </center>
                
                <!-- Features -->
                <div class="features">
                    <div class="feature-item">
                        <div class="feature-icon">📊</div>
                        <div class="feature-content">
                            <h3>Easy Tax Filing</h3>
                            <p>File your taxes effortlessly with our user-friendly interface designed for Malaysian taxpayers.</p>
                        </div>
                    </div>
                    
                    <div class="feature-item">
                        <div class="feature-icon">💰</div>
                        <div class="feature-content">
                            <h3>Maximize Your Reliefs</h3>
                            <p>Discover all the tax reliefs you're eligible for and save more on your taxes.</p>
                        </div>
                    </div>
                    
                    <div class="feature-item">
                        <div class="feature-icon">🔒</div>
                        <div class="feature-content">
                            <h3>Secure & Compliant</h3>
                            <p>Your data is protected with bank-level encryption and fully compliant with LHDN requirements.</p>
                        </div>
                    </div>
                </div>
                
                <div class="divider"></div>
                
                <!-- Next Steps -->
                <div class="next-steps">
                    <h3>Get Started in 3 Simple Steps</h3>
                    
                    <div class="step">
                        <div class="step-number">1</div>
                        <div class="step-text">
                            <strong>Complete Your Profile</strong> - Add your personal details and link your LHDN account for seamless integration.
                        </div>
                    </div>
                    
                    <div class="step">
                        <div class="step-number">2</div>
                        <div class="step-text">
                            <strong>Upload Your Documents</strong> - Easily upload your EA forms, receipts, and other tax documents.
                        </div>
                    </div>
                    
                    <div class="step">
                        <div class="step-number">3</div>
                        <div class="step-text">
                            <strong>File Your Taxes</strong> - Review your tax summary and submit your return with just a few clicks.
                        </div>
                    </div>
                </div>
                
                <!-- Help Section -->
                <div class="help-section">
                    <h4>Need Help Getting Started?</h4>
                    <p>
                        Our support team is here to help! Visit our <a href="https://taxlah.com/help">Help Center</a> or reach out to us at <a href="mailto:support@taxlah.com">support@taxlah.com</a>.
                    </p>
                </div>
                
                <p class="intro-text" style="margin-top: 30px;">
                    Thank you for choosing TaxLah. We're committed to making tax filing stress-free for all Malaysians!
                </p>
                
                <p style="color: #666666; font-size: 14px; margin-top: 20px;">
                    Best regards,<br>
                    <strong>The TaxLah Team</strong>
                </p>
            </div>
            
            <!-- Footer -->
            <div class="footer">
                <div class="social-links">
                    <a href="https://facebook.com/taxlah">Facebook</a> |
                    <a href="https://twitter.com/taxlah">Twitter</a> |
                    <a href="https://instagram.com/taxlah">Instagram</a>
                </div>
                
                <p class="footer-text">
                    You're receiving this email because you signed up for TaxLah.<br>
                    © 2025 TaxLah. All rights reserved.
                </p>
                
                <div class="footer-links">
                    <a href="https://taxlah.com/privacy">Privacy Policy</a> |
                    <a href="https://taxlah.com/terms">Terms of Service</a> |
                    <a href="https://taxlah.com/unsubscribe">Unsubscribe</a>
                </div>
            </div>
        </div>
    </body>
    </html>    
    `)
}

module.exports = {
    OnboardingEmail
}