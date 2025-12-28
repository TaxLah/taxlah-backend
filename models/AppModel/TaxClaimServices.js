/**
 * Tax Claim Service
 * Handles tax relief claim aggregation, limit enforcement, and notifications
 */

const db = require('../../utils/sqlbuilder');

/**
 * Get user's tax claims for a specific year
 * @param {number} accountId - User account ID
 * @param {number} taxYear - Tax year (e.g., 2024)
 * @returns {object} - { status: boolean, data: array }
 */
async function getUserTaxClaims(accountId, taxYear) {
    let result = { status: false, data: null };
    
    try {
        const sql = `
            SELECT 
                atc.claim_id,
                atc.tax_year,
                atc.claimed_amount,
                atc.max_claimable,
                atc.claim_for,
                atc.claim_status,
                atc.created_date,
                tc.tax_id,
                tc.tax_code,
                tc.tax_title,
                tc.tax_description,
                tc.tax_max_claim AS category_max,
                ts.taxsub_id,
                ts.taxsub_code,
                ts.taxsub_title,
                ts.taxsub_max_claim AS subcategory_max,
                ad.dependant_id,
                ad.dependant_name,
                ad.dependant_type
            FROM account_tax_claim atc
            JOIN tax_category tc ON atc.tax_id = tc.tax_id
            LEFT JOIN tax_subcategory ts ON atc.taxsub_id = ts.taxsub_id
            LEFT JOIN account_dependant ad ON atc.dependant_id = ad.dependant_id
            WHERE atc.account_id = ? 
                AND atc.tax_year = ? 
                AND atc.status = 'Active'
            ORDER BY tc.tax_sort_order, ts.taxsub_sort_order
        `;
        
        const claims = await db.raw(sql, [accountId, taxYear]);
        result = { status: true, data: claims };
    } catch (error) {
        console.error('[TaxClaimService] getUserTaxClaims error:', error);
        result = { status: false, data: null, error: error.message };
    }
    
    return result;
}

/**
 * Get user's tax claim summary for a year
 * @param {number} accountId - User account ID
 * @param {number} taxYear - Tax year
 * @returns {object} - Summary with totals and breakdown
 */
async function getUserTaxClaimSummary(accountId, taxYear) {
    let result = { status: false, data: null };
    
    try {
        // Get total claimed amount
        const totalSql = `
            SELECT 
                COUNT(DISTINCT atc.tax_id) as categories_claimed,
                SUM(atc.claimed_amount) as total_claimed
            FROM account_tax_claim atc
            WHERE atc.account_id = ? 
                AND atc.tax_year = ? 
                AND atc.status = 'Active'
        `;
        const totalResult = await db.raw(totalSql, [accountId, taxYear]);

        // Get breakdown by category
        const breakdownSql = `
            SELECT 
                tc.tax_id,
                tc.tax_code,
                tc.tax_title,
                tc.tax_max_claim AS max_claimable,
                COALESCE(SUM(atc.claimed_amount), 0) AS claimed_amount,
                (tc.tax_max_claim - COALESCE(SUM(atc.claimed_amount), 0)) AS remaining
            FROM tax_category tc
            LEFT JOIN account_tax_claim atc ON tc.tax_id = atc.tax_id 
                AND atc.account_id = ? 
                AND atc.tax_year = ?
                AND atc.status = 'Active'
            WHERE tc.tax_year = ? AND tc.status = 'Active'
            GROUP BY tc.tax_id
            ORDER BY tc.tax_sort_order
        `;
        const breakdown = await db.raw(breakdownSql, [accountId, taxYear, taxYear]);

        // Get maximum possible relief
        const maxSql = `
            SELECT SUM(tax_max_claim) as max_possible
            FROM tax_category
            WHERE tax_year = ? AND status = 'Active'
        `;
        const maxResult = await db.raw(maxSql, [taxYear]);

        // Check for auto-claim reliefs (like individual relief)
        const autoClaimSql = `
            SELECT tax_id, tax_code, tax_title, tax_max_claim
            FROM tax_category
            WHERE tax_year = ? AND tax_is_auto_claim = 'Yes' AND status = 'Active'
        `;
        const autoClaims = await db.raw(autoClaimSql, [taxYear]);

        result = {
            status: true,
            data: {
                tax_year: taxYear,
                total_claimed: parseFloat(totalResult[0]?.total_claimed || 0),
                categories_claimed: parseInt(totalResult[0]?.categories_claimed || 0),
                max_possible_relief: parseFloat(maxResult[0]?.max_possible || 0),
                auto_claims: autoClaims,
                breakdown: breakdown.map(b => ({
                    ...b,
                    max_claimable: parseFloat(b.max_claimable),
                    claimed_amount: parseFloat(b.claimed_amount),
                    remaining: parseFloat(b.remaining),
                    percentage: b.max_claimable > 0 
                        ? Math.round((b.claimed_amount / b.max_claimable) * 100) 
                        : 0
                }))
            }
        };
    } catch (error) {
        console.error('[TaxClaimService] getUserTaxClaimSummary error:', error);
        result = { status: false, data: null, error: error.message };
    }
    
    return result;
}

