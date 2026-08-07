/**
 * Transactional email templates.
 *
 * Brand colours are taken from the app icon: the cyan gradient #55DCEC → #32A8DD, with
 * #17739B as the deeper step used wherever text or a filled button needs contrast.
 *
 * Three rules drive the markup here, and all three are about email clients rather than
 * taste:
 *
 *  1. Tables and inline styles. Outlook renders through Word, which ignores <style> in
 *     <head> in many configurations along with flexbox and grid. The previous templates
 *     put every rule in a <head> block, so Outlook fell back to unstyled text.
 *
 *  2. A solid background-color always accompanies the gradient. Outlook drops
 *     background-image entirely; without the solid fallback the old purple header
 *     rendered white, leaving white header text invisible.
 *
 *  3. Dark ink on the brand header, not white. The icon cyan is light — white measures
 *     1.64:1 against the top stop and 2.70:1 against the bottom, both under the 4.5:1
 *     minimum. Slate-900 is 10.91:1 / 6.61:1 across the same range. This matches what
 *     the mobile app does with the same gradient.
 */

const BRAND = {
    gradientStart: '#55DCEC',
    gradientEnd: '#32A8DD',
    solid: '#44C2E5',   // flat fallback for clients with no gradient support
    deep: '#17739B',    // 5.30:1 on white — headings, OTP digits, buttons
    deeper: '#136288',
    tint: '#E8F7FB',
    ink: '#0F172A',     // on the gradient: 10.91:1 / 6.61:1
    inkSoft: '#1E293B',
    body: '#475569',
    muted: '#94A3B8',
    border: '#E2E8F0',
    surface: '#FFFFFF',
    page: '#F1F5F9',
};

/**
 * Wraps content in the shared shell: brand header, white body panel, footer.
 *
 * @param {object} opts
 * @param {string} opts.heading   Header line, shown on the gradient.
 * @param {string} opts.preheader Inbox preview text. Hidden in the body itself.
 * @param {string} opts.body      Inner HTML for the white panel.
 */
const layout = ({ heading, preheader, body }) => `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${heading}</title>
</head>
<body style="margin:0;padding:0;background-color:${BRAND.page};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">

<!-- Preview text: shown in the inbox list, never in the opened message. -->
<div style="display:none;font-size:1px;color:${BRAND.page};line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${preheader}</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${BRAND.page};">
<tr><td align="center" style="padding:28px 12px;">

  <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background-color:${BRAND.surface};border-radius:16px;overflow:hidden;">

    <!-- Header. Solid colour first so Outlook still gets a brand background. -->
    <tr>
      <td align="center"
          bgcolor="${BRAND.solid}"
          style="background-color:${BRAND.solid};background-image:linear-gradient(135deg,${BRAND.gradientStart} 0%,${BRAND.gradientEnd} 100%);padding:34px 24px;">
        <div style="font-size:23px;font-weight:800;color:${BRAND.ink};letter-spacing:-0.4px;">TaxLah</div>
        <div style="margin-top:6px;font-size:15px;font-weight:600;color:${BRAND.inkSoft};">${heading}</div>
      </td>
    </tr>

    <!-- Body -->
    <tr><td style="padding:32px 28px 28px 28px;">${body}</td></tr>

    <!-- Footer -->
    <tr>
      <td style="padding:22px 28px 28px 28px;border-top:1px solid ${BRAND.border};">
        <p style="margin:0;font-size:13px;line-height:20px;color:${BRAND.body};">
          Best regards,<br /><strong style="color:${BRAND.inkSoft};">The TaxLah Team</strong>
        </p>
        <p style="margin:14px 0 0 0;font-size:11.5px;line-height:18px;color:${BRAND.muted};">
          Making Malaysian tax relief claims simple, one receipt at a time.
        </p>
      </td>
    </tr>

  </table>

</td></tr>
</table>
</body>
</html>`;

/** The dashed panel holding a one-time code. */
const otpPanel = (otp) => `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0;">
<tr>
  <td align="center" bgcolor="${BRAND.tint}"
      style="background-color:${BRAND.tint};border:1px dashed ${BRAND.gradientEnd};border-radius:14px;padding:24px 16px;">
    <div style="font-size:11.5px;font-weight:700;letter-spacing:1.2px;color:${BRAND.body};text-transform:uppercase;">
      Your one-time code
    </div>
    <div style="margin:12px 0;font-size:36px;font-weight:800;letter-spacing:9px;color:${BRAND.deep};">
      ${otp}
    </div>
    <div style="font-size:12.5px;color:${BRAND.body};">
      Valid for <strong style="color:${BRAND.inkSoft};">10 minutes</strong>
    </div>
  </td>
</tr>
</table>`;

/** Amber caution strip. Text is #78350F on #FFFBEB — 9.8:1. */
const cautionPanel = (html) => `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0;">
<tr>
  <td bgcolor="#FFFBEB" style="background-color:#FFFBEB;border-left:4px solid #B45309;border-radius:8px;padding:14px 16px;">
    <p style="margin:0;font-size:13px;line-height:20px;color:#78350F;">${html}</p>
  </td>
</tr>
</table>`;

const paragraph = (html, extra = '') =>
    `<p style="margin:0 0 14px 0;font-size:14.5px;line-height:23px;color:${BRAND.body};${extra}">${html}</p>`;

/**
 * Builds the greeting line.
 *
 * Two callers make a plain `Dear ${name || 'User'}` wrong. AuthForgotPassword passes
 * null for every reset, and AuthLogin/AuthRegister pass the email address in the name
 * slot — so the greeting would read "Dear user@gmail.com". Both fall back to a plain
 * "Hello" rather than addressing someone by their address or by a placeholder.
 */
