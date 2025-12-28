/**
 * Tax Relief Auto-Categorization Service
 * Uses wink-nlp for intelligent matching of receipts to LHDN tax categories
 */
const db = require('../../utils/sqlbuilder');

const winkNLP   = require('wink-nlp');
const model     = require('wink-eng-lite-web-model');
const nlp       = winkNLP(model);
const its       = nlp.its;
const as        = nlp.as;

/**
 * Tax Category Keywords Mapping
 * Based on LHDN YA 2024/2025 tax relief categories
 * Format: { tax_code: { subcategory_code: [keywords] } }
 */
const TAX_CATEGORY_KEYWORDS = {
    // Lifestyle - Books/Reading Materials
    'LIFESTYLE': {
        'LIFE_BOOKS': [
            'book', 'books', 'bookstore', 'novel', 'magazine', 'newspaper', 
            'journal', 'publication', 'popular', 'mph', 'kinokuniya', 'times',
            'borders', 'harris', 'big bad wolf', 'kindle', 'ebook', 'audiobook',
            'comics', 'manga', 'textbook', 'reading', 'literature'
        ],
        'LIFE_GADGETS': [
            'laptop', 'computer', 'pc', 'notebook', 'macbook', 'imac',
            'smartphone', 'phone', 'iphone', 'samsung', 'xiaomi', 'oppo', 'vivo',
            'huawei', 'realme', 'tablet', 'ipad', 'galaxy tab',
            'harvey norman', 'senheng', 'courts', 'machines', 'switch',
            'apple', 'dell', 'hp', 'asus', 'acer', 'lenovo', 'microsoft surface'
        ],
        'LIFE_INTERNET': [
            'internet', 'broadband', 'wifi', 'fibre', 'fiber',
            'unifi', 'maxis', 'celcom', 'digi', 'time', 'yes', 'u mobile',
            'astro', 'streamyx', 'data plan', 'hotspot', 'tm', 'telekom'
        ],
        'LIFE_SKILLS': [
            'course', 'class', 'training', 'workshop', 'seminar',
            'udemy', 'coursera', 'skillshare', 'linkedin learning',
            'coding', 'programming', 'language class', 'music lesson',
            'driving school', 'cooking class', 'art class', 'tutorial'
        ]
    },

    // Lifestyle - Sports
    'LIFESTYLE_SPORTS': {
        'SPORT_EQUIPMENT': [
            'badminton', 'racket', 'racquet', 'tennis', 'squash',
            'football', 'soccer', 'basketball', 'volleyball',
            'golf', 'swimming', 'goggles', 'swimsuit', 'cycling', 'bicycle',
            'running', 'shoes', 'sneakers', 'sportswear', 'jersey',
            'decathlon', 'al-ikhsan', 'sports direct', 'nike', 'adidas',
            'puma', 'under armour', 'asics', 'new balance', 'skechers',
            'yoga mat', 'dumbbell', 'weights', 'fitness equipment',
            'hiking', 'camping', 'outdoor', 'sports'
        ],
        'SPORT_FACILITY': [
            'gym', 'gymnasium', 'fitness center', 'sports complex',
            'swimming pool', 'court rental', 'field rental',
            'badminton court', 'tennis court', 'futsal', 'stadium'
        ],
        'SPORT_GYM': [
            'fitness first', 'celebrity fitness', 'anytime fitness',
            'chi fitness', 'true fitness', 'gym membership',
            'personal trainer', 'fitness class', 'yoga class', 'pilates',
            'spinning', 'crossfit', 'zumba', 'aerobics'
        ],
        'SPORT_COMPETITION': [
            'marathon', 'run', 'race', 'triathlon', 'competition',
            'tournament', 'registration fee', 'entry fee'
        ]
    },

    // Medical - Serious Diseases
    'MEDICAL_SERIOUS': {
        'MED_SERIOUS_DISEASE': [
            'hospital', 'medical center', 'specialist', 'oncology', 'cancer',
            'chemotherapy', 'radiotherapy', 'dialysis', 'kidney', 'heart',
            'surgery', 'operation', 'icu', 'ward', 'treatment',
            'gleneagles', 'pantai', 'sunway medical', 'kpj', 'prince court',
            'columbia asia', 'thomson', 'parkway', 'hospital bill'
        ],
        'MED_FERTILITY': [
            'fertility', 'ivf', 'iui', 'fertility treatment',
            'reproductive', 'infertility', 'egg freezing', 'sperm',
            'embryo', 'conception', 'fertility clinic'
        ],
        'MED_VACCINATION': [
            'vaccine', 'vaccination', 'immunization', 'immunisation',
            'flu shot', 'influenza', 'hpv', 'hepatitis', 'pneumonia',
            'covid', 'booster', 'jab', 'clinic vaccination'
        ],
        'MED_DENTAL': [
            'dental', 'dentist', 'teeth', 'tooth', 'orthodontic', 'braces',
            'scaling', 'polishing', 'filling', 'extraction', 'root canal',
            'crown', 'implant', 'denture', 'wisdom tooth', 'gum',
            'dental clinic', 'oral', 'mouth'
        ]
    },

    // Medical Examination
    'MEDICAL_EXAM': {
        'MED_EXAM_COMPLETE': [
            'health screening', 'medical checkup', 'check up', 'health check',
            'full body', 'annual checkup', 'executive screening',
            'blood test', 'urine test', 'x-ray', 'ultrasound', 'ecg',
            'comprehensive', 'preventive', 'screening package'
        ],
        'MED_EXAM_COVID': [
            'covid test', 'pcr', 'rtk', 'antigen', 'swab test',
            'covid-19', 'coronavirus', 'self test kit', 'home test'
        ],
        'MED_EXAM_MENTAL': [
            'mental health', 'psychiatrist', 'psychologist', 'counseling',
            'therapy', 'counselor', 'mental wellness', 'depression',
            'anxiety', 'stress management', 'psychological'
        ],
        'MED_EXAM_MONITOR': [
            'blood pressure monitor', 'glucometer', 'oximeter',
            'thermometer', 'health monitor', 'smart watch health',
            'fitness tracker', 'bp monitor', 'glucose meter'
        ]
    },

    // Education - Self
    'EDUCATION_SELF': {
        'EDU_PROFESSIONAL': [
            'university', 'college', 'degree', 'diploma', 'certificate',
            'professional', 'acca', 'cpa', 'cima', 'icaew',
            'bar council', 'legal', 'law school', 'accounting',
            'engineering', 'it certification', 'cisco', 'aws',
            'technical', 'vocational', 'skill certificate'
        ],
        'EDU_MASTERS_PHD': [
            'master', 'masters', 'mba', 'phd', 'doctorate', 'doctoral',
            'postgraduate', 'post-graduate', 'research degree',
            'thesis', 'dissertation'
        ],
        'EDU_UPSKILLING': [
            'upskilling', 'reskilling', 'short course', 'online course',
            'professional development', 'skill enhancement',
            'hrdf', 'psmb', 'training program'
        ]
    },

    // Parent Medical
    'PARENT_MEDICAL': {
        'PARENT_MED_TREAT': [
            'parent medical', 'elderly care', 'senior care',
            'geriatric', 'old age', 'nursing home', 'caregiver'
        ],
        'PARENT_CARER': [
            'carer', 'caretaker', 'home nurse', 'nursing service',
            'elderly care service', 'home care'
        ]
    },

    // Insurance & EPF
    'LIFE_EPF': {
        'EPF_MANDATORY': [
            'epf', 'kwsp', 'employee provident fund',
            'caruman', 'contribution'
        ],
        'LIFE_INSURANCE': [
            'life insurance', 'insurance premium', 'takaful',
            'prudential', 'aia', 'great eastern', 'allianz',
            'manulife', 'zurich', 'tokio marine', 'etiqa',
            'sun life', 'hong leong assurance', 'policy premium'
        ]
    },

    // Education & Medical Insurance
    'INSURANCE_EDU_MED': {
        'default': [
            'education insurance', 'medical insurance', 'health insurance',
            'medical card', 'hospitalisation', 'education plan',
            'child education', 'insurance education'
        ]
    },

    // SOCSO
    'SOCSO': {
        'default': [
            'socso', 'perkeso', 'social security', 'eis',
            'employment insurance', 'sip'
        ]
    },

    // PRS
    'PRS': {
        'default': [
            'prs', 'private retirement', 'retirement scheme',
            'annuity', 'deferred annuity', 'pension'
        ]
    },

    // SSPN
    'SSPN': {
        'default': [
            'sspn', 'sspn-i', 'simpanan pendidikan', 'ptptn',
            'education savings', 'national education'
        ]
    },

    // Childcare
    'CHILDCARE': {
        'default': [
            'childcare', 'daycare', 'nursery', 'kindergarten',
            'tadika', 'taska', 'preschool', 'playschool',
            'child care center', 'babysitter'
        ]
    },

    // Breastfeeding
    'BREASTFEEDING': {
        'default': [
            'breast pump', 'breastfeeding', 'nursing', 'lactation',
            'medela', 'spectra', 'philips avent', 'breast milk',
            'milk storage', 'nursing bra', 'breast pad'
        ]
    },

    // EV Charging
    'EV_CHARGING': {
        'EV_CHARGING_FACILITY': [
            'ev charger', 'electric vehicle', 'charging station',
            'wallbox', 'ev charging', 'home charger', 'tesla charger'
        ],
        'COMPOSTING_MACHINE': [
            'composting', 'composter', 'food waste', 'compost machine',
            'organic waste', 'kitchen composter'
        ]
    },

    // Disabled Equipment
    'DISABLED_EQUIPMENT': {
        'default': [
            'wheelchair', 'hearing aid', 'prosthetic', 'orthopedic',
            'walking aid', 'crutches', 'walker', 'disability equipment',
            'oku', 'disabled', 'handicap', 'mobility aid'
        ]
    }
};

