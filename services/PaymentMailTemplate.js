/**
 * Payment Receipt Email Template Generator
 * For TaxLah Application
 */

/**
 * Format amount to Malaysian Ringgit format
 */
function formatAmount(amount) {
	return `RM ${parseFloat(amount).toFixed(2)}`;
}

/**
 * Format date time to Malaysian format
 */
function formatDateTime(dateTime) {
	const date = new Date(dateTime);
	const options = {
		day: "2-digit",
		month: "short",
		year: "numeric",
		hour: "2-digit",
		minute: "2-digit",
		hour12: true,
	};
	return date.toLocaleString("en-MY", options).replace(",", "");
}

/**
 * Get status badge color and icon
 */
function getStatusBadge(status) {
	const statusMap = {
		Paid: { color: "#10b981", icon: "✓", text: "PAID" },
		Pending: { color: "#f59e0b", icon: "⏳", text: "PENDING" },
		Failed: { color: "#ef4444", icon: "✗", text: "FAILED" },
		Refunded: { color: "#6b7280", icon: "↩", text: "REFUNDED" },
	};
	return statusMap[status] || statusMap["Paid"];
}

/**
 * Generate Payment Receipt Email HTML
 */
function generatePaymentReceiptEmail(params) {
	const {
		amount,
		status = "Paid",
		orderId,
		paymentDateTime,
		paymentDescription,
		paymentMethod,
		emailAddress,
		customerName = "Valued Customer", // Optional
		companyName = "TaxLah", // Optional
		supportEmail = "support@taxlah.com", // Optional
		supportWhatsApp = "+60 12-345 6789", // Optional
		websiteUrl = "https://taxlah.com", // Optional
	} = params;

	const statusBadge       = getStatusBadge(status);
	const formattedAmount   = formatAmount(amount);
	const formattedDateTime = formatDateTime(paymentDateTime);

	const htmlTemplate = `<!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Payment Receipt - ${companyName}</title>
        <style>
            body {
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                line-height: 1.6;
                color: #333;
                background-color: #f4f4f4;
                margin: 0;
                padding: 20px;
            }
            .email-container {
                max-width: 600px;
                margin: 0 auto;
                background: white;
                border-radius: 12px;
                overflow: hidden;
                box-shadow: 0 4px 6px rgba(0,0,0,0.1);
            }
            .header {
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                padding: 40px 30px;
                text-align: center;
            }
            .header h1 {
                margin: 0;
                font-size: 28px;
                font-weight: 600;
            }
            .header p {
                margin: 10px 0 0 0;
                font-size: 16px;
                opacity: 0.95;
            }
            .status-badge {
                display: inline-block;
                background: ${statusBadge.color};
                color: white;
                padding: 8px 20px;
                border-radius: 20px;
                font-weight: 600;
                font-size: 14px;
                margin-top: 15px;
                text-transform: uppercase;
                letter-spacing: 0.5px;
            }
            .content {
                padding: 40px 30px;
            }
            .greeting {
                font-size: 16px;
                margin-bottom: 20px;
                color: #555;
            }
            .amount-section {
                background: linear-gradient(135deg, #f6f8fb 0%, #e9ecef 100%);
                padding: 25px;
                border-radius: 10px;
                text-align: center;
                margin: 25px 0;
                border: 2px solid #e0e0e0;
            }
            .amount-label {
                font-size: 14px;
                color: #666;
                text-transform: uppercase;
                letter-spacing: 1px;
                margin-bottom: 10px;
            }
            .amount-value {
                font-size: 42px;
                font-weight: 700;
                color: #667eea;
                margin: 5px 0;
            }
            .details-box {
                background: #f9fafb;
                border: 1px solid #e5e7eb;
                border-radius: 10px;
                padding: 25px;
                margin: 25px 0;
            }
            .details-box h3 {
                margin: 0 0 20px 0;
                color: #374151;
                font-size: 18px;
                font-weight: 600;
                border-bottom: 2px solid #667eea;
                padding-bottom: 10px;
            }
            .detail-row {
                display: flex;
                justify-content: space-between;
                padding: 12px 0;
                border-bottom: 1px solid #e5e7eb;
            }
            .detail-row:last-child {
                border-bottom: none;
            }
            .detail-label {
                font-weight: 600;
                color: #6b7280;
                font-size: 14px;
            }
            .detail-value {
                color: #111827;
                font-weight: 500;
                text-align: right;
                font-size: 14px;
            }
            .description-box {
                background: #fffbeb;
                border-left: 4px solid #f59e0b;
                padding: 15px 20px;
                margin: 20px 0;
                border-radius: 5px;
            }
            .description-box strong {
                color: #92400e;
                display: block;
                margin-bottom: 5px;
            }
            .description-box p {
                margin: 0;
                color: #78350f;
            }
            .info-section {
                background: #eff6ff;
                border-left: 4px solid #3b82f6;
                padding: 20px;
                margin: 25px 0;
                border-radius: 5px;
            }
            .info-section h4 {
                margin: 0 0 10px 0;
                color: #1e40af;
                font-size: 16px;
            }
            .info-section p {
                margin: 5px 0;
                color: #1e3a8a;
                font-size: 14px;
                line-height: 1.5;
            }
            .button-container {
                text-align: center;
                margin: 30px 0;
            }
            .cta-button {
                display: inline-block;
                background: #667eea;
                color: white;
                padding: 14px 35px;
                text-decoration: none;
                border-radius: 8px;
                font-weight: 600;
                font-size: 15px;
            }
            .divider {
                height: 1px;
                background: linear-gradient(to right, transparent, #e5e7eb, transparent);
                margin: 30px 0;
            }
            .footer {
                background: #f9fafb;
                padding: 25px 30px;
                text-align: center;
                color: #6b7280;
                font-size: 13px;
                border-top: 1px solid #e5e7eb;
            }
            .footer p {
                margin: 8px 0;
            }
            .footer a {
                color: #667eea;
                text-decoration: none;
            }
            .support-box {
                background: white;
                border: 1px solid #e5e7eb;
                border-radius: 8px;
                padding: 15px;
                margin-top: 15px;
            }
            .support-box strong {
                color: #374151;
            }
            @media only screen and (max-width: 600px) {
                body { padding: 10px; }
                .header { padding: 30px 20px; }
                .header h1 { font-size: 24px; }
                .content { padding: 25px 20px; }
                .amount-value { font-size: 36px; }
                .detail-row { flex-direction: column; gap: 5px; }
                .detail-value { text-align: left; }
            }
        </style>
    </head>
    <body>
        <div class="email-container">
            <!-- Header -->
            <div class="header">
                <h1>💳 Payment ${status === "Paid" ? "Successful" : status}</h1>
                <p>Your transaction has been ${status.toLowerCase()}</p>
                <div class="status-badge">${statusBadge.icon} ${
            statusBadge.text
        }</div>
            </div>

            <!-- Content -->
            <div class="content">
                <div class="greeting">
                    <p>Dear ${customerName},</p>
                    <p>${
                        status === "Paid"
                            ? "Thank you for your payment! This email confirms that we have successfully received your payment."
                            : "This email contains the details of your transaction."
                    }</p>
                </div>

                <!-- Amount Section -->
                <div class="amount-section">
                    <div class="amount-label">Amount ${
                        status === "Paid" ? "Paid" : ""
                    }</div>
                    <div class="amount-value">${formattedAmount}</div>
                </div>

                <!-- Payment Details -->
                <div class="details-box">
                    <h3>📋 Payment Details</h3>
                    
                    <div class="detail-row">
                        <span class="detail-label">Order ID</span>
                        <span class="detail-value">${orderId}</span>
                    </div>
                    
                    <div class="detail-row">
                        <span class="detail-label">Payment Date & Time</span>
                        <span class="detail-value">${formattedDateTime}</span>
                    </div>
                    
                    <div class="detail-row">
                        <span class="detail-label">Payment Method</span>
                        <span class="detail-value">${paymentMethod}</span>
                    </div>
                    
                    <div class="detail-row">
                        <span class="detail-label">Email Address</span>
                        <span class="detail-value">${emailAddress}</span>
                    </div>
                    
                    <div class="detail-row">
                        <span class="detail-label">Transaction Status</span>
                        <span class="detail-value" style="color: ${
                            statusBadge.color
                        }; font-weight: 700;">${statusBadge.icon} ${status}</span>
                    </div>
                </div>

                <!-- Description -->
                <div class="description-box">
                    <strong>Payment Description:</strong>
                    <p>${paymentDescription}</p>
                </div>

                ${
                    status === "Paid" ? `
                    <!-- Important Information -->
                    <div class="info-section">
                        <h4>📌 What's Next?</h4>
                        <p>• Your payment has been recorded in our system</p>
                        <p>• A detailed receipt has been sent to your email</p>
                        <p>• You can access your premium features immediately</p>
                        <p>• Keep this email for your records</p>
                    </div>
                    ` : ""
                }

                <div class="divider"></div>

                <!-- Call to Action -->
                <!-- <div class="button-container">
                    <a href="${websiteUrl}/dashboard" class="cta-button">View Transaction History →</a>
                </div>
                -->

                <div class="divider"></div>

                <!-- Additional Info -->
                <p style="text-align: center; color: #6b7280; font-size: 14px; margin-top: 25px;">
                    This is an automated email. Please do not reply to this message.<br>
                    If you have any questions, please contact our support team.
                </p>
            </div>

            <!-- Footer -->
            <div class="footer">
                <p><strong>Need Help?</strong></p>
                <div class="support-box">
                    <p><strong>Email:</strong> <a href="mailto:${supportEmail}">${supportEmail}</a></p>
                    <p><strong>WhatsApp:</strong> ${supportWhatsApp}</p>
                    <p><strong>Website:</strong> <a href="${websiteUrl}">${websiteUrl.replace(
            "https://",
            "www."
        )}</a></p>
                </div>
                
                <p style="margin-top: 20px; font-size: 12px;">
                    © 2025 ${companyName}. All rights reserved.<br>
                    Making Malaysian tax relief claims simple, one receipt at a time.
                </p>
                
                <p style="margin-top: 15px; font-size: 11px; color: #9ca3af;">
                    You're receiving this email because you made a payment on ${companyName}.<br>
                    <a href="${websiteUrl}/unsubscribe">Unsubscribe</a> from marketing emails
                </p>
            </div>
        </div>
    </body>
    </html>
`;

	// Generate plain text version
	const textTemplate = `
    Payment ${status}

    Dear ${customerName},

    ${ status === "Paid"
		? "Thank you for your payment! This email confirms that we have successfully received your payment."
		: "This email contains the details of your transaction."
    }

    AMOUNT ${status === "Paid" ? "PAID" : ""}: ${formattedAmount}

    PAYMENT DETAILS:
    - Order ID: ${orderId}
    - Payment Date & Time: ${formattedDateTime}
    - Payment Method: ${paymentMethod}
    - Email Address: ${emailAddress}
    - Transaction Status: ${status}

    PAYMENT DESCRIPTION:
    ${paymentDescription}

    ${
        status === "Paid"
            ? `
    WHAT'S NEXT?
    • Your payment has been recorded in our system
    • A detailed receipt has been sent to your email
    • You can access your premium features immediately
    • Keep this email for your records
    `
            : ""
    }

    View your transaction history: ${websiteUrl}/dashboard

    NEED HELP?
    Email: ${supportEmail}
    WhatsApp: ${supportWhatsApp}
    Website: ${websiteUrl}

    This is an automated email. Please do not reply to this message.
    If you have any questions, please contact our support team.

    © ${new Date().getFullYear()} ${companyName}. All rights reserved.
    `.trim();

	return {
		html: htmlTemplate,
		text: textTemplate,
	};
}

module.exports = {
	generatePaymentReceiptEmail,
	formatAmount,
	formatDateTime,
};
