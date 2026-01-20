/**
 * Report Controller
 * API endpoints for generating tax relief reports
 */

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const {
    DEFAULT_API_RESPONSE,
    INTERNAL_SERVER_ERROR_API_RESPONSE,
    BAD_REQUEST_API_RESPONSE,
    SUCCESS_API_RESPONSE,
    UNAUTHORIZED_API_RESPONSE,
    NOT_FOUND_API_RESPONSE,
    ERROR_UNAUTHENTICATED,
    CHECK_EMPTY
} = require('../../../configs/helper');
const { generateTaxReport, getTaxReportData, REPORT_CONFIG } = require('../../../models/AppModel/ReportGenerationServices');

/**
 * GET /api/report/types
 * Get available report types and their credits cost
 */
router.get("/types", async (req, res) => {
    let response = SUCCESS_API_RESPONSE;
    
    try {
        const types = Object.entries(REPORT_CONFIG).map(([key, config]) => ({
            type: key,
            name: config.name,
            credits: config.credits,
            features: config.features,
            description: getReportDescription(key)
        }));

        response.message = "Report types retrieved successfully.";
        response.data = types;

        res.status(response.status_code).json(response);
    } catch (error) {
        console.error("Error Get Report Types:", error);
        response = INTERNAL_SERVER_ERROR_API_RESPONSE;
        response.message = "An error occurred while retrieving report types.";
        res.status(response.status_code).json(response);
    }
});

/**
 * GET /api/report/preview/:year
 * Preview report data without generating PDF (free)
 */
router.get("/preview/:year", async (req, res) => {
    let response = DEFAULT_API_RESPONSE;
    let user = req.user || null;

    if (CHECK_EMPTY(user)) {
        response = UNAUTHORIZED_API_RESPONSE;
        response.message = ERROR_UNAUTHENTICATED;
        return res.status(response.status_code).json(response);
    }

    try {
        const taxYear = parseInt(req.params.year);

        if (isNaN(taxYear) || taxYear < 2023 || taxYear > new Date().getFullYear() + 1) {
            response = BAD_REQUEST_API_RESPONSE;
            response.message = "Invalid tax year. Must be 2023 or later.";
            return res.status(response.status_code).json(response);
        }

        const data = await getTaxReportData(user.account_id, taxYear);

        if (!data.user) {
            response = NOT_FOUND_API_RESPONSE;
            response.message = "User data not found.";
            return res.status(response.status_code).json(response);
        }

        response = SUCCESS_API_RESPONSE;
        response.message = "Report preview data retrieved successfully.";
        response.data = {
            tax_year: taxYear,
            user: {
                name: data.user.account_fullname || data.user.account_name,
                email: data.user.account_email,
                ic: data.user.account_ic
            },
            summary: {
                total_claimed: parseFloat(data.summary.total_claimed) || 0,
                max_possible: parseFloat(data.summary.max_possible) || 0,
                categories_claimed: parseInt(data.summary.categories_claimed) || 0,
                percentage_utilized: data.summary.max_possible > 0 
                    ? Math.round((data.summary.total_claimed / data.summary.max_possible) * 100) 
                    : 0
            },
            receipts_count: data.receipts.length,
            dependants_count: data.dependants.length,
            available_reports: Object.entries(REPORT_CONFIG).map(([key, config]) => ({
                type: key,
                name: config.name,
                credits: config.credits
            }))
        };

        res.status(response.status_code).json(response);
    } catch (error) {
        console.error("Error Get Report Preview:", error);
        response = INTERNAL_SERVER_ERROR_API_RESPONSE;
        response.message = "An error occurred while retrieving report preview.";
        res.status(response.status_code).json(response);
    }
});

/**
 * POST /api/report/generate
 * Generate PDF tax relief report
 * Body: { year: 2024, type: 'basic' | 'detailed' | 'premium' }
 * 
 * NOTE: In production, this should deduct credits before generating
 */
