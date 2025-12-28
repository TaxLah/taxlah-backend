/**
 * Dependant Model
 * Database operations for account_dependant table
 */

const db = require('../../../utils/sqlbuilder');

/**
 * Get all dependants for a user
 * @param {number} accountId - User account ID
 * @param {object} params - Optional filters { type, status }
 * @returns {object} - { status: boolean, data: array }
 */
async function getDependantsList(accountId, params = {}) {
    let result = { status: false, data: null };
    
    try {
        let whereConditions = ['account_id = ?', "status != 'Deleted'"];
        let queryParams = [accountId];

        if (params.type) {
            whereConditions.push('dependant_type = ?');
            queryParams.push(params.type);
        }

        if (params.status) {
            whereConditions.push('status = ?');
            queryParams.push(params.status);
        }

        const sql = `
            SELECT 
                dependant_id,
                dependant_name,
                dependant_fullname,
                dependant_email,
                dependant_phone,
                dependant_ic,
                dependant_gender,
                dependant_age,
                dependant_dob,
                dependant_type,
                dependant_is_disabled,
                dependant_disability_type,
                dependant_is_studying,
                dependant_education_level,
                dependant_institution_name,
                dependant_institution_country,
                status,
                created_date,
                last_modified
            FROM account_dependant
            WHERE ${whereConditions.join(' AND ')}
            ORDER BY dependant_type, dependant_name
        `;
        
        const dependants = await db.raw(sql, queryParams);
        result = { status: true, data: dependants };
    } catch (error) {
        console.error('[DependantModel] getDependantsList error:', error);
        result = { status: false, data: null, error: error.message };
    }
    
    return result;
}

/**
 * Get single dependant details
 * @param {number} dependantId - Dependant ID
 * @param {number} accountId - User account ID (for ownership verification)
 * @returns {object} - { status: boolean, data: object }
 */
async function getDependantDetails(dependantId, accountId) {
    let result = { status: false, data: null };
    
    try {
        const sql = `
            SELECT 
                dependant_id,
                dependant_name,
                dependant_fullname,
                dependant_email,
                dependant_phone,
                dependant_ic,
                dependant_gender,
                dependant_age,
                dependant_dob,
                dependant_type,
                dependant_is_disabled,
                dependant_disability_type,
                dependant_is_studying,
                dependant_education_level,
                dependant_institution_name,
                dependant_institution_country,
                status,
                created_date,
                last_modified
            FROM account_dependant
            WHERE dependant_id = ? AND account_id = ? AND status != 'Deleted'
            LIMIT 1
        `;
        
        const data = await db.raw(sql, [dependantId, accountId]);
        
        if (data.length > 0) {
            result = { status: true, data: data[0] };
        } else {
            result = { status: false, data: null, message: 'Dependant not found' };
        }
    } catch (error) {
        console.error('[DependantModel] getDependantDetails error:', error);
        result = { status: false, data: null, error: error.message };
    }
    
    return result;
}

/**
 * Create new dependant
 * @param {object} dependantData - Dependant data
 * @returns {object} - { status: boolean, data: insertId }
 */
async function createDependant(dependantData) {
    let result = { status: false, data: null };
    
    try {
        // Calculate age from DOB if provided
        if (dependantData.dependant_dob && !dependantData.dependant_age) {
            const dob = new Date(dependantData.dependant_dob);
            const today = new Date();
            let age = today.getFullYear() - dob.getFullYear();
            const monthDiff = today.getMonth() - dob.getMonth();
            if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
                age--;
            }
            dependantData.dependant_age = age;
        }

        const insertResult = await db.insert('account_dependant', dependantData);
        
        if (insertResult.insertId) {
            result = { status: true, data: insertResult.insertId };
        } else {
            result = { status: false, data: null, message: 'Failed to create dependant' };
        }
    } catch (error) {
        console.error('[DependantModel] createDependant error:', error);
        result = { status: false, data: null, error: error.message };
    }
    
    return result;
}

/**
 * Update dependant
 * @param {number} dependantId - Dependant ID
 * @param {number} accountId - User account ID (for ownership verification)
 * @param {object} updateData - Data to update
 * @returns {object} - { status: boolean, data: affectedRows }
 */