/**
 * Merchant Category Mapping
 * Maps known merchant names/categories to tax categories
 */
const MERCHANT_CATEGORY_MAP = {
    // Bookstores
    'popular': { tax_code: 'LIFESTYLE', subcategory: 'LIFE_BOOKS' },
    'mph': { tax_code: 'LIFESTYLE', subcategory: 'LIFE_BOOKS' },
    'kinokuniya': { tax_code: 'LIFESTYLE', subcategory: 'LIFE_BOOKS' },
    'times bookstore': { tax_code: 'LIFESTYLE', subcategory: 'LIFE_BOOKS' },
    'big bad wolf': { tax_code: 'LIFESTYLE', subcategory: 'LIFE_BOOKS' },

    // Electronics
    'harvey norman': { tax_code: 'LIFESTYLE', subcategory: 'LIFE_GADGETS' },
    'senheng': { tax_code: 'LIFESTYLE', subcategory: 'LIFE_GADGETS' },
    'courts': { tax_code: 'LIFESTYLE', subcategory: 'LIFE_GADGETS' },
    'machines': { tax_code: 'LIFESTYLE', subcategory: 'LIFE_GADGETS' },
    'switch': { tax_code: 'LIFESTYLE', subcategory: 'LIFE_GADGETS' },
    'apple store': { tax_code: 'LIFESTYLE', subcategory: 'LIFE_GADGETS' },

    // Telcos
    'maxis': { tax_code: 'LIFESTYLE', subcategory: 'LIFE_INTERNET' },
    'celcom': { tax_code: 'LIFESTYLE', subcategory: 'LIFE_INTERNET' },
    'digi': { tax_code: 'LIFESTYLE', subcategory: 'LIFE_INTERNET' },
    'unifi': { tax_code: 'LIFESTYLE', subcategory: 'LIFE_INTERNET' },
    'time': { tax_code: 'LIFESTYLE', subcategory: 'LIFE_INTERNET' },
    'tm': { tax_code: 'LIFESTYLE', subcategory: 'LIFE_INTERNET' },

    // Sports
    'decathlon': { tax_code: 'LIFESTYLE_SPORTS', subcategory: 'SPORT_EQUIPMENT' },
    'al-ikhsan': { tax_code: 'LIFESTYLE_SPORTS', subcategory: 'SPORT_EQUIPMENT' },
    'sports direct': { tax_code: 'LIFESTYLE_SPORTS', subcategory: 'SPORT_EQUIPMENT' },
    'fitness first': { tax_code: 'LIFESTYLE_SPORTS', subcategory: 'SPORT_GYM' },
    'celebrity fitness': { tax_code: 'LIFESTYLE_SPORTS', subcategory: 'SPORT_GYM' },
    'anytime fitness': { tax_code: 'LIFESTYLE_SPORTS', subcategory: 'SPORT_GYM' },

    // Medical
    'sunway medical': { tax_code: 'MEDICAL_SERIOUS', subcategory: 'MED_SERIOUS_DISEASE' },
    'gleneagles': { tax_code: 'MEDICAL_SERIOUS', subcategory: 'MED_SERIOUS_DISEASE' },
    'pantai hospital': { tax_code: 'MEDICAL_SERIOUS', subcategory: 'MED_SERIOUS_DISEASE' },
    'kpj': { tax_code: 'MEDICAL_SERIOUS', subcategory: 'MED_SERIOUS_DISEASE' },
    'columbia asia': { tax_code: 'MEDICAL_SERIOUS', subcategory: 'MED_SERIOUS_DISEASE' },

    // Insurance
    'prudential': { tax_code: 'LIFE_EPF', subcategory: 'LIFE_INSURANCE' },
    'aia': { tax_code: 'LIFE_EPF', subcategory: 'LIFE_INSURANCE' },
    'great eastern': { tax_code: 'LIFE_EPF', subcategory: 'LIFE_INSURANCE' },
    'allianz': { tax_code: 'LIFE_EPF', subcategory: 'LIFE_INSURANCE' },
    'etiqa': { tax_code: 'LIFE_EPF', subcategory: 'LIFE_INSURANCE' },

    // Childcare
    'tadika': { tax_code: 'CHILDCARE', subcategory: 'default' },
    'taska': { tax_code: 'CHILDCARE', subcategory: 'default' },
    'little caliphs': { tax_code: 'CHILDCARE', subcategory: 'default' },
    'q-dees': { tax_code: 'CHILDCARE', subcategory: 'default' },
};

