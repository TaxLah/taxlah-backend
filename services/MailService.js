const { google } = require("googleapis");
const ConfigService = require("./ConfigService");

/**
 * Email Utility using Gmail API (googleapis)
 * Sends emails via Gmail REST API over HTTPS (port 443) — no SMTP ports required.
 */

class MailService {
    constructor() {
        // Nothing is resolved here on purpose. The client used to be built in the
        // constructor from process.env, which meant credentials were frozen at require()
        // time and a rotation in the admin portal needed a restart to take effect.
        this._client = null;
        this._fingerprint = null;
    }

    /**
     * Resolves Gmail credentials, preferring the database and falling back to the
     * environment for anything not yet seeded.
     *
     * The previous hardcoded fallbacks (a real client secret and refresh token committed
     * in this file) have been removed — they are seeded into system_config instead.
     */
    async getConfig() {
        const c = await ConfigService.getGroup('gmail');

        return {
            user: c.GMAIL_USER || process.env.GMAIL_USER || 'admin@taxlah.com',
            clientId: c.GMAIL_CLIENT_ID || process.env.GMAIL_CLIENT_ID || null,
            clientSecret: c.GMAIL_CLIENT_SECRET || process.env.GMAIL_CLIENT_SECRET || null,
            refreshToken: c.GMAIL_REFRESH_TOKEN || process.env.GMAIL_REFRESH_TOKEN || null,
        };
    }

    /**
     * Returns a Gmail client for the current credentials.
     *
     * Cached, but keyed on a fingerprint of the values — so when an admin rotates the
     * refresh token the next send rebuilds the client automatically rather than reusing a
     * client bound to the old one.
     */
    async getClient() {
        const cfg = await this.getConfig();

        if (!cfg.clientId || !cfg.clientSecret || !cfg.refreshToken) {
            return { client: null, cfg, error: 'Gmail credentials are not configured' };
        }

        const fingerprint = `${cfg.clientId}|${cfg.clientSecret}|${cfg.refreshToken}`;
        if (this._client && this._fingerprint === fingerprint) {
            return { client: this._client, cfg };
        }

        try {
            const oauth2Client = new google.auth.OAuth2(cfg.clientId, cfg.clientSecret);
            oauth2Client.setCredentials({ refresh_token: cfg.refreshToken });

            this._client = google.gmail({ version: 'v1', auth: oauth2Client });
            this._fingerprint = fingerprint;

            console.log('✓ Gmail client built for', cfg.user);
            return { client: this._client, cfg };
        } catch (error) {
            console.error('Failed to build Gmail client:', error.message);
            return { client: null, cfg, error: error.message };
        }
    }

    /**
     * RFC 2047 encode a header value containing non-ASCII characters (e.g. emoji)
     */
    _encodeHeader(value) {
        if (/[^\x00-\x7F]/.test(value)) {
            return `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`;
        }
        return value;
    }

    /**
     * Build a base64url-encoded RFC 2822 raw email message
     */
    _buildRawMessage({ from, to, subject, text, html }) {
        const boundary = `boundary_taxlah_${Date.now()}`;
        const lines = [];

        lines.push(`From: ${from}`);
        lines.push(`To: ${to}`);
        lines.push(`Subject: ${this._encodeHeader(subject)}`);
        lines.push('MIME-Version: 1.0');

        if (html) {
            lines.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);
            lines.push('');

            if (text) {
                lines.push(`--${boundary}`);
                lines.push('Content-Type: text/plain; charset="UTF-8"');
                lines.push('');
                lines.push(text);
            }

            lines.push(`--${boundary}`);
            lines.push('Content-Type: text/html; charset="UTF-8"');
            lines.push('');
            lines.push(html);
            lines.push(`--${boundary}--`);
        } else {
            lines.push('Content-Type: text/plain; charset="UTF-8"');
            lines.push('');
            lines.push(text || '');
        }

        return Buffer.from(lines.join('\r\n'))
            .toString('base64')
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');
    }

    /**
     * Send email via Gmail API
     * @param {object} options - Email options
     * @param {string} options.to - Recipient email address
     * @param {string} options.subject - Email subject
     * @param {string} options.text - Plain text body (optional)
     * @param {string} options.html - HTML body (optional)
     * @param {string} options.from - Sender email (optional, defaults to GMAIL_USER)
     * @returns {object} - Result with success status and info
     */
    async sendMail({ to, subject, text = '', html = '', from = null }) {
        const { client: gmail, cfg, error: clientError } = await this.getClient();

        if (!gmail) {
            return {
                success: false,
                message: clientError || 'Mail service not initialized. Check Gmail API configuration.',
                error: 'CLIENT_NOT_INITIALIZED'
            };
        }

        if (!to) {
            return { success: false, message: 'Recipient email address (to) is required', error: 'MISSING_RECIPIENT' };
        }
        if (!subject) {
            return { success: false, message: 'Email subject is required', error: 'MISSING_SUBJECT' };
        }
        if (!text && !html) {
            return { success: false, message: 'Email body (text or html) is required', error: 'MISSING_BODY' };
        }

        const sender = from || `"TaxLah" <${cfg.user}>`;

        try {
            const raw = this._buildRawMessage({ from: sender, to, subject, text, html });
            const response = await gmail.users.messages.send({
                userId: 'me',
                requestBody: { raw }
            });

            console.log('Email sent via Gmail API:', response.data);
            return {
                success: true,
                message: 'Email sent successfully',
                data: {
                    messageId: response.data.id,
                    threadId: response.data.threadId
                }
            };
        } catch (error) {
            console.error('Error sending email via Gmail API:', error);
            return {
                success: false,
                message: 'Failed to send email',
                error: error.message
            };
        }
    }

    /**
     * Verify Gmail API connection by fetching the authenticated user's profile
     * @returns {object} - Result with connection status
     */
    async verifyConnection() {
        const { client: gmail, error: clientError } = await this.getClient();

        if (!gmail) {
            return { success: false, message: clientError || 'Mail service not initialized' };
        }

        try {
            const profile = await gmail.users.getProfile({ userId: 'me' });
            return {
                success: true,
                message: `Gmail API connection verified. Authenticated as: ${profile.data.emailAddress}`
            };
        } catch (error) {
            console.error('Gmail API verification failed:', error);
            return {
                success: false,
                message: 'Gmail API connection failed',
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