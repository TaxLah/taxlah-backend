 taxCode: 'LIFESTYLE' },
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

    // Calculate claimed amounts
    const claimedByCode = {};
    data.claims.forEach(claim => {
        const baseCode = claim.tax_code?.replace(/_\d{4}$/, '');
        if (!claimedByCode[baseCode]) claimedByCode[baseCode] = 0;
        claimedByCode[baseCode] += parseFloat(claim.claimed_amount) || 0;
    });

    // Table header
    drawRoundedRect(doc, startX, y, pageWidth, 24, 6, COLORS.primary);
    doc.fontSize(9).font('Helvetica-Bold').fillColor(COLORS.white);
    doc.text('Code', startX + 12, y + 7);
    doc.text('Description', startX + 55, y + 7);
    doc.text('Amount (RM)', startX + pageWidth - 85, y + 7);

    y += 24;

    let totalClaimed = 0;
    lhdnSections.forEach((section, index) => {
        if (y > doc.page.height - 60) {
            doc.addPage();
            y = 50;
            // Repeat header
            drawRoundedRect(doc, startX, y, pageWidth, 24, 6, COLORS.primary);
            doc.fontSize(9).font('Helvetica-Bold').fillColor(COLORS.white);
            doc.text('Code', startX + 12, y + 7);
            doc.text('Description', startX + 55, y + 7);
            doc.text('Amount (RM)', startX + pageWidth - 85, y + 7);
            y += 24;
        }

        const amount = claimedByCode[section.taxCode] || 0;
        totalClaimed += amount;

        const bgColor = index % 2 === 0 ? COLORS.white : COLORS.background;
        doc.rect(startX, y, pageWidth, 20).fill(bgColor);

        // Code badge
        const codeColor = amount > 0 ? COLORS.success : COLORS.grayLight;
        drawRoundedRect(doc, startX + 8, y + 3, 35, 14, 7, codeColor);
        doc.fontSize(8).font('Helvetica-Bold').fillColor(COLORS.white)
           .text(section.code, startX + 8, y + 6, { width: 35, align: 'center' });

        doc.fontSize(8).font('Helvetica').fillColor(COLORS.dark)
           .text(section.title, startX + 52, y + 6);

        doc.font(amount > 0 ? 'Helvetica-Bold' : 'Helvetica')
           .fillColor(amount > 0 ? COLORS.success : COLORS.grayLight)
           .text(amount > 0 ? formatAmount(amount) : '-', startX + pageWidth - 80, y + 6);

        y += 20;
    });

    // Total row
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