router.post("/generate", async (req, res) => {
    let response = DEFAULT_API_RESPONSE;
    let user = req.user || null;

    if (CHECK_EMPTY(user)) {
        response = UNAUTHORIZED_API_RESPONSE;
        response.message = ERROR_UNAUTHENTICATED;
        return res.status(response.status_code).json(response);
    }

    try {
        const taxYear = parseInt(req.body.year) || new Date().getFullYear();
        const reportType = req.body.type || 'basic';

        // Validate tax year
        if (taxYear < 2023 || taxYear > new Date().getFullYear() + 1) {
            response = BAD_REQUEST_API_RESPONSE;
            response.message = "Invalid tax year. Must be 2023 or later.";
            return res.status(response.status_code).json(response);
        }

        // Validate report type
        if (!REPORT_CONFIG[reportType]) {
            response = BAD_REQUEST_API_RESPONSE;
            response.message = `Invalid report type. Must be one of: ${Object.keys(REPORT_CONFIG).join(', ')}`;
            return res.status(response.status_code).json(response);
        }

        const creditsRequired = REPORT_CONFIG[reportType].credits;

        // TODO: Check user credits balance
        // const userCredits = await getUserCredits(user.account_id);
        // if (userCredits < creditsRequired) {
        //     response = BAD_REQUEST_API_RESPONSE;
        //     response.message = `Insufficient credits. Required: ${creditsRequired}, Available: ${userCredits}`;
        //     return res.status(response.status_code).json(response);
        // }

        // TODO: Deduct credits
        // await deductCredits(user.account_id, creditsRequired, 'Report Generation', reportType);

        // Generate report
        console.log(`Generating ${reportType} report for user ${user.account_id}, year ${taxYear}`);
        const result = await generateTaxReport(user.account_id, taxYear, reportType);

        if (!result.status) {
            response = INTERNAL_SERVER_ERROR_API_RESPONSE;
            response.message = result.error || "Failed to generate report.";
            return res.status(response.status_code).json(response);
        }

        // Create notification for completed report
        try {
            const { UserNotificationCreate } = require('../../../models/AppModel/Notification');
            await UserNotificationCreate({
                account_id: user.account_id,
                notification_title: '📄 Tax Report Ready',
                notification_description: `Your ${REPORT_CONFIG[reportType].name} for tax year ${taxYear} has been generated successfully and is ready for download!`,
                read_status: 'No',
                archive_status: 'No',
                status: 'Active'
            });
        } catch (notifError) {
            console.error('[Report] Failed to create notification:', notifError);
        }

        response = SUCCESS_API_RESPONSE;
        response.message = "Report generated successfully.";
        response.data = {
            report_type: reportType,
            report_name: REPORT_CONFIG[reportType].name,
            tax_year: taxYear,
            filename: result.data.filename,
            download_url: req.protocol + '://' + req.get('host') + result.data.url,
            credits_used: result.data.credits_used,
            generated_at: new Date().toISOString()
        };

        res.status(response.status_code).json(response);
    } catch (error) {
        console.error("Error Generate Report:", error);
        response = INTERNAL_SERVER_ERROR_API_RESPONSE;
        response.message = "An error occurred while generating report.";
        res.status(response.status_code).json(response);
    }
});

/**
 * GET /api/report/download/:filename
 * Download generated report
 */
router.get("/download/:filename", async (req, res) => {
    let user = req.user || null;

    if (CHECK_EMPTY(user)) {
        return res.status(401).json({
            status_code: 401,
            status: 'Unauthorized',
            message: ERROR_UNAUTHENTICATED
        });
    }

    try {
        const filename = req.params.filename;

        // Security: Validate filename format
        if (!filename.match(/^tax_report_\d{4}_\d+_\d+\.pdf$/)) {
            return res.status(400).json({
                status_code: 400,
                status: 'Bad Request',
                message: 'Invalid filename format.'
            });
        }

        // Security: Check if file belongs to user
        const fileAccountId = filename.split('_')[3];
        if (parseInt(fileAccountId) !== user.account_id) {
            return res.status(403).json({
                status_code: 403,
                status: 'Forbidden',
                message: 'Access denied.'
            });
        }

        const filepath = path.join(__dirname, '../../../assets/document', filename);

        // Check if file exists
        if (!fs.existsSync(filepath)) {
            return res.status(404).json({
                status_code: 404,
                status: 'Not Found',
                message: 'Report not found. It may have been deleted or expired.'
            });
        }

        // Send file
        res.download(filepath, filename, (err) => {
            if (err) {
                console.error("Error downloading file:", err);
                return res.status(500).json({
                    status_code: 500,
                    status: 'Error',
                    message: 'Failed to download report.'
                });
            }
        });
    } catch (error) {
        console.error("Error Download Report:", error);
        return res.status(500).json({
            status_code: 500,
            status: 'Error',
            message: 'An error occurred while downloading report.'
        });
    }
});