/**
 * Extract tokens from text using NLP
 * @param {string} text - Input text
 * @returns {string[]} - Array of normalized tokens
 */
function extractTokens(text) {
    if (!text || typeof text !== 'string') return [];
    
    const doc = nlp.readDoc(text.toLowerCase());
    const tokens = doc.tokens()
        .filter(t => t.out(its.type) === 'word' && t.out(its.stopWordFlag) === false)
        .out(its.normal);
    
    return tokens;
}

/**
 * Calculate similarity score between two strings
 * Uses Levenshtein distance for fuzzy matching
 * @param {string} str1 
 * @param {string} str2 
 * @returns {number} - Score between 0 and 1
 */
function calculateSimilarity(str1, str2) {
    if (!str1 || !str2) return 0;
    
    str1 = str1.toLowerCase();
    str2 = str2.toLowerCase();
    
    if (str1 === str2) return 1;
    if (str1.includes(str2) || str2.includes(str1)) return 0.9;
    
    // Simple Levenshtein implementation
    const matrix = [];
    const len1 = str1.length;
    const len2 = str2.length;
    
    if (len1 === 0) return 0;
    if (len2 === 0) return 0;
    
    for (let i = 0; i <= len1; i++) {
        matrix[i] = [i];
    }
    for (let j = 0; j <= len2; j++) {
        matrix[0][j] = j;
    }
    
    for (let i = 1; i <= len1; i++) {
        for (let j = 1; j <= len2; j++) {
            const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
            matrix[i][j] = Math.min(
                matrix[i - 1][j] + 1,
                matrix[i][j - 1] + 1,
                matrix[i - 1][j - 1] + cost
            );
        }
    }
    
    const distance = matrix[len1][len2];
    const maxLen = Math.max(len1, len2);
    return 1 - (distance / maxLen);
}

