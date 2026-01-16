const nodemailer = require('nodemailer');

/**
 * Email Utility using Nodemailer
 * Handles sending emails via SMTP
 */

class MailService {
    constructor() {
        this.transporter = null;
        this.initializeTransporter();
    }

    /**
     * Initialize nodemailer transporter with SMTP config
     */
    initializeTransporter() {
        try {
            this.transporter = nodemailer.createTransport({
                service: 'gmail',
                auth: {
                    type: 'OAuth2',
                    user: 'admin@taxlah.com',
                    clientId: '883174192008-bc1ifscgtqskro7r571b8ju2q3gb6dhn.apps.googleusercontent.com',
                    clientSecret: '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',
                    refreshToken: '1//04i9FHDKtT_k3CgYIARAAGAQSNwF-L9IrGhvn9bJ0AXFGWqzj931DvOkPlUGcvTAON4nI03ZIZPYUMIDKguuwzfXQCcIRj6GISFs'
                }
            })

            console.log('✓ Mail service initialized successfully');
        } catch (error) {
            console.error('Failed to initialize mail service:', error);
        }
    }

    /**
     * Send email
     * @param {object} options - Email options
     * @param {string} options.to - Recipient email address
     * @param {string} options.subject - Email subject
     * @param {string} options.text - Plain text body (optional)
     * @param {string} options.html - HTML body (optional)
     * @param {string} options.from - Sender email (optional, defaults to SMTP_USER)
     * @param {array} options.attachments - Attachments (optional)
     * @returns {object} - Result with success status and info
     */
    async sendMail({ to, subject, text = '', html = '', from = null, attachments = [] }) {
        if (!this.transporter) {
            return {
                success: false,
                message: 'Mail service not initialized. Check SMTP configuration.',
                error: 'TRANSPORTER_NOT_INITIALIZED'
            };
        }

        // Validation
        if (!to) {
            return {
                success: false,
                message: 'Recipient email address (to) is required',
                error: 'MISSING_RECIPIENT'
            };
        }

        if (!subject) {
            return {
                success: false,
                message: 'Email subject is required',
                error: 'MISSING_SUBJECT'
            };
        }

        if (!text && !html) {
            return {
                success: false,
                message: 'Email body (text or html) is required',
                error: 'MISSING_BODY'
            };
        }

        const mailOptions = {
            from: from || `"TaxLah" <${process.env.SMTP_USER}>`,
            to,
            subject,
            text,
            html,
            attachments
        };

        try {
            const info = await this.transporter.sendMail(mailOptions);
            console.log('Email sent:', info);
            
            return {
                success: true,
                message: 'Email sent successfully',
                data: {
                    messageId: info.messageId,
                    accepted: info.accepted,
                    rejected: info.rejected,
                    response: info.response
                }
            };
        } catch (error) {
            console.error('Error sending email:', error);
            return {
                success: false,
                message: 'Failed to send email',
                error: error.message
            };
        }
    }

    /**
     * Verify SMTP connection
     * @returns {object} - Result with connection status
     */
    async verifyConnection() {
        if (!this.transporter) {
            return {
                success: false,
                message: 'Mail service not initialized'
            };
        }

        try {
            await this.transporter.verify();
            return {
                success: true,
                message: 'SMTP connection verified successfully'
            };
        } catch (error) {
            console.error('SMTP verification failed:', error);
            return {
                success: false,
                message: 'SMTP connection failed',
                error: error.message
            };
        }
    }

    /**
     * Send welcome email template
     */
    async sendWelcomeEmail(to, userName) {
        const html = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #2E7D32;">Selamat Datang ke EzQuran!</h2>
                <p>Assalamualaikum ${userName},</p>
                <p>Terima kasih kerana mendaftar dengan EzQuran. Kami gembira untuk membantu anda dalam perjalanan pembelajaran Al-Quran.</p>
                <p>Sila log masuk untuk mula meneroka pakej pengajian kami.</p>
                <br>
                <p>Salam hormat,<br>Pasukan EzQuran</p>
            </div>
        `;

        return await this.sendMail({
            to,
            subject: 'Selamat Datang ke EzQuran',
            html
        });
    }

    /**
     * Send payment receipt email
     */
    async sendPaymentReceiptEmail(to, receiptData) {
        const html = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #2E7D32;">Resit Pembayaran</h2>
                <p>Assalamualaikum,</p>
                <p>Pembayaran anda telah berjaya diterima.</p>
                <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
                    <tr style="background: #f5f5f5;">
                        <td style="padding: 10px; border: 1px solid #ddd;"><strong>No. Invois</strong></td>
                        <td style="padding: 10px; border: 1px solid #ddd;">${receiptData.invoice_no}</td>
                    </tr>
                    <tr>
                        <td style="padding: 10px; border: 1px solid #ddd;"><strong>Jumlah</strong></td>
                        <td style="padding: 10px; border: 1px solid #ddd;">RM ${receiptData.amount}</td>
                    </tr>
                    <tr style="background: #f5f5f5;">
                        <td style="padding: 10px; border: 1px solid #ddd;"><strong>Tarikh</strong></td>
                        <td style="padding: 10px; border: 1px solid #ddd;">${receiptData.date}</td>
                    </tr>
                </table>
                <p>Terima kasih atas pembayaran anda.</p>
                <br>
                <p>Salam hormat,<br>Pasukan EzQuran</p>
            </div>
        `;

        return await this.sendMail({
            to,
            subject: `Resit Pembayaran - ${receiptData.invoice_no}`,
            html
        });
    }

    /**
     * Send subscription renewal confirmation email
     */
    async sendSubscriptionRenewalEmail(to, renewalData) {
        const endDate = new Date(renewalData.new_end_date);
        const formattedDate = endDate.toLocaleDateString('ms-MY', { 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
        });

        const html = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #2E7D32;">🎉 Langganan Diperbaharui</h2>
                <p>Assalamualaikum ${renewalData.account_name || ''},</p>
                <p>Syukur! Langganan anda telah berjaya diperbaharui.</p>
                <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
                    <tr style="background: #f5f5f5;">
                        <td style="padding: 10px; border: 1px solid #ddd;"><strong>Pakej</strong></td>
                        <td style="padding: 10px; border: 1px solid #ddd;">${renewalData.package_name || 'N/A'}</td>
                    </tr>
                    <tr>
                        <td style="padding: 10px; border: 1px solid #ddd;"><strong>Jenis Komitmen</strong></td>
                        <td style="padding: 10px; border: 1px solid #ddd;">${renewalData.commitment_type || 'N/A'}</td>
                    </tr>
                    <tr style="background: #f5f5f5;">
                        <td style="padding: 10px; border: 1px solid #ddd;"><strong>Tamat Tempoh Baharu</strong></td>
                        <td style="padding: 10px; border: 1px solid #ddd;"><strong>${formattedDate}</strong></td>
                    </tr>
                </table>
                <p>Akaun anda telah diaktifkan semula dan anda boleh terus menggunakan perkhidmatan kami.</p>
                <p>Terima kasih kerana mempercayai EzQuran!</p>
                <br>
                <p>Salam hormat,<br>Pasukan EzQuran</p>
            </div>
        `;

        return await this.sendMail({
            to,
            subject: '🎉 Langganan EzQuran Diperbaharui',
            html
        });
    }
}

// Create singleton instance
const mailService = new MailService();

module.exports = mailService;