/**
 * Subscription receipt PDF.
 *
 * Written once per bill and remembered in bill.receipt_pdf_path, so repeated downloads
 * serve the same file. That matters beyond saving work: a receipt is a record of what
 * was charged, and rebuilding it later — after a price or tax-rate change — could
 * produce a different document from the one the customer already holds.
 *
 * Every figure comes from the bill row, captured at billing time, never recomputed.
 */

const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const db = require('../utils/sqlbuilder');

const RECEIPT_ROOT = path.join(__dirname, '../asset/receipt');

// Brand palette, matching the app. #17739B carries white text at 5.30:1.
const BRAND = '#17739B';
const BRAND_LIGHT = '#E8F7FB';
const INK = '#0F172A';
const BODY = '#475569';
const MUTED = '#94A3B8';
const RULE = '#E2E8F0';

const money = (n) => Number(n || 0).toFixed(2);

const formatDate = (d) => {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-MY', {
        day: '2-digit', month: 'short', year: 'numeric',
    });
};

const formatDateTime = (d) => {
    if (!d) return '—';
    return new Date(d).toLocaleString('en-MY', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
    });
};

/**
 * Draws the receipt.
 *
 * Laid out as a document rather than a screen: an invoice number people can quote, the
 * parties, what the period covers, and an itemised total that adds up.
 */
function render(doc, r) {
    const left = 50;
    const right = 545;
    let y = 50;

    // ── Header band ──
    doc.rect(0, 0, 595, 110).fill(BRAND);
    doc.fillColor('#FFFFFF').fontSize(22).font('Helvetica-Bold').text('TaxLah', left, 34);
    doc.fontSize(9).font('Helvetica')
        .text('Malaysian tax relief, tracked automatically', left, 62);

    doc.fontSize(16).font('Helvetica-Bold')
        .text('RECEIPT', left, 34, { width: right - left, align: 'right' });
    doc.fontSize(9).font('Helvetica')
        .text(r.invoice_no || r.payment_ref, left, 58, { width: right - left, align: 'right' });

    y = 140;

    // ── Paid banner. Status is stated plainly; an unpaid receipt must not look settled.
    const paid = String(r.payment_status).toLowerCase() === 'paid';
    doc.roundedRect(left, y, right - left, 42, 8).fill(paid ? BRAND_LIGHT : '#FEF2F2');
    doc.fillColor(paid ? BRAND : '#B91C1C').fontSize(11).font('Helvetica-Bold')
        .text(paid ? 'PAID' : String(r.payment_status).toUpperCase(), left + 16, y + 11);
    doc.fillColor(INK).fontSize(15).font('Helvetica-Bold')
        .text(`${r.currency} ${money(r.amount)}`, left, y + 11, {
            width: right - left - 16, align: 'right',
        });

    y += 68;

    // ── Parties ──
    const colW = (right - left) / 2;

    doc.fillColor(MUTED).fontSize(8).font('Helvetica-Bold').text('BILLED TO', left, y);
    doc.fillColor(INK).fontSize(11).font('Helvetica-Bold')
        .text(r.customer_name || '—', left, y + 14, { width: colW - 20 });
    doc.fillColor(BODY).fontSize(9).font('Helvetica')
        .text(r.customer_email || '', left, y + 30, { width: colW - 20 });
    if (r.customer_phone) {
        doc.text(r.customer_phone, left, y + 43, { width: colW - 20 });
    }

    doc.fillColor(MUTED).fontSize(8).font('Helvetica-Bold').text('PAYMENT', left + colW, y);
    const meta = [
        ['Date', formatDateTime(r.payment_date)],
        ['Method', r.payment_method || '—'],
        ['Reference', r.payment_ref],
    ];
    let my = y + 14;
    meta.forEach(([k, v]) => {
        doc.fillColor(BODY).fontSize(9).font('Helvetica').text(k, left + colW, my, { width: 60 });
        doc.fillColor(INK).font('Helvetica-Bold')
            .text(String(v), left + colW + 62, my, { width: colW - 62 });
        my += 14;
    });

    y = Math.max(y + 72, my + 12);

    // ── What was bought ──
    doc.moveTo(left, y).lineTo(right, y).strokeColor(RULE).lineWidth(1).stroke();
    y += 18;

    doc.fillColor(MUTED).fontSize(8).font('Helvetica-Bold').text('DESCRIPTION', left, y);
    doc.text('AMOUNT', left, y, { width: right - left, align: 'right' });
    y += 16;

    doc.fillColor(INK).fontSize(11).font('Helvetica-Bold')
        .text(r.package_name || 'Subscription', left, y, { width: colW * 1.4 });
    doc.fillColor(INK).fontSize(11).font('Helvetica')
        .text(`${r.currency} ${money(r.subtotal)}`, left, y, {
            width: right - left, align: 'right',
        });
    y += 16;

    const detail = [
        r.subscription_type,
        r.billing_period,
        r.period_start ? `${formatDate(r.period_start)} — ${formatDate(r.period_end)}` : null,
    ].filter(Boolean).join(' · ');

    doc.fillColor(BODY).fontSize(9).font('Helvetica').text(detail, left, y, { width: colW * 1.5 });
    y += 26;

    // ── Totals ──
    doc.moveTo(left + colW, y).lineTo(right, y).strokeColor(RULE).stroke();
    y += 12;

    const totalRow = (label, value, bold = false) => {
        doc.fillColor(bold ? INK : BODY)
            .fontSize(bold ? 12 : 10)
            .font(bold ? 'Helvetica-Bold' : 'Helvetica')
            .text(label, left + colW, y, { width: colW * 0.5 });
        doc.text(value, left, y, { width: right - left, align: 'right' });
        y += bold ? 20 : 16;
    };

    totalRow('Subtotal', `${r.currency} ${money(r.subtotal)}`);
    if (r.sst_amount !== null && r.sst_amount !== undefined) {
        // The rate is the one stored on the bill, so an old receipt keeps its own rate.
        totalRow(`SST (${(Number(r.sst_rate) * 100).toFixed(0)}%)`, `${r.currency} ${money(r.sst_amount)}`);
    }

    doc.moveTo(left + colW, y).lineTo(right, y).strokeColor(RULE).stroke();
    y += 10;
    totalRow('Total paid', `${r.currency} ${money(r.amount)}`, true);

    // ── Footer ──
    const footY = 720;
    doc.moveTo(left, footY).lineTo(right, footY).strokeColor(RULE).stroke();
    doc.fillColor(MUTED).fontSize(8).font('Helvetica')
        .text(
            'This receipt was generated by TaxLah. Payment processed by CHIP. ' +
            'Keep it for your records — it is valid proof of payment for this subscription period.',
            left, footY + 12, { width: right - left }
        );
    if (r.transaction_id) {
        doc.text(`Gateway transaction: ${r.transaction_id}`, left, footY + 34, { width: right - left });
    }
}

