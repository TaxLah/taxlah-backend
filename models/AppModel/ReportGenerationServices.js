/**
 * Tax Report Generator Service (Enhanced UI Version)
 * Generates beautiful PDF tax relief reports for Malaysian taxpayers
 * 
 * Report Types:
 * 1. Basic Report (30 credits) - Simple summary
 * 2. Detailed Report (50 credits) - Category breakdown with charts
 * 3. Premium Report (80 credits) - LHDN-ready format
 */

const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const db = require('../../utils/sqlbuilder');

// Report configuration
const REPORT_CONFIG = {
    basic: {
        name: 'Basic Tax Relief Summary',
        credits: 30,
        features: ['summary', 'category_totals']
    },
    detailed: {
        name: 'Detailed Tax Relief Report',
        credits: 50,
        features: ['summary', 'category_totals', 'category_breakdown', 'receipts_list']
    },
    premium: {
        name: 'Premium LHDN-Ready Report',
        credits: 80,
        features: ['summary', 'category_totals', 'category_breakdown', 'receipts_list', 'dependants', 'lhdn_format']
    }
};

// Color scheme
const COLORS = {
    primary: '#1a5f7a',
    primaryDark: '#134b5f',
    primaryLight: '#e8f4f8',
    secondary: '#ff6b35',
    success: '#28a745',
    successLight: '#d4edda',
    successDark: '#1e7e34',
    warning: '#ffc107',
    warningLight: '#fff3cd',
    danger: '#dc3545',
    info: '#17a2b8',
    infoLight: '#d1ecf1',
    dark: '#2d3436',
    gray: '#636e72',
    grayLight: '#b2bec3',
    grayLighter: '#dfe6e9',
    white: '#ffffff',
    background: '#f8f9fa'
};