/**
 * Add or update a tax claim
 * @param {object} claimData - Claim data
 * @returns {object} - Result with claim_id
 */
async function upsertTaxClaim(claimData) {
    let result = { status: false, data: null };
    
    try {
        const {
            account_id,
            tax_year,
            tax_id,
            taxsub_id = null,
            amount,
            claim_for = 'Self',
            dependant_id = null
        } = claimData;

        // Get category and subcategory limits
        const limitSql = `
            SELECT 
                tc.tax_max_claim AS category_max,
                ts.taxsub_max_claim AS subcategory_max
            FROM tax_category tc
            LEFT JOIN tax_subcategory ts ON ts.taxsub_id = ?
            WHERE tc.tax_id = ?
        `;
        const limits = await db.raw(limitSql, [taxsub_id, tax_id]);
        
        if (limits.length === 0) {
            return { status: false, message: 'Invalid tax category' };
        }

        const categoryMax = parseFloat(limits[0].category_max);
        const subcategoryMax = limits[0].subcategory_max 
            ? parseFloat(limits[0].subcategory_max) 
            : categoryMax;

        // Check existing claims for this category
        const existingSql = `
            SELECT 
                claim_id, 
                claimed_amount,
                (SELECT COALESCE(SUM(claimed_amount), 0) 
                    FROM account_tax_claim 
                    WHERE account_id = ? AND tax_year = ? AND tax_id = ? AND status = 'Active'
                ) AS total_category_claimed
            FROM account_tax_claim
            WHERE account_id = ? 
                AND tax_year = ? 
                AND tax_id = ? 
                AND (taxsub_id = ? OR (taxsub_id IS NULL AND ? IS NULL))
                AND (dependant_id = ? OR (dependant_id IS NULL AND ? IS NULL))
                AND status = 'Active'
            LIMIT 1
        `;
        const existing = await db.raw(existingSql, [
            account_id, tax_year, tax_id,
            account_id, tax_year, tax_id, 
            taxsub_id, taxsub_id,
            dependant_id, dependant_id
        ]);

        const totalCategoryClaimed = parseFloat(existing[0]?.total_category_claimed || 0);
        const existingClaimAmount = parseFloat(existing[0]?.claimed_amount || 0);

        // Calculate new total if we add this amount
        const newAmount = parseFloat(amount);
        const newTotalCategory = totalCategoryClaimed - existingClaimAmount + newAmount;
        
        // Enforce limits
        let finalAmount = newAmount;
        let limitReached = false;
        let limitMessage = null;

        // Check subcategory limit first (if applicable)
        if (subcategoryMax && newAmount > subcategoryMax) {
            finalAmount = subcategoryMax;
            limitReached = true;
            limitMessage = `Subcategory limit of RM${subcategoryMax.toFixed(2)} reached`;
        }

        // Check category limit
        if (newTotalCategory > categoryMax) {
            const allowable = categoryMax - (totalCategoryClaimed - existingClaimAmount);
            finalAmount = Math.min(finalAmount, Math.max(0, allowable));
            limitReached = true;
            limitMessage = `Category limit of RM${categoryMax.toFixed(2)} reached`;
        }

        // Upsert the claim
        if (existing.length > 0) {
            // Update existing claim
            const updateSql = `
                UPDATE account_tax_claim 
                SET claimed_amount = ?,
                    max_claimable = ?,
                    last_modified = NOW()
                WHERE claim_id = ?
            `;
            await db.raw(updateSql, [finalAmount, subcategoryMax || categoryMax, existing[0].claim_id]);
            
            result = {
                status: true,
                data: {
                    claim_id: existing[0].claim_id,
                    claimed_amount: finalAmount,
                    action: 'updated'
                },
                limit_reached: limitReached,
                limit_message: limitMessage
            };
        } else {
            // Insert new claim
            const insertData = {
                account_id,
                tax_year,
                tax_id,
                taxsub_id,
                claimed_amount: finalAmount,
                max_claimable: subcategoryMax || categoryMax,
                claim_for,
                dependant_id,
                claim_status: 'Verified', // Auto-verify as per requirement
                status: 'Active'
            };
            
            const insertResult = await db.insert('account_tax_claim', insertData);
            
            result = {
                status: true,
                data: {
                    claim_id: insertResult.insertId,
                    claimed_amount: finalAmount,
                    action: 'created'
                },
                limit_reached: limitReached,
                limit_message: limitMessage
            };
        }

    } catch (error) {
        console.error('[TaxClaimService] upsertTaxClaim error:', error);
        result = { status: false, data: null, error: error.message };
    }
    
    return result;
}