async function updateDependant(dependantId, accountId, updateData) {
    let result = { status: false, data: null };
    
    try {
        // Recalculate age if DOB is updated
        if (updateData.dependant_dob) {
            const dob = new Date(updateData.dependant_dob);
            const today = new Date();
            let age = today.getFullYear() - dob.getFullYear();
            const monthDiff = today.getMonth() - dob.getMonth();
            if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
                age--;
            }
            updateData.dependant_age = age;
        }

        // Add last_modified
        updateData.last_modified = new Date();

        const updateResult = await db.update(
            'account_dependant', 
            updateData, 
            { dependant_id: dependantId, account_id: accountId }
        );
        
        if (updateResult) {
            result = { status: true, data: updateResult };
        } else {
            result = { status: false, data: null, message: 'Failed to update dependant' };
        }
    } catch (error) {
        console.error('[DependantModel] updateDependant error:', error);
        result = { status: false, data: null, error: error.message };
    }
    
    return result;
}

/**
 * Delete dependant (soft delete)
 * @param {number} dependantId - Dependant ID
 * @param {number} accountId - User account ID (for ownership verification)
 * @returns {object} - { status: boolean, data: affectedRows }
 */
async function deleteDependant(dependantId, accountId) {
    let result = { status: false, data: null };
    
    try {
        const updateResult = await db.update(
            'account_dependant',
            { status: 'Deleted', last_modified: new Date() },
            { dependant_id: dependantId, account_id: accountId }
        );
        
        if (updateResult) {
            result = { status: true, data: updateResult };
        } else {
            result = { status: false, data: null, message: 'Failed to delete dependant' };
        }
    } catch (error) {
        console.error('[DependantModel] deleteDependant error:', error);
        result = { status: false, data: null, error: error.message };
    }
    
    return result;
}

/**
 * Get dependant statistics for a user
 * @param {number} accountId - User account ID
 * @returns {object} - Statistics
 */
async function getDependantStats(accountId) {
    let result = { status: false, data: null };
    
    try {
        const sql = `
            SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN dependant_type = 'Spouse' THEN 1 ELSE 0 END) as spouse_count,
                SUM(CASE WHEN dependant_type = 'Child' THEN 1 ELSE 0 END) as child_count,
                SUM(CASE WHEN dependant_type = 'Parent' THEN 1 ELSE 0 END) as parent_count,
                SUM(CASE WHEN dependant_type = 'Sibling' THEN 1 ELSE 0 END) as sibling_count,
                SUM(CASE WHEN dependant_is_disabled = 'Yes' THEN 1 ELSE 0 END) as disabled_count,
                SUM(CASE WHEN dependant_is_studying = 'Yes' THEN 1 ELSE 0 END) as studying_count,
                SUM(CASE WHEN dependant_type = 'Child' AND dependant_age < 18 THEN 1 ELSE 0 END) as children_under_18,
                SUM(CASE WHEN dependant_type = 'Child' AND dependant_age >= 18 AND dependant_is_studying = 'Yes' THEN 1 ELSE 0 END) as children_studying_18plus
            FROM account_dependant
            WHERE account_id = ? AND status = 'Active'
        `;
        
        const data = await db.raw(sql, [accountId]);
        
        if (data.length > 0) {
            result = { status: true, data: data[0] };
        }
    } catch (error) {
        console.error('[DependantModel] getDependantStats error:', error);
        result = { status: false, data: null, error: error.message };
    }
    
    return result;
}

/**
 * Get eligible dependants for tax relief
 * @param {number} accountId - User account ID
 * @param {string} reliefType - Type of relief (child, spouse, parent, etc.)
 * @returns {object} - { status: boolean, data: array }
 */