/**
 * Match text against keyword list with fuzzy matching
 * @param {string[]} tokens - Extracted tokens
 * @param {string[]} keywords - Keywords to match against
 * @returns {object} - { matches: number, score: number }
 */
function matchKeywords(tokens, keywords) {
    let matches = 0;
    let totalScore = 0;
    
    for (const token of tokens) {
        for (const keyword of keywords) {
            const similarity = calculateSimilarity(token, keyword);
            if (similarity >= 0.8) {
                matches++;
                totalScore += similarity;
                break; // Count each token only once
            }
        }
    }
    
    return { 
        matches, 
        score: tokens.length > 0 ? totalScore / tokens.length : 0 
    };
}

/**
 * Categorize receipt to tax category
 * @param {object} receiptData - Receipt data from Azure OCR
 * @param {number} taxYear - Tax year (default: current year)
 * @returns {object} - Categorization result
 */
async function categorizeReceipt(receiptData, taxYear = new Date().getFullYear()) {
    const result = {
        success: false,
        tax_code: null,
        subcategory_code: null,
        confidence: 0,
        matched_keywords: [],
        suggestions: [],
        message: ''
    };

    try {
        // Extract text from receipt data
        const merchantName  = receiptData.MerchantName?.content || receiptData.MerchantName || '';
        const items         = receiptData.Items?.values || receiptData.Items || [];
        
        // Build searchable text
        let searchText = merchantName;
        
        if (Array.isArray(items)) {
            items.forEach(item => {
                if (item.properties?.Description?.content) {
                    searchText += ' ' + item.properties.Description.content;
                } else if (typeof item === 'string') {
                    searchText += ' ' + item;
                } else if (item.name || item.description) {
                    searchText += ' ' + (item.name || '') + ' ' + (item.description || '');
                }
            });
        }

        console.log('[TaxCategorizationService] Search text:', searchText);

        // Step 1: Check merchant name against known merchants
        const merchantLower = merchantName.toLowerCase();
        for (const [merchant, mapping] of Object.entries(MERCHANT_CATEGORY_MAP)) {
            if (merchantLower.includes(merchant)) {
                result.success = true;
                result.tax_code = mapping.tax_code;
                result.subcategory_code = mapping.subcategory;
                result.confidence = 95;
                result.matched_keywords = [merchant];
                result.message = `Matched known merchant: ${merchant}`;
                return result;
            }
        }

        // Step 2: Extract tokens and match against keywords
        const tokens = extractTokens(searchText);
        console.log('[TaxCategorizationService] Extracted tokens:', tokens);

        const categoryScores = [];

        for (const [taxCode, subcategories] of Object.entries(TAX_CATEGORY_KEYWORDS)) {
            for (const [subCode, keywords] of Object.entries(subcategories)) {
                const { matches, score } = matchKeywords(tokens, keywords);
                
                if (matches > 0) {
                    // Find which keywords matched
                    const matchedKeywords = keywords.filter(kw => 
                        tokens.some(t => calculateSimilarity(t, kw) >= 0.8)
                    );

                    categoryScores.push({
                        tax_code: taxCode,
                        subcategory_code: subCode === 'default' ? null : subCode,
                        matches,
                        score,
                        confidence: Math.min(95, Math.round(score * 100 + matches * 10)),
                        matched_keywords: matchedKeywords
                    });
                }
            }
        }

        // Sort by confidence (descending)
        categoryScores.sort((a, b) => b.confidence - a.confidence);

        if (categoryScores.length > 0) {
            const best = categoryScores[0];
            result.success = true;
            result.tax_code = best.tax_code;
            result.subcategory_code = best.subcategory_code;
            result.confidence = best.confidence;
            result.matched_keywords = best.matched_keywords;
            result.suggestions = categoryScores.slice(0, 3); // Top 3 suggestions
            result.message = `Matched ${best.matches} keyword(s)`;
        } else {
            result.success = false;
            result.message = 'No matching tax category found. Please select manually.';
        }

    } catch (error) {
        console.error('[TaxCategorizationService] Error:', error);
        result.success = false;
        result.message = 'Error during categorization: ' + error.message;
    }

    return result;
}