/**
 * Process receipt and update tax claims
 * @param {number} accountId - User account ID
 * @param {number} receiptId - Receipt ID
 * @param {number} taxId - Tax category ID
 * @param {number|null} taxsubId - Tax subcategory ID
 * @param {number} amount - Receipt amount
 * @param {number} taxYear - Tax year
 * @returns {object} - Result
 */
async function processReceiptForTaxClaim(accountId, receiptId, taxId, taxsubId, amount, taxYear) {
    let result = { status: false, data: null };
    
    try {
        // Create receipt-tax mapping
        const mappingData = {
            receipt_id: receiptId,
            tax_id: taxId,
            taxsub_id: taxsubId,
            mapped_amount: amount,
            confidence_score: 100, // Manual selection = 100% confidence
            is_verified: 'Yes',
            status: 'Active'
        };
        
        await db.insert('receipt_tax_mapping', mappingData);

        // Update tax claim
        const claimResult = await upsertTaxClaim({
            account_id: accountId,
            tax_year: taxYear,
            tax_id: taxId,
            taxsub_id: taxsubId,
            amount: amount,
            claim_for: 'Self'
        });

        // Check if limit reached and create notification
        if (claimResult.limit_reached) {
            await createLimitNotification(accountId, taxId, claimResult.limit_message);
        }

        result = {
            status: true,
            data: {
                receipt_id: receiptId,
                claim: claimResult.data,
                limit_reached: claimResult.limit_reached,
                limit_message: claimResult.limit_message
            }
        };
    } catch (error) {
        console.error('[TaxClaimService] processReceiptForTaxClaim error:', error);
        result = { status: false, data: null, error: error.message };
    }
    
    return result;
}

/**
 * Recalculate all tax claims for a user
 * @param {number} accountId - User account ID
 * @param {number} taxYear - Tax year
 * @returns {object} - Result
 */
async function recalculateTaxClaims(accountId, taxYear) {
    let result = { status: false, data: null };
    
    try {
        // Get all receipts with tax mappings for this user and year
        const receiptsSql = `
            SELECT 
                r.receipt_id,
                r.receipt_amount,
                rtm.tax_id,
                rtm.taxsub_id,
                rtm.mapped_amount,
                YEAR(r.created_date) as receipt_year
            FROM receipt r
            JOIN receipt_tax_mapping rtm ON r.receipt_id = rtm.receipt_id
            WHERE r.account_id = ? 
                AND YEAR(r.created_date) = ?
                AND r.status = 'Active'
                AND rtm.status = 'Active'
        `;
        const receipts = await db.raw(receiptsSql, [accountId, taxYear]);

        // Clear existing claims for recalculation
        await db.raw(
            `UPDATE account_tax_claim SET status = 'Inactive' WHERE account_id = ? AND tax_year = ?`,
            [accountId, taxYear]
        );

        // Aggregate by tax category
        const claimsByCategory = {};
        
        for (const receipt of receipts) {
            const key = `${receipt.tax_id}-${receipt.taxsub_id || 'null'}`;
            if (!claimsByCategory[key]) {
                claimsByCategory[key] = {
                    tax_id: receipt.tax_id,
                    taxsub_id: receipt.taxsub_id,
                    total: 0
                };
            }
            claimsByCategory[key].total += parseFloat(receipt.mapped_amount || receipt.receipt_amount);
        }

        // Create new claims
        const newClaims = [];
        for (const claim of Object.values(claimsByCategory)) {
            const claimResult = await upsertTaxClaim({
                account_id: accountId,
                tax_year: taxYear,
                tax_id: claim.tax_id,
                taxsub_id: claim.taxsub_id,
                amount: claim.total,
                claim_for: 'Self'
            });
            newClaims.push(claimResult);
        }

        // Add auto-claim reliefs
        await addAutoClaimReliefs(accountId, taxYear);

        result = {
            status: true,
            data: {
                receipts_processed: receipts.length,
                claims_created: newClaims.length,
                claims: newClaims
            }
        };
    } catch (error) {
        console.error('[TaxClaimService] recalculateTaxClaims error:', error);
        result = { status: false, data: null, error: error.message };
    }
    
    return result;
}