/**
 * GET /api/report/history
 * Get user's report generation history
 */
router.get("/history", async (req, res) => {
    let response = DEFAULT_API_RESPONSE;
    let user = req.user || null;

    if (CHECK_EMPTY(user)) {
        response = UNAUTHORIZED_API_RESPONSE;
        response.message = ERROR_UNAUTHENTICATED;
        return res.status(response.status_code).json(response);
    }

    try {
        // List generated reports from filesystem
        const documentDir = path.join(__dirname, '../../../assets/document');
        const files = fs.readdirSync(documentDir);
        
        const userReports = files
            .filter(f => f.startsWith(`tax_report_`) && f.includes(`_${user.account_id}_`) && f.endsWith('.pdf'))
            .map(filename => {
                const parts = filename.replace('.pdf', '').split('_');
                const taxYear = parts[2];
                const timestamp = parseInt(parts[4]);
                const stats = fs.statSync(path.join(documentDir, filename));
                
                return {
                    filename,
                    tax_year: parseInt(taxYear),
                    download_url: `/document/${filename}`,
                    generated_at: new Date(timestamp).toISOString(),
                    file_size: stats.size
                };
            })
            .sort((a, b) => new Date(b.generated_at) - new Date(a.generated_at));

        response = SUCCESS_API_RESPONSE;
        response.message = "Report history retrieved successfully.";
        response.data = {
            total: userReports.length,
            reports: userReports
        };

        res.status(response.status_code).json(response);
    } catch (error) {
        console.error("Error Get Report History:", error);
        response = INTERNAL_SERVER_ERROR_API_RESPONSE;
        response.message = "An error occurred while retrieving report history.";
        res.status(response.status_code).json(response);
    }
});

/**
 * DELETE /api/report/:filename
 * Delete a generated report
 */
router.delete("/:filename", async (req, res) => {
    let response = DEFAULT_API_RESPONSE;
    let user = req.user || null;

    if (CHECK_EMPTY(user)) {
        response = UNAUTHORIZED_API_RESPONSE;
        response.message = ERROR_UNAUTHENTICATED;
        return res.status(response.status_code).json(response);
    }

    try {
        const filename = req.params.filename;

        // Security: Validate filename format
        if (!filename.match(/^tax_report_\d{4}_\d+_\d+\.pdf$/)) {
            response = BAD_REQUEST_API_RESPONSE;
            response.message = 'Invalid filename format.';
            return res.status(response.status_code).json(response);
        }

        // Security: Check if file belongs to user
        const fileAccountId = filename.split('_')[3];
        if (parseInt(fileAccountId) !== user.account_id) {
            response = UNAUTHORIZED_API_RESPONSE;
            response.message = 'Access denied.';
            return res.status(response.status_code).json(response);
        }

        const filepath = path.join(__dirname, '../../../assets/document', filename);

        // Check if file exists
        if (!fs.existsSync(filepath)) {
            response = NOT_FOUND_API_RESPONSE;
            response.message = 'Report not found.';
            return res.status(response.status_code).json(response);
        }

        // Delete file
        fs.unlinkSync(filepath);

        response = SUCCESS_API_RESPONSE;
        response.message = "Report deleted successfully.";
        response.data = { filename };

        res.status(response.status_code).json(response);
    } catch (error) {
        console.error("Error Delete Report:", error);
        response = INTERNAL_SERVER_ERROR_API_RESPONSE;
        response.message = "An error occurred while deleting report.";
        res.status(response.status_code).json(response);
    }
});

/**
 * Helper function to get report description
 */
function getReportDescription(type) {
    const descriptions = {
        basic: 'Simple summary of your tax reliefs with category totals. Perfect for quick review.',
        detailed: 'Comprehensive report with category breakdown and receipts list. Great for personal records.',
        premium: 'Full LHDN-ready report with e-Filing reference codes, dependant details, and receipt index. Ideal for tax filing.'
    };
    return descriptions[type] || '';
}

module.exports = router;