async function getEligibleDependantsForRelief(accountId, reliefType) {
    let result = { status: false, data: null };
    
    try {
        let sql = '';
        let params = [accountId];

        switch (reliefType) {
            case 'child_under_18':
                sql = `
                    SELECT * FROM account_dependant
                    WHERE account_id = ? 
                        AND dependant_type = 'Child' 
                        AND dependant_age < 18
                        AND status = 'Active'
                `;
                break;
            
            case 'child_studying':
                sql = `
                    SELECT * FROM account_dependant
                    WHERE account_id = ? 
                        AND dependant_type = 'Child' 
                        AND dependant_age >= 18
                        AND dependant_is_studying = 'Yes'
                        AND status = 'Active'
                `;
                break;
            
            case 'child_disabled':
                sql = `
                    SELECT * FROM account_dependant
                    WHERE account_id = ? 
                        AND dependant_type = 'Child' 
                        AND dependant_is_disabled = 'Yes'
                        AND status = 'Active'
                `;
                break;
            
            case 'spouse':
                sql = `
                    SELECT * FROM account_dependant
                    WHERE account_id = ? 
                        AND dependant_type = 'Spouse'
                        AND status = 'Active'
                `;
                break;
            
            case 'spouse_disabled':
                sql = `
                    SELECT * FROM account_dependant
                    WHERE account_id = ? 
                        AND dependant_type = 'Spouse'
                        AND dependant_is_disabled = 'Yes'
                        AND status = 'Active'
                `;
                break;
            
            case 'parent':
                sql = `
                    SELECT * FROM account_dependant
                    WHERE account_id = ? 
                        AND dependant_type = 'Parent'
                        AND status = 'Active'
                `;
                break;
            
            default:
                sql = `
                    SELECT * FROM account_dependant
                    WHERE account_id = ? AND status = 'Active'
                `;
        }

        const data = await db.raw(sql, params);
        result = { status: true, data: data };
    } catch (error) {
        console.error('[DependantModel] getEligibleDependantsForRelief error:', error);
        result = { status: false, data: null, error: error.message };
    }
    
    return result;
}

/**
 * Calculate eligible child relief amount based on dependants
 * @param {number} accountId - User account ID
 * @param {number} taxYear - Tax year
 * @returns {object} - Breakdown of child reliefs
 */
async function calculateChildReliefEligibility(accountId, taxYear) {
    let result = { status: false, data: null };
    
    try {
        const sql = `
            SELECT DISTINCT
                dependant_id,
                dependant_name,
                dependant_age,
                dependant_is_disabled,
                dependant_is_studying,
                dependant_education_level,
                dependant_institution_country
            FROM account_dependant
            WHERE account_id = ? 
                AND dependant_type = 'Child'
                AND status = 'Active'
        `;
        
        const children = await db.raw(sql, [accountId]);
        
        const reliefBreakdown = children.map(child => {
            let reliefType = '';
            let reliefAmount = 0;
            let additionalRelief = 0;

            if (child.dependant_is_disabled === 'Yes') {
                // Disabled child relief
                reliefType = 'disabled_child';
                reliefAmount = taxYear >= 2025 ? 8000 : 6000;
                
                // Additional for studying disabled child 18+
                if (child.dependant_age >= 18 && child.dependant_is_studying === 'Yes') {
                    additionalRelief = 8000;
                }
            } else if (child.dependant_age < 18) {
                // Child under 18
                reliefType = 'child_under_18';
                reliefAmount = 2000;
            } else if (child.dependant_is_studying === 'Yes') {
                // Child 18+ studying
                const educationLevel = child.dependant_education_level || '';
                
                if (['Diploma', 'Degree', 'Masters', 'Doctorate'].includes(educationLevel)) {
                    reliefType = 'child_higher_education';
                    reliefAmount = 8000;
                } else {
                    // A-Level, certificate, matriculation
                    reliefType = 'child_pre_university';
                    reliefAmount = 2000;
                }
            }

            return {
                dependant_id: child.dependant_id,
                dependant_name: child.dependant_name,
                age: child.dependant_age,
                is_disabled: child.dependant_is_disabled,
                is_studying: child.dependant_is_studying,
                education_level: child.dependant_education_level,
                relief_type: reliefType,
                relief_amount: reliefAmount,
                additional_relief: additionalRelief,
                total_relief: reliefAmount + additionalRelief
            };
        });

        const totalRelief = reliefBreakdown.reduce((sum, c) => sum + c.total_relief, 0);

        result = {
            status: true,
            data: {
                children_count: children.length,
                breakdown: reliefBreakdown,
                total_child_relief: totalRelief
            }
        };
    } catch (error) {
        console.error('[DependantModel] calculateChildReliefEligibility error:', error);
        result = { status: false, data: null, error: error.message };
    }
    
    return result;
}

module.exports = {
    getDependantsList,
    getDependantDetails,
    createDependant,
    updateDependant,
    deleteDependant,
    getDependantStats,
    getEligibleDependantsForRelief,
    calculateChildReliefEligibility
};