/**
 * Add auto-claim reliefs (e.g., Individual relief RM9,000)
 * @param {number} accountId - User account ID
 * @param {number} taxYear - Tax year
 */
async function addAutoClaimReliefs(accountId, taxYear) {
    try {
        const autoClaimSql = `
            SELECT tax_id, tax_max_claim
            FROM tax_category
            WHERE tax_year = ? AND tax_is_auto_claim = 'Yes' AND status = 'Active'
        `;
        const autoClaims = await db.raw(autoClaimSql, [taxYear]);

        for (const autoClaim of autoClaims) {
            await upsertTaxClaim({
                account_id: accountId,
                tax_year: taxYear,
                tax_id: autoClaim.tax_id,
                taxsub_id: null,
                amount: autoClaim.tax_max_claim,
                claim_for: 'Self'
            });
        }
    } catch (error) {
        console.error('[TaxClaimService] addAutoClaimReliefs error:', error);
    }
}

/**
 * Create notification when limit is reached
 * @param {number} accountId - User account ID
 * @param {number} taxId - Tax category ID
 * @param {string} message - Limit message
 */
async function createLimitNotification(accountId, taxId, message) {
    try {
        // Get tax category name
        const taxSql = `SELECT tax_title FROM tax_category WHERE tax_id = ?`;
        const tax = await db.raw(taxSql, [taxId]);
        const taxTitle = tax[0]?.tax_title || 'Tax Relief';

        const notificationData = {
            account_id: accountId,
            notification_title: `${taxTitle} Limit Reached`,
            notification_description: message || `You have reached the maximum claim limit for ${taxTitle}.`,
            read_status: 'No',
            archive_status: 'No',
            status: 'Active'
        };

        await db.insert('account_notification', notificationData);
    } catch (error) {
        console.error('[TaxClaimService] createLimitNotification error:', error);
    }
}

/**
 * Get remaining claimable amount for a category
 * @param {number} accountId - User account ID
 * @param {number} taxId - Tax category ID
 * @param {number} taxYear - Tax year
 * @returns {object} - { max, claimed, remaining }
 */
async function getRemainingClaimable(accountId, taxId, taxYear) {
    try {
        const sql = `
            SELECT 
                tc.tax_max_claim AS max_amount,
                COALESCE(SUM(atc.claimed_amount), 0) AS claimed_amount
            FROM tax_category tc
            LEFT JOIN account_tax_claim atc ON tc.tax_id = atc.tax_id 
                AND atc.account_id = ? 
                AND atc.tax_year = ?
                AND atc.status = 'Active'
            WHERE tc.tax_id = ?
            GROUP BY tc.tax_id
        `;
        const result = await db.raw(sql, [accountId, taxYear, taxId]);
        
        if (result.length === 0) {
            return { max: 0, claimed: 0, remaining: 0 };
        }

        const max = parseFloat(result[0].max_amount);
        const claimed = parseFloat(result[0].claimed_amount);
        
        return {
            max,
            claimed,
            remaining: Math.max(0, max - claimed)
        };
    } catch (error) {
        console.error('[TaxClaimService] getRemainingClaimable error:', error);
        return { max: 0, claimed: 0, remaining: 0 };
    }
}

module.exports = {
    getUserTaxClaims,
    getUserTaxClaimSummary,
    upsertTaxClaim,
    processReceiptForTaxClaim,
    recalculateTaxClaims,
    addAutoClaimReliefs,
    createLimitNotification,
    getRemainingClaimable
};