// Malaysian Ringgit formatter
const formatRM = (amount) => {
    const num = parseFloat(amount) || 0;
    return `RM ${num.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

// Short amount formatter (no RM prefix)
const formatAmount = (amount) => {
    const num = parseFloat(amount) || 0;
    return num.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

// Date formatter
const formatDate = (date) => {
    if (!date) return '-';
    const d = new Date(date);
    return d.toLocaleDateString('en-MY', { day: '2-digit', month: 'short', year: 'numeric' });
};

/**
 * Get user's tax data for report
 */
async function getTaxReportData(accountId, taxYear) {
    const data = {
        user: null,
        summary: null,
        claims: [],
        receipts: [],
        dependants: [],
        categories: []
    };

    try {
        // Get user info
        const userSql = `
            SELECT account_id, account_name, account_fullname, account_email, account_contact, account_ic
            FROM account WHERE account_id = ?
        `;
        const userResult = await db.raw(userSql, [accountId]);
        data.user = userResult[0] || null;

        // Get tax claims summary
        const summarySql = `
            SELECT 
                COUNT(DISTINCT atc.tax_id) as categories_claimed,
                COALESCE(SUM(atc.claimed_amount), 0) as total_claimed,
                (SELECT COALESCE(SUM(tax_max_claim), 0) FROM tax_category WHERE tax_year = ? AND status = 'Active') as max_possible
            FROM account_tax_claim atc
            WHERE atc.account_id = ? AND atc.tax_year = ? AND atc.status = 'Active'
        `;
        const summaryResult = await db.raw(summarySql, [taxYear, accountId, taxYear]);
        data.summary = summaryResult[0] || { categories_claimed: 0, total_claimed: 0, max_possible: 0 };

        // Get detailed claims by category
        const claimsSql = `
            SELECT 
                tc.tax_id, tc.tax_code, tc.tax_title, tc.tax_max_claim, tc.tax_description,
                COALESCE(SUM(atc.claimed_amount), 0) as claimed_amount,
                ts.taxsub_id, ts.taxsub_code, ts.taxsub_title, ts.taxsub_max_claim
            FROM tax_category tc
            LEFT JOIN account_tax_claim atc ON tc.tax_id = atc.tax_id 
                AND atc.account_id = ? AND atc.tax_year = ? AND atc.status = 'Active'
            LEFT JOIN tax_subcategory ts ON atc.taxsub_id = ts.taxsub_id
            WHERE tc.tax_year = ? AND tc.status = 'Active'
            GROUP BY tc.tax_id, ts.taxsub_id
            ORDER BY tc.tax_sort_order, ts.taxsub_sort_order
        `;
        data.claims = await db.raw(claimsSql, [accountId, taxYear, taxYear]);

        // Get receipts with tax mapping
        const receiptsSql = `
            SELECT r.receipt_id, r.receipt_name, r.receipt_description, r.receipt_amount,
                r.receipt_image_url, r.created_date, tc.tax_title, ts.taxsub_title, rtm.mapped_amount
            FROM receipt r
            LEFT JOIN receipt_tax_mapping rtm ON r.receipt_id = rtm.receipt_id AND rtm.status = 'Active'
            LEFT JOIN tax_category tc ON rtm.tax_id = tc.tax_id
            LEFT JOIN tax_subcategory ts ON rtm.taxsub_id = ts.taxsub_id
            WHERE r.account_id = ? AND YEAR(r.created_date) = ? AND r.status = 'Active'
            ORDER BY r.created_date DESC
        `;
        data.receipts = await db.raw(receiptsSql, [accountId, taxYear]);

        // Get dependants
        const dependantsSql = `
            SELECT dependant_id, dependant_name, dependant_fullname, dependant_type,
                dependant_ic, dependant_dob, dependant_age, dependant_is_disabled,
                dependant_is_studying, dependant_education_level
            FROM account_dependant
            WHERE account_id = ? AND status = 'Active'
            ORDER BY dependant_type, dependant_name
        `;
        data.dependants = await db.raw(dependantsSql, [accountId]);

    } catch (error) {
        console.error('[ReportGenerator] getTaxReportData error:', error);
        throw error;
    }

    return data;
}

/**
 * Draw rounded rectangle helper
 */
function roundedRect(doc, x, y, width, height, radius) {
    doc.moveTo(x + radius, y)
       .lineTo(x + width - radius, y)
       .quadraticCurveTo(x + width, y, x + width, y + radius)
       .lineTo(x + width, y + height - radius)
       .quadraticCurveTo(x + width, y + height, x + width - radius, y + height)
       .lineTo(x + radius, y + height)
       .quadraticCurveTo(x, y + height, x, y + height - radius)
       .lineTo(x, y + radius)
       .quadraticCurveTo(x, y, x + radius, y);
}

/**
 * Draw filled rounded rectangle
 */
function drawRoundedRect(doc, x, y, width, height, radius, fillColor, strokeColor = null) {
    roundedRect(doc, x, y, width, height, radius);
    if (fillColor && strokeColor) {
        doc.fillAndStroke(fillColor, strokeColor);
    } else if (fillColor) {
        doc.fill(fillColor);
    } else if (strokeColor) {
        doc.stroke(strokeColor);
    }
}

/**
 * Draw progress bar
 */
function drawProgressBar(doc, x, y, width, height, percentage, fillColor, bgColor = COLORS.grayLighter) {
    const radius = height / 2;
    roundedRect(doc, x, y, width, height, radius);
    doc.fill(bgColor);
    const progressWidth = Math.max(height, (width * Math.min(percentage, 100)) / 100);
    if (percentage > 0) {
        roundedRect(doc, x, y, progressWidth, height, radius);
        doc.fill(fillColor);
    }
}

/**
 * Generate PDF report
 */
async function generatePDFReport(accountId, taxYear, reportType = 'basic') {
    const config = REPORT_CONFIG[reportType];
    if (!config) throw new Error('Invalid report type');

    const data = await getTaxReportData(accountId, taxYear);
    if (!data.user) throw new Error('User not found');

    const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 40, bottom: 50, left: 40, right: 40 },
        bufferPages: true,
        info: {
            Title: `Tax Relief Report ${taxYear} - ${data.user.account_fullname || data.user.account_name}`,
            Author: 'TaxLah Malaysia',
            Subject: `Malaysian Tax Relief Report for Year of Assessment ${taxYear}`,
            Creator: 'TaxLah Report Generator'
        }
    });

    const timestamp = Date.now();
    const filename = `tax_report_${taxYear}_${accountId}_${timestamp}.pdf`;
    const filepath = path.join(__dirname, '../../assets/document', filename);
    
    const dir = path.dirname(filepath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const stream = fs.createWriteStream(filepath);
    doc.pipe(stream);

    const pageWidth = doc.page.width - 80;
    
    // Generate content
    generateHeader(doc, data, taxYear, config.name, pageWidth);
    
    if (config.features.includes('summary')) {
        generateSummarySection(doc, data, taxYear, pageWidth);
    }
    
    if (config.features.includes('category_totals')) {
        generateCategoryTotals(doc, data, pageWidth);
    }
    
    if (config.features.includes('category_breakdown')) {
        doc.addPage();
        generateCategoryBreakdown(doc, data, pageWidth);
    }
    
    if (config.features.includes('dependants') && data.dependants.length > 0) {
        generateDependantsSection(doc, data, pageWidth);
    }
    
    if (config.features.includes('receipts_list') && data.receipts.length > 0) {
        doc.addPage();
        generateReceiptsList(doc, data, pageWidth);
    }
    
    if (config.features.includes('lhdn_format')) {
        doc.addPage();
        generateLHDNFormat(doc, data, taxYear, pageWidth);
    }

    // Add page numbers only (no footer)
    // addPageNumbers(doc);

    doc.end();

    await new Promise((resolve, reject) => {
        stream.on('finish', resolve);
        stream.on('error', reject);
    });

    return { filename, filepath, url: `/document/${filename}`, report_type: reportType, credits_used: config.credits };
}

/**
 * Add page numbers only
 */
function addPageNumbers(doc) {
    const range = doc.bufferedPageRange();
    const totalPages = range.count;
    
    for (let i = range.start; i < range.start + range.count; i++) {
        doc.switchToPage(i);
        
        doc.font('Helvetica')
           .fontSize(8)
           .fillColor(COLORS.gray)
           .text(
               `${i + 1} / ${totalPages}`,
               0,
               doc.page.height - 30,
               { align: 'center', width: doc.page.width, lineBreak: false }
           );
    }
}

/**
 * Generate header
 */
function generateHeader(doc, data, taxYear, reportName, pageWidth) {
    const startX = 40;

    // Header background
    doc.rect(0, 0, doc.page.width, 130).fill(COLORS.primary);
    doc.circle(doc.page.width - 30, 20, 80).fill(COLORS.primaryDark).opacity(0.3);
    doc.opacity(1);

    // Logo
    doc.fontSize(26).font('Helvetica-Bold').fillColor(COLORS.white).text('TaxLah', startX, 35);
    doc.fontSize(9).font('Helvetica').fillColor(COLORS.white).opacity(0.8)
       .text('Malaysian Tax Relief Management', startX, 63);
    doc.opacity(1);

    // Year badge
    const badgeX = doc.page.width - 140;
    drawRoundedRect(doc, badgeX, 30, 100, 35, 8, COLORS.white);
    doc.fontSize(10).font('Helvetica').fillColor(COLORS.gray)
       .text('Year of Assessment', badgeX, 37, { width: 100, align: 'center' });
    doc.fontSize(16).font('Helvetica-Bold').fillColor(COLORS.primary)
       .text(taxYear.toString(), badgeX, 52, { width: 100, align: 'center' });

    // Report type tag
    drawRoundedRect(doc, badgeX, 75, 100, 22, 11, COLORS.secondary);
    doc.fontSize(8).font('Helvetica-Bold').fillColor(COLORS.white)
       .text(reportName.split(' ')[0].toUpperCase() + ' REPORT', badgeX, 81, { width: 100, align: 'center' });

    // User info card
    const y = 145;
    drawRoundedRect(doc, startX, y, pageWidth, 75, 10, COLORS.white, COLORS.grayLighter);

    // Avatar
    const avatarX = startX + 18, avatarY = y + 15, avatarSize = 45;
    doc.circle(avatarX + avatarSize/2, avatarY + avatarSize/2, avatarSize/2).fill(COLORS.primaryLight);
    const initial = (data.user.account_fullname || data.user.account_name || 'U').charAt(0).toUpperCase();
    doc.fontSize(22).font('Helvetica-Bold').fillColor(COLORS.primary)
       .text(initial, avatarX, avatarY + 11, { width: avatarSize, align: 'center' });

    // User details
    const detailsX = avatarX + avatarSize + 18;
    doc.fontSize(13).font('Helvetica-Bold').fillColor(COLORS.dark)
       .text(data.user.account_fullname || data.user.account_name || 'Taxpayer', detailsX, y + 18);

    doc.fontSize(8).font('Helvetica').fillColor(COLORS.gray)
       .text('IC Number', detailsX, y + 40)
       .text('Email', detailsX + 160, y + 40);
    
    doc.fontSize(9).font('Helvetica-Bold').fillColor(COLORS.dark)
       .text(data.user.account_ic || 'Not provided', detailsX, y + 52)
       .text(data.user.account_email || 'Not provided', detailsX + 160, y + 52);

    // Generated date
    drawRoundedRect(doc, startX + pageWidth - 115, y + 25, 100, 25, 5, COLORS.background);
    doc.fontSize(7).font('Helvetica').fillColor(COLORS.gray)
       .text('Generated on', startX + pageWidth - 110, y + 30, { width: 90, align: 'center' });
    doc.fontSize(8).font('Helvetica-Bold').fillColor(COLORS.dark)
       .text(formatDate(new Date()), startX + pageWidth - 110, y + 40, { width: 90, align: 'center' });

    doc.y = y + 90;
}

/**
 * Generate summary section
 */
function generateSummarySection(doc, data, taxYear, pageWidth) {
    const startX = 40;
    let y = doc.y + 15;

    doc.fontSize(14).font('Helvetica-Bold').fillColor(COLORS.dark).text('Tax Relief Overview', startX, y);
    doc.moveTo(startX + 130, y + 8).lineTo(startX + pageWidth, y + 8)
       .strokeColor(COLORS.grayLighter).lineWidth(1).stroke();

    y += 28;

    const cardWidth = (pageWidth - 20) / 3, cardHeight = 85, cardGap = 10;

    // Card 1: Total Claimed
    drawRoundedRect(doc, startX, y, cardWidth, cardHeight, 8, COLORS.successLight);
    doc.rect(startX, y + 8, 4, cardHeight - 16).fill(COLORS.success);
    doc.fontSize(9).font('Helvetica').fillColor(COLORS.gray).text('Total Relief Claimed', startX + 15, y + 15);
    doc.fontSize(20).font('Helvetica-Bold').fillColor(COLORS.successDark).text(formatRM(data.summary.total_claimed), startX + 15, y + 35);
    drawRoundedRect(doc, startX + 15, y + 62, 80, 16, 8, COLORS.success);
    doc.fontSize(8).font('Helvetica-Bold').fillColor(COLORS.white)
       .text(`${data.summary.categories_claimed} categories`, startX + 15, y + 66, { width: 80, align: 'center' });

    // Card 2: Maximum Possible
    const card2X = startX + cardWidth + cardGap;
    drawRoundedRect(doc, card2X, y, cardWidth, cardHeight, 8, COLORS.infoLight);
    doc.rect(card2X, y + 8, 4, cardHeight - 16).fill(COLORS.info);
    doc.fontSize(9).font('Helvetica').fillColor(COLORS.gray).text('Maximum Possible', card2X + 15, y + 15);
    doc.fontSize(20).font('Helvetica-Bold').fillColor(COLORS.info).text(formatRM(data.summary.max_possible), card2X + 15, y + 35);
    doc.fontSize(8).font('Helvetica').fillColor(COLORS.gray).text(`Based on LHDN YA ${taxYear}`, card2X + 15, y + 65);

    // Card 3: Remaining
    const remaining = parseFloat(data.summary.max_possible) - parseFloat(data.summary.total_claimed);
    const percentage = data.summary.max_possible > 0 ? Math.round((data.summary.total_claimed / data.summary.max_possible) * 100) : 0;
    const card3X = startX + (cardWidth + cardGap) * 2;
    drawRoundedRect(doc, card3X, y, cardWidth, cardHeight, 8, COLORS.warningLight);
    doc.rect(card3X, y + 8, 4, cardHeight - 16).fill(COLORS.warning);
    doc.fontSize(9).font('Helvetica').fillColor(COLORS.gray).text('Remaining Unclaimed', card3X + 15, y + 15);
    doc.fontSize(20).font('Helvetica-Bold').fillColor('#e67e00').text(formatRM(remaining), card3X + 15, y + 35);
    drawProgressBar(doc, card3X + 15, y + 62, cardWidth - 60, 10, percentage, COLORS.primary);
    doc.fontSize(10).font('Helvetica-Bold').fillColor(COLORS.primary).text(`${percentage}%`, card3X + cardWidth - 38, y + 60);

    doc.y = y + cardHeight + 20;
}

/**
 * Generate category totals table
 */
function generateCategoryTotals(doc, data, pageWidth) {
    const startX = 40;
    let y = doc.y + 10;

    doc.fontSize(14).font('Helvetica-Bold').fillColor(COLORS.dark).text('Relief by Category', startX, y);
    doc.moveTo(startX + 120, y + 8).lineTo(startX + pageWidth, y + 8)
       .strokeColor(COLORS.grayLighter).lineWidth(1).stroke();

    y += 28;

    // Aggregate by category
    const categoryTotals = {};
    data.claims.forEach(claim => {
        if (!categoryTotals[claim.tax_id]) {
            categoryTotals[claim.tax_id] = {
                tax_title: claim.tax_title,
                tax_max_claim: parseFloat(claim.tax_max_claim) || 0,
                claimed_amount: 0
            };
        }
        categoryTotals[claim.tax_id].claimed_amount += parseFloat(claim.claimed_amount) || 0;
    });

    // Table header
    const cols = { cat: 220, max: 95, claimed: 95, remaining: 95 };
    drawRoundedRect(doc, startX, y, pageWidth, 26, 6, COLORS.primary);
    doc.fontSize(9).font('Helvetica-Bold').fillColor(COLORS.white);
    doc.text('Category', startX + 12, y + 8);
    doc.text('Max Claim', startX + 12 + cols.cat, y + 8);
    doc.text('Claimed', startX + 12 + cols.cat + cols.max, y + 8);
    doc.text('Remaining', startX + 12 + cols.cat + cols.max + cols.claimed, y + 8);
    y += 26;

    // Rows
    let rowIndex = 0;
    Object.values(categoryTotals).forEach(cat => {
        if (y > doc.page.height - 100) {
            doc.addPage();
            y = 50;
            drawRoundedRect(doc, startX, y, pageWidth, 26, 6, COLORS.primary);
            doc.fontSize(9).font('Helvetica-Bold').fillColor(COLORS.white);
            doc.text('Category', startX + 12, y + 8);
            doc.text('Max Claim', startX + 12 + cols.cat, y + 8);
            doc.text('Claimed', startX + 12 + cols.cat + cols.max, y + 8);
            doc.text('Remaining', startX + 12 + cols.cat + cols.max + cols.claimed, y + 8);
            y += 26;
        }

        const remaining = cat.tax_max_claim - cat.claimed_amount;
        const percentage = cat.tax_max_claim > 0 ? (cat.claimed_amount / cat.tax_max_claim) * 100 : 0;
        const bgColor = rowIndex % 2 === 0 ? COLORS.white : COLORS.background;
        const statusColor = percentage >= 100 ? COLORS.success : percentage > 0 ? COLORS.warning : COLORS.grayLight;

        doc.rect(startX, y, pageWidth, 30).fill(bgColor);
        doc.rect(startX, y, 4, 30).fill(statusColor);

        const catName = cat.tax_title.length > 32 ? cat.tax_title.substring(0, 32) + '...' : cat.tax_title;
        doc.fontSize(9).font('Helvetica').fillColor(COLORS.dark).text(catName, startX + 12, y + 7, { width: cols.cat - 10 });
        drawProgressBar(doc, startX + 12, y + 21, 80, 4, percentage, statusColor);
        doc.text(formatRM(cat.tax_max_claim), startX + 12 + cols.cat, y + 10);
        doc.font('Helvetica-Bold').fillColor(cat.claimed_amount > 0 ? COLORS.success : COLORS.grayLight)
           .text(formatRM(cat.claimed_amount), startX + 12 + cols.cat + cols.max, y + 10);
        doc.font('Helvetica').fillColor(remaining > 0 ? COLORS.secondary : COLORS.success)
           .text(formatRM(remaining), startX + 12 + cols.cat + cols.max + cols.claimed, y + 10);

        y += 30;
        rowIndex++;
    });

    // Total row
    drawRoundedRect(doc, startX, y + 5, pageWidth, 32, 6, COLORS.primaryDark);
    doc.fontSize(10).font('Helvetica-Bold').fillColor(COLORS.white);
    doc.text('TOTAL', startX + 12, y + 15);
    doc.text(formatRM(data.summary.max_possible), startX + 12 + cols.cat, y + 15);
    doc.text(formatRM(data.summary.total_claimed), startX + 12 + cols.cat + cols.max, y + 15);
    doc.text(formatRM(parseFloat(data.summary.max_possible) - parseFloat(data.summary.total_claimed)), startX + 12 + cols.cat + cols.max + cols.claimed, y + 15);

    doc.y = y + 50;
}

/**
 * Generate category breakdown
 */
function generateCategoryBreakdown(doc, data, pageWidth) {
    const startX = 40;
    let y = 50;

    doc.fontSize(14).font('Helvetica-Bold').fillColor(COLORS.dark).text('Detailed Category Breakdown', startX, y);
    doc.fontSize(9).font('Helvetica').fillColor(COLORS.gray).text('Complete breakdown of your tax relief claims', startX, y + 20);
    y += 45;

    const grouped = {};
    data.claims.forEach(claim => {
        if (!grouped[claim.tax_id]) {
            grouped[claim.tax_id] = { tax_title: claim.tax_title, tax_max_claim: claim.tax_max_claim, subcategories: [], total_claimed: 0 };
        }
        if (claim.taxsub_id) {
            grouped[claim.tax_id].subcategories.push({ taxsub_title: claim.taxsub_title, claimed_amount: parseFloat(claim.claimed_amount) || 0 });
        }
        grouped[claim.tax_id].total_claimed += parseFloat(claim.claimed_amount) || 0;
    });

    const claimedCategories = Object.values(grouped).filter(cat => cat.total_claimed > 0);

    if (claimedCategories.length === 0) {
        drawRoundedRect(doc, startX, y, pageWidth, 50, 8, COLORS.background);
        doc.fontSize(10).font('Helvetica').fillColor(COLORS.gray)
           .text('No claims recorded yet. Upload receipts to see your breakdown.', startX + 20, y + 18);
        doc.y = y + 70;
        return;
    }

    claimedCategories.forEach(cat => {
        const subCount = cat.subcategories.filter(s => s.claimed_amount > 0).length;
        const cardHeight = 55 + (subCount * 22);
        
        if (y > doc.page.height - cardHeight - 50) { doc.addPage(); y = 50; }

        const percentage = cat.tax_max_claim > 0 ? (cat.total_claimed / parseFloat(cat.tax_max_claim)) * 100 : 0;
        const accentColor = percentage >= 100 ? COLORS.success : COLORS.primary;

        drawRoundedRect(doc, startX, y, pageWidth, cardHeight, 8, COLORS.white, COLORS.grayLighter);
        doc.rect(startX, y + 8, 4, cardHeight - 16).fill(accentColor);

        doc.fontSize(11).font('Helvetica-Bold').fillColor(COLORS.dark).text(cat.tax_title, startX + 15, y + 12, { width: pageWidth - 130 });

        drawRoundedRect(doc, startX + pageWidth - 105, y + 8, 90, 24, 12, accentColor);
        doc.fontSize(10).font('Helvetica-Bold').fillColor(COLORS.white)
           .text(formatRM(cat.total_claimed), startX + pageWidth - 100, y + 14, { width: 80, align: 'center' });

        doc.fontSize(8).font('Helvetica').fillColor(COLORS.gray)
           .text(`${Math.round(percentage)}% of ${formatRM(cat.tax_max_claim)} limit`, startX + 15, y + 35);
        drawProgressBar(doc, startX + 15, y + 48, pageWidth - 140, 6, percentage, accentColor);

        let subY = y + 60;
        cat.subcategories.forEach(sub => {
            if (sub.claimed_amount > 0) {
                doc.fontSize(9).font('Helvetica').fillColor(COLORS.gray).text('•', startX + 20, subY)
                   .text(sub.taxsub_title, startX + 32, subY, { width: pageWidth - 150 });
                doc.font('Helvetica-Bold').fillColor(COLORS.dark)
                   .text(formatRM(sub.claimed_amount), startX + pageWidth - 100, subY, { width: 85, align: 'right' });
                subY += 22;
            }
        });

        y += cardHeight + 12;
    });

    doc.y = y;
}

/**
 * Generate dependants section
 */
function generateDependantsSection(doc, data, pageWidth) {
    if (doc.y > doc.page.height - 150) { doc.addPage(); doc.y = 50; }

    const startX = 40;
    let y = doc.y + 20;

    doc.fontSize(14).font('Helvetica-Bold').fillColor(COLORS.dark).text('Registered Dependants', startX, y);
    y += 28;

    const typeColors = { 'Spouse': COLORS.secondary, 'Child': COLORS.info, 'Parent': COLORS.success, 'Sibling': COLORS.warning };

    data.dependants.forEach(dep => {
        if (y > doc.page.height - 80) { doc.addPage(); y = 50; }

        drawRoundedRect(doc, startX, y, pageWidth, 50, 8, COLORS.white, COLORS.grayLighter);

        const typeColor = typeColors[dep.dependant_type] || COLORS.gray;
        drawRoundedRect(doc, startX + 12, y + 15, 55, 20, 10, typeColor);
        doc.fontSize(8).font('Helvetica-Bold').fillColor(COLORS.white)
           .text(dep.dependant_type, startX + 12, y + 21, { width: 55, align: 'center' });

        doc.fontSize(11).font('Helvetica-Bold').fillColor(COLORS.dark)
           .text(dep.dependant_fullname || dep.dependant_name, startX + 78, y + 12);
        doc.fontSize(8).font('Helvetica').fillColor(COLORS.gray)
           .text(`IC: ${dep.dependant_ic || 'N/A'}  •  Age: ${dep.dependant_age || 'N/A'}`, startX + 78, y + 30);

        let badgeX = startX + pageWidth - 15;
        if (dep.dependant_is_disabled === 'Yes') {
            badgeX -= 45;
            drawRoundedRect(doc, badgeX, y + 16, 40, 18, 9, '#ffebee');
            doc.fontSize(7).font('Helvetica-Bold').fillColor(COLORS.danger).text('OKU', badgeX, y + 21, { width: 40, align: 'center' });
        }
        if (dep.dependant_is_studying === 'Yes') {
            badgeX -= 60;
            drawRoundedRect(doc, badgeX, y + 16, 55, 18, 9, '#e3f2fd');
            doc.fontSize(7).font('Helvetica-Bold').fillColor(COLORS.info).text('Studying', badgeX, y + 21, { width: 55, align: 'center' });
        }

        y += 60;
    });

    doc.y = y;
}

/**
 * Generate receipts list
 */
function generateReceiptsList(doc, data, pageWidth) {
    const startX = 40;
    let y = 50;

    doc.fontSize(14).font('Helvetica-Bold').fillColor(COLORS.dark).text('Receipts Summary', startX, y);
    drawRoundedRect(doc, startX + 130, y - 3, 70, 20, 10, COLORS.primary);
    doc.fontSize(9).font('Helvetica-Bold').fillColor(COLORS.white)
       .text(`${data.receipts.length} items`, startX + 130, y + 2, { width: 70, align: 'center' });
    y += 35;

    const cols = { date: 70, desc: 185, cat: 130, amount: 85 };
    
    const drawHeader = (yPos) => {
        drawRoundedRect(doc, startX, yPos, pageWidth, 24, 6, COLORS.primary);
        doc.fontSize(8).font('Helvetica-Bold').fillColor(COLORS.white);
        doc.text('Date', startX + 10, yPos + 8);
        doc.text('Description', startX + 10 + cols.date, yPos + 8);
        doc.text('Category', startX + 10 + cols.date + cols.desc, yPos + 8);
        doc.text('Amount', startX + 10 + cols.date + cols.desc + cols.cat, yPos + 8);
        return yPos + 24;
    };

    y = drawHeader(y);

    data.receipts.forEach((receipt, index) => {
        if (y > doc.page.height - 70) { doc.addPage(); y = drawHeader(50); }

        const bgColor = index % 2 === 0 ? COLORS.white : COLORS.background;
        doc.rect(startX, y, pageWidth, 22).fill(bgColor);

        doc.fontSize(8).font('Helvetica').fillColor(COLORS.dark);
        doc.text(formatDate(receipt.created_date), startX + 10, y + 7);
        doc.text((receipt.receipt_name || '-').substring(0, 30), startX + 10 + cols.date, y + 7);
        doc.fillColor(COLORS.gray).text((receipt.tax_title || 'Uncategorized').substring(0, 20), startX + 10 + cols.date + cols.desc, y + 7);
        doc.font('Helvetica-Bold').fillColor(COLORS.dark).text(formatRM(receipt.receipt_amount), startX + 10 + cols.date + cols.desc + cols.cat, y + 7);

        y += 22;
    });

    const totalAmount = data.receipts.reduce((sum, r) => sum + parseFloat(r.receipt_amount || 0), 0);
    drawRoundedRect(doc, startX, y + 5, pageWidth, 28, 6, COLORS.successLight);
    doc.rect(startX, y + 5, 4, 28).fill(COLORS.success);
    doc.fontSize(10).font('Helvetica-Bold').fillColor(COLORS.successDark);
    doc.text('Total', startX + 15, y + 14);
    doc.text(formatRM(totalAmount), startX + pageWidth - 95, y + 14);

    doc.y = y + 50;
}

/**
 * Generate LHDN format
 */
function generateLHDNFormat(doc, data, taxYear, pageWidth) {
    const startX = 40;
    let y = 50;

    doc.fontSize(14).font('Helvetica-Bold').fillColor(COLORS.dark).text('LHDN e-Filing Reference', startX, y);
    y += 25;

    drawRoundedRect(doc, startX, y, pageWidth, 40, 8, COLORS.infoLight);
    doc.rect(startX, y, 4, 40).fill(COLORS.info);
    doc.fontSize(9).font('Helvetica-Bold').fillColor(COLORS.info).text('Quick Reference Guide', startX + 15, y + 10);
    doc.fontSize(8).font('Helvetica').fillColor(COLORS.gray)
       .text('Use these figures when completing your BE/B Form on MyTax portal (mytax.hasil.gov.my)', startX + 15, y + 24);
    y += 55;

    const lhdnSections = [
        { code: 'F1', title: 'Individual & Dependent Relatives', taxCode: 'INDIVIDUAL' },
        { code: 'F2', title: 'Medical Expenses for Parents', taxCode: 'PARENT_MEDICAL' },
        { code: 'F3', title: 'Basic Supporting Equipment (Disabled)', taxCode: 'DISABLED_EQUIPMENT' },
        { code: 'F4', title: 'Disabled Individual', taxCode: 'DISABLED_SELF' },
        { code: 'F5', title: 'Education Fees (Self)', taxCode: 'EDUCATION_SELF' },
        { code: 'F6', title: 'Medical Expenses for Serious Diseases', taxCode: 'MEDICAL_SERIOUS' },
        { code: 'F7', title: 'Complete Medical Examination', taxCode: 'MEDICAL_EXAM' },
        { code: 'F8', title: 'Lifestyle Expenses', taxCode: 'LIFESTYLE' },
        { code: 'F9', title: 'Lifestyle - Sports Activities', taxCode: 'LIFESTYLE_SPORTS' },
        { code: 'F10', title: 'Breastfeeding Equipment', taxCode: 'BREASTFEEDING' },
        { code: 'F11', title: 'Child Care Fees', taxCode: 'CHILDCARE' },
        { code: 'F12', title: 'SSPN Net Deposit', taxCode: 'SSPN' },
        { code: 'F13', title: 'Spouse / Alimony to Former Wife', taxCode: 'SPOUSE' },
        { code: 'F14', title: 'Disabled Spouse', taxCode: 'DISABLED_SPOUSE' },
        { code: 'F15', title: 'Child Relief (Under 18)', taxCode: 'CHILD_UNDER18' },
        { code: 'F16', title: 'Child Relief (18+ Studying)', taxCode: 'CHILD_HIGHER_ED' },
        { code: 'F17', title: 'Disabled Child', taxCode: 'DISABLED_CHILD' },
        { code: 'F18', title: 'Life Insurance & EPF', taxCode: 'LIFE_EPF' },
        { code: 'F19', title: 'Private Retirement Scheme (PRS)', taxCode: 'PRS' },
        { code: 'F20', title: 'Education & Medical Insurance', taxCode: 'INSURANCE_EDU_MED' },
        { code: 'F21', title: 'SOCSO Contribution', taxCode: 'SOCSO' },
        { code: 'F22', title: 'EV Charging Equipment', taxCode: 'EV_CHARGING' },
    ];

    const claimedByCode = {};
    data.claims.forEach(claim => {
        const baseCode = claim.tax_code?.replace(/_\d{4}$/, '');
        if (!claimedByCode[baseCode]) claimedByCode[baseCode] = 0;
        claimedByCode[baseCode] += parseFloat(claim.claimed_amount) || 0;
    });

    const drawLHDNHeader = (yPos) => {
        drawRoundedRect(doc, startX, yPos, pageWidth, 24, 6, COLORS.primary);
        doc.fontSize(9).font('Helvetica-Bold').fillColor(COLORS.white);
        doc.text('Code', startX + 12, yPos + 7);
        doc.text('Description', startX + 55, yPos + 7);
        doc.text('Amount (RM)', startX + pageWidth - 85, yPos + 7);
        return yPos + 24;
    };

    y = drawLHDNHeader(y);

    let totalClaimed = 0;
    lhdnSections.forEach((section, index) => {
        if (y > doc.page.height - 60) { doc.addPage(); y = drawLHDNHeader(50); }

        const amount = claimedByCode[section.taxCode] || 0;
        totalClaimed += amount;

        const bgColor = index % 2 === 0 ? COLORS.white : COLORS.background;
        doc.rect(startX, y, pageWidth, 20).fill(bgColor);

        const codeColor = amount > 0 ? COLORS.success : COLORS.grayLight;
        drawRoundedRect(doc, startX + 8, y + 3, 35, 14, 7, codeColor);
        doc.fontSize(8).font('Helvetica-Bold').fillColor(COLORS.white)
           .text(section.code, startX + 8, y + 6, { width: 35, align: 'center' });

        doc.fontSize(8).font('Helvetica').fillColor(COLORS.dark).text(section.title, startX + 52, y + 6);
        doc.font(amount > 0 ? 'Helvetica-Bold' : 'Helvetica').fillColor(amount > 0 ? COLORS.success : COLORS.grayLight)
           .text(amount > 0 ? formatAmount(amount) : '-', startX + pageWidth - 80, y + 6);

        y += 20;
    });

    drawRoundedRect(doc, startX, y + 5, pageWidth, 30, 6, COLORS.primaryDark);
    doc.fontSize(11).font('Helvetica-Bold').fillColor(COLORS.white);
    doc.text('TOTAL TAX RELIEF', startX + 15, y + 14);
    doc.text(formatAmount(totalClaimed), startX + pageWidth - 95, y + 14);

    doc.y = y + 50;
}

/**
 * Main export function
 */
async function generateTaxReport(accountId, taxYear, reportType = 'basic') {
    try {
        console.log(`[ReportGenerator] Generating ${reportType} report for account ${accountId}, year ${taxYear}`);
        const result = await generatePDFReport(accountId, taxYear, reportType);
        console.log(`[ReportGenerator] Report generated: ${result.filename}`);
        return { status: true, data: result };
    } catch (error) {
        console.error('[ReportGenerator] Error:', error);
        return { status: false, error: error.message };
    }
}

module.exports = {
    generateTaxReport,
    getTaxReportData,
    REPORT_CONFIG
};