/**
 * Get tax category details by code
 * @param {string} taxCode - Tax category code
 * @param {number} taxYear - Tax year
 * @returns {object|null} - Tax category info
 */
async function getTaxCategoryByCode(taxCode, taxYear = 2024) {
    try {
        const sql = `
            SELECT tax_id, tax_code, tax_title, tax_max_claim, tax_claim_for
            FROM tax_category 
            WHERE tax_code LIKE ? AND tax_year = ? AND status = 'Active'
            LIMIT 1
        `;
        const result = await db.raw(sql, [`${taxCode}%`, taxYear]);
        return result.length > 0 ? result[0] : null;
    } catch (error) {
        console.error('[TaxCategorizationService] getTaxCategoryByCode error:', error);
        return null;
    }
}

/**
 * Get tax subcategory details by code
 * @param {string} subCode - Subcategory code
 * @param {number} taxId - Parent tax category ID
 * @returns {object|null} - Subcategory info
 */
async function getTaxSubcategoryByCode(subCode, taxId) {
    try {
        const sql = `
            SELECT taxsub_id, taxsub_code, taxsub_title, taxsub_max_claim
            FROM tax_subcategory 
            WHERE taxsub_code LIKE ? AND tax_id = ? AND status = 'Active'
            LIMIT 1
        `;
        const result = await db.raw(sql, [`${subCode}%`, taxId]);
        return result.length > 0 ? result[0] : null;
    } catch (error) {
        console.error('[TaxCategorizationService] getTaxSubcategoryByCode error:', error);
        return null;
    }
}