/**
 * Returns the absolute path of this payment's receipt PDF, writing it on first request.
 *
 * @param {object} receipt  Shape returned by SubscriptionPaymentService.getPaymentReceipt
 */
async function ensureReceiptPdf(receipt) {
    const dir = path.join(RECEIPT_ROOT, String(receipt.account_id));
    const filename = `receipt_${receipt.payment_ref}.pdf`;
    const filepath = path.join(dir, filename);
    const relative = `/asset/receipt/${receipt.account_id}/${filename}`;

    // Already written and still on disk — serve it rather than rebuild.
    if (receipt.receipt_pdf_path && fs.existsSync(filepath)) {
        return { filepath, relative, regenerated: false };
    }

    fs.mkdirSync(dir, { recursive: true });

    await new Promise((resolve, reject) => {
        const doc = new PDFDocument({ size: 'A4', margin: 0 });
        const stream = fs.createWriteStream(filepath);

        stream.on('finish', resolve);
        stream.on('error', reject);
        doc.on('error', reject);

        doc.pipe(stream);
        render(doc, receipt);
        doc.end();
    });

    // Remember it against the bill, when the payment could be traced to one.
    if (receipt.bill_no) {
        await db.raw(
            `UPDATE bill SET receipt_pdf_path = ?, last_modified = NOW() WHERE bill_no = ?`,
            [relative, receipt.bill_no]
        ).catch((e) => {
            // The PDF exists either way; failing to record the path only costs a rebuild.
            console.error('[ReceiptPdf] could not record path on bill:', e.message);
        });
    }

    return { filepath, relative, regenerated: true };
}

module.exports = { ensureReceiptPdf };