const greetingName = (value) => {
    const name = String(value ?? '').trim();
    if (!name || name.includes('@')) return null;
    return name;
};

const greeting = (value) => {
    const name = greetingName(value);
    return name
        ? `Dear <strong style="color:${BRAND.inkSoft};">${name}</strong>,`
        : 'Hello,';
};

const greetingText = (value) => {
    const name = greetingName(value);
    return name ? `Dear ${name},` : 'Hello,';
};

// ── Templates ───────────────────────────────────────────────────────────────

const OnboardingEmail = (account_fullname, account_email) => {

    return {
        subject: 'Welcome to TaxLah — your tax relief companion',
        text: `${greetingText(account_fullname)}

Welcome to TaxLah, your personal tax relief assistant for Malaysian tax deductions.

What TaxLah does for you:
- Tracks your tax-deductible expenses through the year
- Reminds you about claimable expenses: lifestyle, medical, education and more
- Calculates your potential savings as you go
- Generates reports ready for LHDN e-filing

Getting started:
1. Complete your profile
2. Snap or upload your first receipt
3. Watch your potential savings grow
4. Export your report when it is time to file

The Malaysian filing deadline is 30 April. Start tracking now.

Questions? Reach us at support@taxlah.com

Best regards,
The TaxLah Team`,

        html: layout({
            heading: 'Welcome aboard',
            preheader: 'Start tracking your tax relief in a few minutes.',
            body: `
${paragraph(greeting(account_fullname))}
${paragraph('Welcome to TaxLah — your personal assistant for Malaysian tax relief. We will help you claim what you are entitled to, without the paperwork headache.')}

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:22px 0;">
<tr><td bgcolor="${BRAND.tint}" style="background-color:${BRAND.tint};border-radius:14px;padding:20px 22px;">
  <div style="font-size:15px;font-weight:700;color:${BRAND.deeper};margin-bottom:12px;">What you can do</div>
  <div style="font-size:14px;line-height:24px;color:${BRAND.body};">
    <strong style="color:${BRAND.inkSoft};">Track expenses</strong> as they happen, all year round<br />
    <strong style="color:${BRAND.inkSoft};">Scan receipts</strong> and let AI categorise them for you<br />
    <strong style="color:${BRAND.inkSoft};">See your savings</strong> update in real time<br />
    <strong style="color:${BRAND.inkSoft};">Export LHDN-ready reports</strong> when filing season arrives
  </div>
</td></tr>
</table>

${paragraph(`<strong style="color:${BRAND.inkSoft};">Worth knowing:</strong> you may be able to claim up to RM2,500 on lifestyle purchases, RM10,000 on medical expenses and RM8,000 on education fees. TaxLah keeps track of all of it.`)}

<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:26px 0 6px 0;">
<tr><td align="center" bgcolor="${BRAND.deep}" style="background-color:${BRAND.deep};border-radius:12px;">
  <a href="https://taxlah.com/app"
     style="display:inline-block;padding:14px 30px;font-size:15px;font-weight:700;color:#FFFFFF;text-decoration:none;">
    Start tracking
  </a>
</td></tr>
</table>

${cautionPanel('<strong>Filing deadline: 30 April.</strong> The earlier you start logging receipts, the more you are likely to claim.')}

${paragraph(`Questions? We are at <a href="mailto:support@taxlah.com" style="color:${BRAND.deep};font-weight:600;text-decoration:none;">support@taxlah.com</a>.`)}
`,
        }),
    };
};

const ForgotPasswordEmail = (accountFullname, otp) => {

    return {
        subject: `${otp} is your TaxLah password reset code`,
        text: `${greetingText(accountFullname)}

We received a request to reset your TaxLah account password.

Your one-time code is: ${otp}

The code is valid for 10 minutes. Do not share it with anyone — TaxLah staff will never ask for it.

If you did not request a password reset, you can ignore this email. Your account remains secure.

Best regards,
The TaxLah Team`,

        html: layout({
            heading: 'Password reset',
            preheader: `Your code is ${otp}. It expires in 10 minutes.`,
            body: `
${paragraph(greeting(accountFullname))}
${paragraph('We received a request to reset your TaxLah account password. Enter the code below in the app to continue.')}
${otpPanel(otp)}
${cautionPanel('<strong>Never share this code.</strong> TaxLah staff will never ask you for it, by email, phone or message.')}
${paragraph('If you did not request a password reset, you can safely ignore this email — your account remains secure and your password stays unchanged.')}
`,
        }),
    };
};

const ApprovalCodeEmail = (email_account, otp) => {

    return {
        subject: `${otp} is your TaxLah account approval code`,
        text: `${greetingText(email_account)}

Here is the approval code for your TaxLah account.

Your one-time code is: ${otp}

The code is valid for 10 minutes. Do not share it with anyone — TaxLah staff will never ask for it.

If this was not you, you can ignore this email. Your account remains secure.

Best regards,
The TaxLah Team`,

        html: layout({
            heading: 'Account approval',
            preheader: `Your code is ${otp}. It expires in 10 minutes.`,
            body: `
${paragraph(greeting(email_account))}
${paragraph('Use the code below to approve your TaxLah account and finish setting things up.')}
${otpPanel(otp)}
${cautionPanel('<strong>Never share this code.</strong> TaxLah staff will never ask you for it, by email, phone or message.')}
${paragraph('If this was not you, you can safely ignore this email — your account remains secure.')}
`,
        }),
    };
};

module.exports = {
    OnboardingEmail,
    ForgotPasswordEmail,
    ApprovalCodeEmail,
};