/**
 * Full categorization with database lookup
 * @param {object} receiptData - Receipt data from Azure OCR
 * @param {number} taxYear - Tax year
 * @returns {object} - Complete categorization with tax_id and taxsub_id
 */
async function categorizeReceiptFull(receiptData, taxYear = 2024) {
    // Get basic categorization
    const categorization = await categorizeReceipt(receiptData, taxYear);
    
    if (!categorization.success) {
        return categorization;
    }

    // Look up actual database IDs
    const taxCategory = await getTaxCategoryByCode(categorization.tax_code, taxYear);
    
    if (taxCategory) {
        categorization.tax_id = taxCategory.tax_id;
        categorization.tax_title = taxCategory.tax_title;
        categorization.tax_max_claim = taxCategory.tax_max_claim;
        
        if (categorization.subcategory_code) {
            const subCategory = await getTaxSubcategoryByCode(
                categorization.subcategory_code, 
                taxCategory.tax_id
            );
            
            if (subCategory) {
                categorization.taxsub_id = subCategory.taxsub_id;
                categorization.taxsub_title = subCategory.taxsub_title;
                categorization.taxsub_max_claim = subCategory.taxsub_max_claim;
            }
        }
    }

    return categorization;
}

module.exports = {
    categorizeReceipt,
    categorizeReceiptFull,
    getTaxCategoryByCode,
    getTaxSubcategoryByCode,
    extractTokens,
    TAX_CATEGORY_KEYWORDS,
    MERCHANT_CATEGORY_MAP
};