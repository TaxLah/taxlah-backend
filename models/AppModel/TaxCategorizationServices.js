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

const TAX_CATEGORY_KEYWORDS = {
    // ============================================
    // LIFESTYLE - Books/Reading Materials (RM2,500 limit shared)
    // ============================================
    'LIFESTYLE': {
        'LIFE_BOOKS': [
            // Generic book terms
            'book', 'books', 'bookstore', 'novel', 'magazine', 'newspaper',
            'journal', 'publication', 'ebook', 'audiobook', 'comics', 'manga',
            'textbook', 'reading', 'literature', 'encyclopedia', 'dictionary',
            'reference book', 'study guide', 'workbook', 'storybook',
            
            // Malaysian bookstore chains
            'popular', 'popular bookstore', 'mph', 'mph bookstore', 'kinokuniya',
            'times bookstore', 'borders', 'harris', 'big bad wolf', 'bookxcess',
            'bookalicious', 'lit books', 'gerakbudaya', 'silverfish',
            
            // Online book platforms
            'kindle', 'audible', 'scribd', 'storytel', 'kobo', 'google books',
            'apple books', 'rakuten kobo',
            
            // Digital news subscriptions
            'the star', 'new straits times', 'nst', 'berita harian', 'utusan',
            'malay mail', 'malaysiakini', 'the edge', 'sin chew', 'nanyang',
            'china press', 'tamil nesan', 'makkal osai', 'bernama',
            'the malaysian insight', 'free malaysia today', 'says'
        ],
        
        'LIFE_GADGETS': [
            // Device types
            'laptop', 'computer', 'pc', 'notebook', 'desktop', 'macbook', 'imac',
            'smartphone', 'phone', 'mobile', 'iphone', 'android', 'tablet', 'ipad',
            'galaxy tab', 'chromebook', 'ultrabook', 'workstation',
            
            // Phone brands popular in Malaysia
            'samsung', 'xiaomi', 'oppo', 'vivo', 'huawei', 'realme', 'honor',
            'oneplus', 'asus rog', 'poco', 'infinix', 'tecno', 'zte', 'sony xperia',
            'google pixel', 'nothing phone', 'redmi',
            
            // Computer brands
            'apple', 'dell', 'hp', 'hewlett packard', 'asus', 'acer', 'lenovo',
            'microsoft surface', 'msi', 'razer', 'gigabyte', 'toshiba', 'fujitsu',
            
            // Malaysian electronics retailers
            'harvey norman', 'senheng', 'courts', 'machines', 'switch', 'directd',
            'urbanfox', 'all it hypermarket', 'thunder match', 'pc image',
            'viewnet', 'ideal tech', 'e-gadget', 'mac studio', 'epicentre',
            
            // IT malls/areas
            'plaza low yat', 'low yat', 'digital mall', 'all it', 'imago',
            'lowyat plaza', 'digital lifestyle', 'i-tech',
            
            // Online electronics
            'shopee electronics', 'lazada electronics', 'official store'
        ],
        
        'LIFE_INTERNET': [
            // Generic terms
            'internet', 'broadband', 'wifi', 'wi-fi', 'fibre', 'fiber', 'wireless',
            'data plan', 'hotspot', 'internet subscription', 'home internet',
            'internet bill', 'broadband bill', 'monthly internet',
            
            // Malaysian telcos & ISPs
            'unifi', 'tm', 'telekom malaysia', 'maxis', 'maxis fibre', 'celcom',
            'digi', 'yes', 'yes 4g', 'yes 5g', 'u mobile', 'umobile',
            'time', 'time fibre', 'time internet', 'astro', 'allo',
            
            // Mobile data plans
            'postpaid', 'prepaid', 'hotlink', 'xpax', 'yoodo', 'tune talk',
            'redone', 'altel', 'toneexcel',
            
            // Specific plan names
            'unifi mobile', 'unifi air', 'maxis hotlink', 'celcom xpax',
            'digi postpaid', 'digi prepaid', 'umobile gx'
        ],
        
        'LIFE_SKILLS': [
            // Generic course terms
            'course', 'class', 'training', 'workshop', 'seminar', 'webinar',
            'tutorial', 'lesson', 'certification', 'online learning',
            
            // Online learning platforms
            'udemy', 'coursera', 'skillshare', 'linkedin learning', 'edx',
            'masterclass', 'pluralsight', 'codecademy', 'datacamp', 'treehouse',
            'khan academy', 'brilliant', 'domestika',
            
            // Skill types
            'coding', 'programming', 'language class', 'music lesson',
            'driving school', 'cooking class', 'art class', 'photography class',
            'digital marketing', 'graphic design', 'video editing', 'sewing class',
            'baking class', 'barista course', 'first aid course',
            
            // Malaysian training providers
            'british council', 'walls street english', 'erican', 'eduspec',
            'crescendo', 'elc', 'ymca', 'ywca'
        ]
    },

    // ============================================
    // LIFESTYLE SPORTS (RM1,000 limit)
    // ============================================
    'LIFESTYLE_SPORTS': {
        'SPORT_EQUIPMENT': [
            // Racket sports
            'badminton', 'racket', 'racquet', 'shuttlecock', 'tennis', 'squash',
            'table tennis', 'ping pong', 'pickleball',
            
            // Ball sports
            'football', 'soccer', 'basketball', 'volleyball', 'futsal',
            'rugby', 'cricket', 'hockey', 'sepak takraw', 'netball',
            
            // Individual sports
            'golf', 'golf club', 'golf ball', 'swimming', 'goggles', 'swimsuit',
            'swimming cap', 'cycling', 'bicycle', 'bike', 'running', 'jogging',
            'marathon', 'athletics', 'archery', 'bowling', 'dart',
            
            // Footwear & apparel
            'sports shoes', 'running shoes', 'sneakers', 'sportswear', 'jersey',
            'track pants', 'sports bra', 'compression', 'athletic wear',
            
            // Brands popular in Malaysia
            'nike', 'adidas', 'puma', 'under armour', 'asics', 'new balance',
            'skechers', 'reebok', 'fila', 'mizuno', 'yonex', 'li-ning',
            'victor', 'apacs', 'fleet', 'wilson', 'head', 'babolat',
            'decathlon', 'quechua', 'domyos', 'kipsta', 'artengo',
            
            // Malaysian sports retailers
            'decathlon', 'al-ikhsan', 'al ikhsan', 'alikhsan', 'sports direct',
            'jd sports', 'foot locker', 'royal sporting house', 'rsh',
            'supersports', 'stadium', 'hoops station', 'running lab',
            'the athletes foot', 'sportsclick', 'pentathlon',
            
            // Equipment
            'yoga mat', 'dumbbell', 'weights', 'fitness equipment', 'kettlebell',
            'resistance band', 'skipping rope', 'jump rope', 'exercise ball',
            'foam roller', 'pull up bar', 'treadmill', 'exercise bike',
            
            // Outdoor sports
            'hiking', 'camping', 'outdoor', 'climbing', 'trekking',
            'kayak', 'snorkeling', 'diving', 'scuba', 'surfing',
            'skateboard', 'rollerblade', 'inline skate'
        ],
        
        'SPORT_FACILITY': [
            // Generic facilities
            'gym', 'gymnasium', 'fitness center', 'fitness centre',
            'sports complex', 'sports centre', 'stadium', 'arena',
            
            // Specific facilities
            'swimming pool', 'court rental', 'field rental', 'pitch rental',
            'badminton court', 'tennis court', 'futsal court', 'basketball court',
            'squash court', 'golf course', 'driving range', 'bowling alley',
            'ice skating rink', 'rock climbing', 'bouldering',
            
            // Malaysian facilities
            'national sports complex', 'kompleks sukan', 'dewan serbaguna',
            'pusat sukan', 'stadium bukit jalil', 'axiata arena',
            'mpsj sports complex', 'dbkl sports'
        ],
        
        'SPORT_GYM': [
            // Major gym chains in Malaysia
            'fitness first', 'celebrity fitness', 'anytime fitness',
            'chi fitness', 'true fitness', 'jatomi', 'gofit', 'firefit',
            'fire fit', 'believe fitness', 'peak fitness', 'koa fitness',
            'babel fit', 'ff', 'evolve fitness', 'energy fitness',
            
            // Gym services
            'gym membership', 'personal trainer', 'pt session',
            'fitness class', 'group class', 'gym subscription',
            
            // Specific classes
            'yoga', 'yoga class', 'pilates', 'spinning', 'spin class',
            'crossfit', 'zumba', 'aerobics', 'body combat', 'body pump',
            'hiit', 'circuit training', 'strength training', 'functional training',
            'kickboxing', 'muay thai', 'boxing', 'martial arts',
            
            // Boutique studios
            'yoga studio', 'pilates studio', 'barre', 'f45', 'barry bootcamp',
            'orangetheory', 'rev cycle', 'flyproject'
        ],
        
        'SPORT_COMPETITION': [
            // Event types
            'marathon', 'half marathon', 'fun run', '5k run', '10k run',
            'race', 'triathlon', 'duathlon', 'competition', 'tournament',
            'championship', 'league',
            
            // Registration
            'registration fee', 'entry fee', 'race kit', 'race bib',
            'event registration', 'sports event',
            
            // Malaysian events
            'klscm', 'kl marathon', 'penang bridge marathon', 'twincity marathon',
            'standard chartered marathon', 'borneo marathon', 'melaka marathon',
            'taiping marathon', 'ipoh marathon', 'perhentian swim',
            'langkawi triathlon', 'powerman', 'ironman'
        ]
    },

    // ============================================
    // MEDICAL - Serious Diseases (RM10,000 limit)
    // ============================================
    'MEDICAL_SERIOUS': {
        'MED_SERIOUS_DISEASE': [
            // Generic medical terms
            'hospital', 'medical center', 'medical centre', 'specialist',
            'surgery', 'operation', 'treatment', 'therapy', 'procedure',
            'inpatient', 'admission', 'ward', 'icu', 'intensive care',
            
            // Serious diseases
            'cancer', 'oncology', 'chemotherapy', 'radiotherapy', 'radiation',
            'tumour', 'tumor', 'malignant', 'carcinoma', 'leukemia', 'lymphoma',
            'dialysis', 'kidney failure', 'renal', 'heart attack', 'cardiac',
            'stroke', 'coronary', 'bypass', 'angioplasty', 'stent',
            'parkinson', 'alzheimer', 'dementia', 'multiple sclerosis',
            'organ transplant', 'transplantation',
            
            // Major private hospitals in Malaysia
            'gleneagles', 'gleneagles kl', 'gleneagles penang', 'gleneagles johor',
            'pantai hospital', 'pantai kl', 'pantai cheras', 'pantai ampang',
            'pantai bangsar', 'pantai klang', 'pantai ipoh', 'pantai penang',
            'sunway medical', 'sunway medical centre', 'sunway velocity',
            'kpj', 'kpj specialist', 'kpj ampang', 'kpj damansara', 'kpj tawakkal',
            'kpj kajang', 'kpj klang', 'kpj selangor', 'kpj johor', 'kpj penang',
            'prince court', 'prince court medical',
            'columbia asia', 'columbia asia hospital',
            'thomson hospital', 'thomson kota damansara',
            'subang jaya medical centre', 'sjmc',
            'assunta hospital', 'assunta',
            'island hospital', 'lam wah ee', 'loh guan lye',
            'mahkota medical', 'mahkota melaka',
            
            // Heart specialists
            'ijn', 'institut jantung negara', 'national heart institute',
            'cvskl', 'cardiac vascular sentral',
            
            // Other private hospitals
            'tung shin', 'tawakal', 'pusrawi', 'damai service hospital',
            'parkcity medical', 'beacon hospital', 'ara damansara medical',
            'metro specialist', 'sime darby medical', 'ramsay sime darby',
            'regency specialist', 'dsh hospital', 'hospital pakar',
            'hospital specialist', 'pusat perubatan'
        ],
        
        'MED_FERTILITY': [
            // Treatment types
            'fertility', 'fertility treatment', 'ivf', 'in vitro', 'iui',
            'icsi', 'infertility', 'reproductive', 'conception',
            'egg freezing', 'sperm', 'embryo', 'assisted reproduction',
            'ovulation', 'hormone therapy',
            
            // Malaysian fertility centres
            'fertility clinic', 'ivf centre', 'ivf center',
            'sunfert', 'alpha fertility', 'kl fertility',
            'genesis ivf', 'tropicana fertility', 'tmc fertility'
        ],
        
        'MED_VACCINATION': [
            // Generic vaccination terms
            'vaccine', 'vaccination', 'immunization', 'immunisation',
            'jab', 'booster', 'shot',
            
            // Specific vaccines
            'flu shot', 'flu vaccine', 'influenza', 'hpv', 'hpv vaccine',
            'hepatitis', 'hepatitis b', 'pneumonia', 'pneumococcal',
            'covid', 'covid-19', 'covid vaccine', 'moderna', 'pfizer',
            'astrazeneca', 'sinovac', 'mmr', 'dtap', 'tetanus',
            'meningitis', 'typhoid', 'rabies', 'yellow fever',
            'chickenpox', 'varicella', 'shingles', 'herpes zoster',
            
            // Vaccination services
            'clinic vaccination', 'travel vaccine', 'immunisation schedule',
            'child vaccination', 'baby vaccination'
        ],
        
        'MED_DENTAL': [
            // Generic dental terms
            'dental', 'dentist', 'teeth', 'tooth', 'oral', 'mouth', 'gum',
            'dental clinic', 'dental care', 'dental treatment',
            
            // Treatments
            'orthodontic', 'braces', 'invisalign', 'clear aligner',
            'scaling', 'polishing', 'cleaning', 'filling', 'extraction',
            'root canal', 'crown', 'implant', 'dental implant', 'denture',
            'wisdom tooth', 'wisdom teeth', 'whitening', 'veneer',
            'gum treatment', 'periodontal',
            
            // Malaysian dental chains
            'dentalpro', 'tiew dental', 'chai dental', 'kdc dental',
            'smile dental', 'premier dental', 'idc dental',
            'dr smile', 'dental focus', 'toothsome', 'pristine dental'
        ]
    },

    // ============================================
    // MEDICAL EXAMINATION (RM1,000 limit within RM10,000 medical)
    // ============================================
    'MEDICAL_EXAM': {
        'MED_EXAM_COMPLETE': [
            // Generic terms
            'health screening', 'medical checkup', 'medical check-up',
            'check up', 'health check', 'full body checkup', 'annual checkup',
            'executive screening', 'comprehensive screening',
            'preventive screening', 'screening package', 'wellness check',
            
            // Specific tests
            'blood test', 'urine test', 'x-ray', 'ultrasound', 'ecg',
            'echocardiogram', 'mri', 'ct scan', 'pap smear', 'mammogram',
            'colonoscopy', 'endoscopy', 'bone density', 'dexa scan',
            'treadmill test', 'stress test', 'liver function', 'kidney function',
            'thyroid test', 'lipid profile', 'glucose test', 'hba1c',
            
            // Health screening providers
            'bp healthcare', 'bphc', 'pantai premier pathology', 'ppp',
            'pathlab', 'lablink', 'clinipath', 'quest diagnostics',
            'gribbles pathology', 'qualitas health', 'mediviron'
        ],
        
        'MED_EXAM_COVID': [
            // Test types
            'covid test', 'covid-19 test', 'pcr', 'pcr test', 'rtk',
            'rtk-ag', 'rtk antigen', 'antigen test', 'swab test',
            'coronavirus test', 'rapid test', 'self test kit', 'home test',
            'saliva test'
        ],
        
        'MED_EXAM_MENTAL': [
            // Generic terms
            'mental health', 'psychological', 'psychiatric',
            'counseling', 'counselling', 'therapy session',
            'mental wellness', 'emotional wellness',
            
            // Professionals
            'psychiatrist', 'psychologist', 'counselor', 'counsellor',
            'therapist', 'clinical psychologist',
            
            // Conditions
            'depression', 'anxiety', 'stress management', 'stress',
            'bipolar', 'adhd', 'autism', 'learning disability',
            'ocd', 'ptsd', 'eating disorder', 'addiction',
            
            // Malaysian mental health services
            'mentari', 'befrienders', 'relate', 'sols health',
            'hospital bahagia', 'hospital permai', 'tanjung rambutan'
        ],
        
        'MED_EXAM_MONITOR': [
            // Monitoring devices
            'blood pressure monitor', 'bp monitor', 'sphygmomanometer',
            'glucometer', 'glucose meter', 'blood glucose monitor',
            'oximeter', 'pulse oximeter', 'thermometer', 'digital thermometer',
            'health monitor', 'blood pressure machine',
            
            // Smart health devices
            'smart watch health', 'fitness tracker', 'health tracker',
            'apple watch', 'garmin', 'fitbit', 'samsung galaxy watch',
            'mi band', 'amazfit', 'huawei watch',
            
            // Other medical devices
            'nebulizer', 'inhaler', 'cpap', 'tens machine'
        ]
    },

    // ============================================
    // EDUCATION - Self (RM7,000 limit)
    // ============================================
    'EDUCATION_SELF': {
        'EDU_PROFESSIONAL': [
            // Degree types
            'university', 'college', 'degree', 'diploma', 'certificate',
            'bachelor', 'undergraduate', 'foundation', 'matriculation',
            'professional qualification', 'professional exam',
            
            // Accounting & finance
            'acca', 'cpa', 'cima', 'icaew', 'micpa', 'cfa', 'cfp',
            'cta', 'tax qualification', 'accounting qualification',
            
            // Legal
            'bar council', 'clp', 'legal', 'law degree', 'llb', 'llm',
            'bar exam', 'legal practice',
            
            // IT certifications
            'cisco', 'ccna', 'ccnp', 'aws', 'azure', 'google cloud',
            'comptia', 'pmp', 'prince2', 'itil', 'scrum master',
            'oracle', 'sap', 'salesforce', 'microsoft certified',
            
            // Engineering
            'engineering', 'iem', 'bem', 'technical certification',
            'p.eng', 'ir.', 'professional engineer',
            
            // Medical/Healthcare
            'medical degree', 'mbbs', 'nursing', 'pharmacy degree',
            'physiotherapy', 'radiography', 'medical lab',
            
            // Malaysian universities (for reference)
            'um', 'ukm', 'usm', 'upm', 'utm', 'uia', 'uitm', 'unimas',
            'ums', 'umt', 'upsi', 'uthm', 'unimap', 'utar', 'monash',
            'nottingham', 'taylor', 'sunway', 'inti', 'help', 'ucsi',
            'mmu', 'limkokwing', 'segi', 'kdu', 'apu'
        ],
        
        'EDU_MASTERS_PHD': [
            // Postgraduate degrees
            'master', 'masters', 'mba', 'msc', 'ma', 'mphil',
            'phd', 'doctorate', 'doctoral', 'dba',
            'postgraduate', 'post-graduate', 'graduate studies',
            'research degree', 'thesis', 'dissertation',
            'doctoral program', 'masters program'
        ],
        
        'EDU_UPSKILLING': [
            // Generic terms (RM2,000 sub-limit)
            'upskilling', 'reskilling', 'short course', 'online course',
            'professional development', 'skill enhancement',
            'continuing education', 'executive education', 'bootcamp',
            
            // Government programs
            'hrdf', 'hrdc', 'psmb', 'skim latihan', 'sldn',
            'skills training', 'tekun', 'mara',
            
            // Course types
            'digital skills', 'data analytics', 'artificial intelligence',
            'machine learning', 'cybersecurity', 'cloud computing',
            'business analytics', 'project management', 'leadership',
            'communication skills', 'presentation skills'
        ]
    },

    // ============================================
    // PARENT MEDICAL (RM8,000 limit)
    // ============================================
    'PARENT_MEDICAL': {
        'PARENT_MED_TREAT': [
            // Medical care for parents
            'parent medical', 'parents medical', 'ibu medical', 'bapa medical',
            'elderly care', 'senior care', 'geriatric', 'old age care',
            'parent treatment', 'parent hospital', 'parent checkup',
            'parent health screening', 'parent dental',
            
            // Parent medical examination
            'parent medical exam', 'mother checkup', 'father checkup',
            'elderly health screening', 'senior health check'
        ],
        
        'PARENT_CARER': [
            // Caregiver services
            'carer', 'caretaker', 'caregiver', 'home nurse', 'nursing service',
            'elderly care service', 'home care', 'senior home care',
            'nursing home', 'old folks home', 'retirement home',
            'assisted living', 'pusat jagaan',
            
            // Malaysian elderly care
            'rumah seri kenangan', 'rumah ehsan', 'rumah orang tua',
            'jaga orang tua', 'penjaga warga emas'
        ]
    },

    // ============================================
    // LIFE INSURANCE & EPF (RM7,000 limit)
    // ============================================
    'LIFE_EPF': {
        'EPF_MANDATORY': [
            // EPF/KWSP
            'epf', 'kwsp', 'employee provident fund',
            'kumpulan wang simpanan pekerja', 'epf contribution',
            'caruman', 'caruman kwsp', 'kwsp contribution',
            'i-akaun', 'i-saraan', 'i-suri'
        ],
        
        'LIFE_INSURANCE': [
            // Generic terms
            'life insurance', 'insurance premium', 'life policy',
            'whole life', 'term life', 'endowment', 'investment-linked',
            'ilp', 'insurance policy', 'life cover',
            
            // Takaful
            'takaful', 'family takaful', 'takaful hayat',
            'takaful keluarga', 'sijil takaful',
            
            // Malaysian insurance companies
            'prudential', 'pru', 'prubsn', 'prudential bsn',
            'aia', 'aia malaysia', 'aia bhd', 'aia public takaful',
            'great eastern', 'ge life', 'great eastern takaful',
            'allianz', 'allianz life', 'allianz malaysia',
            'manulife', 'manulife malaysia',
            'zurich', 'zurich malaysia', 'zurich takaful',
            'tokio marine', 'tokio marine life',
            'etiqa', 'etiqa insurance', 'etiqa takaful',
            'sun life', 'sun life malaysia',
            'hong leong assurance', 'hla', 'hong leong insurance',
            'fwd', 'fwd insurance', 'fwd takaful',
            'gibraltar bsn', 'ammetlife', 'mcis',
            'generali', 'generali malaysia',
            'takaful malaysia', 'syarikat takaful malaysia',
            'takaful ikhlas', 'prudential bsn takaful'
        ]
    },

    // ============================================
    // EDUCATION & MEDICAL INSURANCE (RM3,000 limit)
    // ============================================
    'INSURANCE_EDU_MED': {
        'default': [
            // Education insurance
            'education insurance', 'education plan', 'child education plan',
            'education policy', 'child education insurance',
            'scholarship insurance', 'education savings plan',
            
            // Medical insurance
            'medical insurance', 'health insurance', 'medical card',
            'hospitalisation', 'hospitalization', 'medical policy',
            'critical illness', 'ci insurance', 'dread disease',
            '36 critical illness', 'medical coverage',
            
            // Specific products
            'pruhealth', 'prumillion', 'aia health', 'aia med',
            'allianz health', 'ge supreme health', 'zurich care'
        ]
    },

    // ============================================
    // SOCSO (RM350 limit)
    // ============================================
    'SOCSO': {
        'default': [
            'socso', 'perkeso', 'social security', 'pertubuhan keselamatan sosial',
            'eis', 'employment insurance', 'employment insurance system',
            'sip', 'self-employment', 'i-suri', 'i-saraan perkeso'
        ]
    },

    // ============================================
    // PRS (RM3,000 limit)
    // ============================================
    'PRS': {
        'default': [
            'prs', 'private retirement', 'private retirement scheme',
            'retirement scheme', 'annuity', 'deferred annuity',
            'pension', 'retirement fund', 'retirement savings',
            'ppa', 'private pension administrator',
            
            // PRS providers
            'cimb prs', 'public mutual prs', 'amundi prs',
            'kenanga prs', 'affin hwang prs', 'manulife prs',
            'principal prs', 'axa prs'
        ]
    },

    // ============================================
    // SSPN (RM8,000 limit)
    // ============================================
    'SSPN': {
        'default': [
            'sspn', 'sspn-i', 'sspn-i plus', 'sspn prime',
            'simpanan pendidikan', 'simpan sspn',
            'ptptn', 'national education savings',
            'skim simpanan pendidikan nasional',
            'education savings', 'tabung pendidikan'
        ]
    },

    // ============================================
    // CHILDCARE (RM3,000 limit)
    // ============================================
    'CHILDCARE': {
        'default': [
            // Generic terms
            'childcare', 'child care', 'daycare', 'day care', 'nursery',
            'kindergarten', 'preschool', 'pre-school', 'playschool',
            'early childhood', 'childcare centre', 'childcare center',
            'childcare fee', 'daycare fee', 'nursery fee',
            
            // Malay terms
            'tadika', 'taska', 'taman asuhan', 'taman didikan',
            'jagaan kanak-kanak', 'pusat jagaan kanak-kanak',
            
            // Malaysian childcare chains
            'q-dees', 'qdees', 'smart reader', 'little caliphs',
            'kinderland', 'genius aulad', 'tadika khalifah genius',
            'maple bear', 'montessori', 'shichida',
            'brainy bunch', 'cherie hearts', 'mindchamps',
            'real kids', 'bright sparks', 'star learners',
            'eaton house', 'elc', 'the children house',
            
            // Government childcare
            'tabika kemas', 'tadika perpaduan', 'taska permata',
            'permata negara', 'tadika kemas'
        ]
    },

    // ============================================
    // BREASTFEEDING EQUIPMENT (RM1,000 limit, once every 2 years)
    // ============================================
    'BREASTFEEDING': {
        'default': [
            // Equipment types
            'breast pump', 'breastpump', 'breast feeding', 'breastfeeding',
            'nursing', 'lactation', 'milk pump', 'electric pump',
            'manual pump', 'double pump', 'wearable pump',
            
            // Brands popular in Malaysia
            'medela', 'spectra', 'philips avent', 'avent', 'pigeon',
            'lansinoh', 'haakaa', 'momcozy', 'youha', 'lacte',
            'autumnz', 'little bean', 'pumpables', 'elvie', 'willow',
            'cimilre', 'unimom', 'ameda',
            
            // Accessories
            'breast milk', 'milk storage', 'storage bag', 'breast milk bag',
            'nursing bra', 'breast pad', 'nipple shield', 'flange',
            'breast shield', 'milk bottle', 'sterilizer', 'cooler bag'
        ]
    },

    // ============================================
    // EV CHARGING & COMPOSTING (RM2,500 limit)
    // ============================================
    'EV_CHARGING': {
        'EV_CHARGING_FACILITY': [
            // EV charger terms
            'ev charger', 'ev charging', 'electric vehicle charger',
            'home charger', 'wallbox', 'charging station',
            'ev charging facility', 'tesla charger', 'wall connector',
            'type 2 charger', 'ccs charger', 'chademo',
            
            // Charging networks in Malaysia
            'chargev', 'gentari', 'petronas ev', 'shell recharge',
            'yinson greentech', 'tnb electric', 'tnb volts',
            'jomcharge', 'parkcharge', 'dc handal'
        ],
        
        'COMPOSTING_MACHINE': [
            // Composting equipment
            'composting', 'composter', 'food waste', 'compost machine',
            'organic waste', 'kitchen composter', 'food composter',
            'bokashi', 'worm composter', 'vermicompost',
            'food waste recycling', 'food waste machine'
        ]
    },

    // ============================================
    // DISABLED EQUIPMENT (RM6,000 limit)
    // ============================================
    'DISABLED_EQUIPMENT': {
        'default': [
            // Mobility aids
            'wheelchair', 'electric wheelchair', 'motorized wheelchair',
            'walking aid', 'walker', 'rollator', 'crutches', 'cane',
            'walking stick', 'mobility scooter',
            
            // Hearing aids
            'hearing aid', 'cochlear implant', 'hearing device',
            
            // Prosthetics & orthotics
            'prosthetic', 'prosthesis', 'artificial limb',
            'orthopedic', 'orthopaedic', 'brace', 'splint',
            
            // Medical equipment
            'hemodialysis', 'dialysis machine', 'oxygen concentrator',
            'cpap machine', 'hospital bed',
            
            // OKU related
            'oku', 'oku equipment', 'disability equipment',
            'disabled', 'handicap', 'differently abled',
            'special needs', 'orang kurang upaya'
        ]
    },

    // ============================================
    // DONATIONS (Deduction, not relief)
    // ============================================
    'DONATIONS': {
        'APPROVED_INSTITUTIONS': [
            // Generic donation terms
            'donation', 'derma', 'sumbangan', 'zakat', 'sedekah',
            'charitable', 'charity', 'contribution', 'gift',
            
            // Government approved
            'approved institution', 'institusi diluluskan',
            'tabung bencana', 'disaster fund', 'welfare organization',
            'badan kebajikan',
            
            // Specific causes
            'library donation', 'perpustakaan', 'oku facility',
            'disability facility', 'sports activity', 'sukan',
            'education institution', 'religious', 'keagamaan'
        ]
    }
};

/**
 * Enhanced Merchant Category Mapping for Malaysia
 * Maps known merchant names/patterns to tax categories
 * Optimized for Malaysian market
 */
const MERCHANT_CATEGORY_MAP = {
    // ========================================
    // BOOKSTORES
    // ========================================
    'popular': { tax_code: 'LIFESTYLE', subcategory: 'LIFE_BOOKS' },
    'popular bookstore': { tax_code: 'LIFESTYLE', subcategory: 'LIFE_BOOKS' },
    'mph': { tax_code: 'LIFESTYLE', subcategory: 'LIFE_BOOKS' },
    'mph bookstore': { tax_code: 'LIFESTYLE', subcategory: 'LIFE_BOOKS' },
    'kinokuniya': { tax_code: 'LIFESTYLE', subcategory: 'LIFE_BOOKS' },
    'times bookstore': { tax_code: 'LIFESTYLE', subcategory: 'LIFE_BOOKS' },
    'big bad wolf': { tax_code: 'LIFESTYLE', subcategory: 'LIFE_BOOKS' },
    'bookxcess': { tax_code: 'LIFESTYLE', subcategory: 'LIFE_BOOKS' },
    'bookalicious': { tax_code: 'LIFESTYLE', subcategory: 'LIFE_BOOKS' },

    // ========================================
    // ELECTRONICS RETAILERS
    // ========================================
    'harvey norman': { tax_code: 'LIFESTYLE', subcategory: 'LIFE_GADGETS' },
    'senheng': { tax_code: 'LIFESTYLE', subcategory: 'LIFE_GADGETS' },
    'courts': { tax_code: 'LIFESTYLE', subcategory: 'LIFE_GADGETS' },
    'machines': { tax_code: 'LIFESTYLE', subcategory: 'LIFE_GADGETS' },
    'switch': { tax_code: 'LIFESTYLE', subcategory: 'LIFE_GADGETS' },
    'apple store': { tax_code: 'LIFESTYLE', subcategory: 'LIFE_GADGETS' },
    'directd': { tax_code: 'LIFESTYLE', subcategory: 'LIFE_GADGETS' },
    'direct d': { tax_code: 'LIFESTYLE', subcategory: 'LIFE_GADGETS' },
    'urbanfox': { tax_code: 'LIFESTYLE', subcategory: 'LIFE_GADGETS' },
    'all it hypermarket': { tax_code: 'LIFESTYLE', subcategory: 'LIFE_GADGETS' },
    'all it': { tax_code: 'LIFESTYLE', subcategory: 'LIFE_GADGETS' },
    'thunder match': { tax_code: 'LIFESTYLE', subcategory: 'LIFE_GADGETS' },
    'pc image': { tax_code: 'LIFESTYLE', subcategory: 'LIFE_GADGETS' },
    'viewnet': { tax_code: 'LIFESTYLE', subcategory: 'LIFE_GADGETS' },
    'ideal tech': { tax_code: 'LIFESTYLE', subcategory: 'LIFE_GADGETS' },
    'mac studio': { tax_code: 'LIFESTYLE', subcategory: 'LIFE_GADGETS' },
    'epicentre': { tax_code: 'LIFESTYLE', subcategory: 'LIFE_GADGETS' },
    'plaza low yat': { tax_code: 'LIFESTYLE', subcategory: 'LIFE_GADGETS' },
    'low yat': { tax_code: 'LIFESTYLE', subcategory: 'LIFE_GADGETS' },

    // ========================================
    // TELCOS & ISPs
    // ========================================
    'maxis': { tax_code: 'LIFESTYLE', subcategory: 'LIFE_INTERNET' },
    'maxis centre': { tax_code: 'LIFESTYLE', subcategory: 'LIFE_INTERNET' },
    'celcom': { tax_code: 'LIFESTYLE', subcategory: 'LIFE_INTERNET' },
    'celcom blue cube': { tax_code: 'LIFESTYLE', subcategory: 'LIFE_INTERNET' },
    'digi': { tax_code: 'LIFESTYLE', subcategory: 'LIFE_INTERNET' },
    'digi store': { tax_code: 'LIFESTYLE', subcategory: 'LIFE_INTERNET' },
    'unifi': { tax_code: 'LIFESTYLE', subcategory: 'LIFE_INTERNET' },
    'tm point': { tax_code: 'LIFESTYLE', subcategory: 'LIFE_INTERNET' },
    'telekom malaysia': { tax_code: 'LIFESTYLE', subcategory: 'LIFE_INTERNET' },
    'time': { tax_code: 'LIFESTYLE', subcategory: 'LIFE_INTERNET' },
    'time internet': { tax_code: 'LIFESTYLE', subcategory: 'LIFE_INTERNET' },
    'time fibre': { tax_code: 'LIFESTYLE', subcategory: 'LIFE_INTERNET' },
    'yes': { tax_code: 'LIFESTYLE', subcategory: 'LIFE_INTERNET' },
    'u mobile': { tax_code: 'LIFESTYLE', subcategory: 'LIFE_INTERNET' },
    'umobile': { tax_code: 'LIFESTYLE', subcategory: 'LIFE_INTERNET' },
    'astro': { tax_code: 'LIFESTYLE', subcategory: 'LIFE_INTERNET' },
    'yoodo': { tax_code: 'LIFESTYLE', subcategory: 'LIFE_INTERNET' },
    'hotlink': { tax_code: 'LIFESTYLE', subcategory: 'LIFE_INTERNET' },
    'xpax': { tax_code: 'LIFESTYLE', subcategory: 'LIFE_INTERNET' },

    // ========================================
    // ONLINE LEARNING PLATFORMS
    // ========================================
    'udemy': { tax_code: 'LIFESTYLE', subcategory: 'LIFE_SKILLS' },
    'coursera': { tax_code: 'LIFESTYLE', subcategory: 'LIFE_SKILLS' },
    'skillshare': { tax_code: 'LIFESTYLE', subcategory: 'LIFE_SKILLS' },
    'linkedin learning': { tax_code: 'LIFESTYLE', subcategory: 'LIFE_SKILLS' },
    'masterclass': { tax_code: 'LIFESTYLE', subcategory: 'LIFE_SKILLS' },

    // ========================================
    // SPORTS RETAILERS
    // ========================================
    'decathlon': { tax_code: 'LIFESTYLE_SPORTS', subcategory: 'SPORT_EQUIPMENT' },
    'al-ikhsan': { tax_code: 'LIFESTYLE_SPORTS', subcategory: 'SPORT_EQUIPMENT' },
    'al ikhsan': { tax_code: 'LIFESTYLE_SPORTS', subcategory: 'SPORT_EQUIPMENT' },
    'alikhsan': { tax_code: 'LIFESTYLE_SPORTS', subcategory: 'SPORT_EQUIPMENT' },
    'sports direct': { tax_code: 'LIFESTYLE_SPORTS', subcategory: 'SPORT_EQUIPMENT' },
    'jd sports': { tax_code: 'LIFESTYLE_SPORTS', subcategory: 'SPORT_EQUIPMENT' },
    'royal sporting house': { tax_code: 'LIFESTYLE_SPORTS', subcategory: 'SPORT_EQUIPMENT' },
    'rsh': { tax_code: 'LIFESTYLE_SPORTS', subcategory: 'SPORT_EQUIPMENT' },
    'supersports': { tax_code: 'LIFESTYLE_SPORTS', subcategory: 'SPORT_EQUIPMENT' },
    'hoops station': { tax_code: 'LIFESTYLE_SPORTS', subcategory: 'SPORT_EQUIPMENT' },
    'running lab': { tax_code: 'LIFESTYLE_SPORTS', subcategory: 'SPORT_EQUIPMENT' },
    'nike': { tax_code: 'LIFESTYLE_SPORTS', subcategory: 'SPORT_EQUIPMENT' },
    'adidas': { tax_code: 'LIFESTYLE_SPORTS', subcategory: 'SPORT_EQUIPMENT' },
    'puma': { tax_code: 'LIFESTYLE_SPORTS', subcategory: 'SPORT_EQUIPMENT' },
    'under armour': { tax_code: 'LIFESTYLE_SPORTS', subcategory: 'SPORT_EQUIPMENT' },
    'asics': { tax_code: 'LIFESTYLE_SPORTS', subcategory: 'SPORT_EQUIPMENT' },
    'new balance': { tax_code: 'LIFESTYLE_SPORTS', subcategory: 'SPORT_EQUIPMENT' },
    'skechers': { tax_code: 'LIFESTYLE_SPORTS', subcategory: 'SPORT_EQUIPMENT' },
    'yonex': { tax_code: 'LIFESTYLE_SPORTS', subcategory: 'SPORT_EQUIPMENT' },
    'victor': { tax_code: 'LIFESTYLE_SPORTS', subcategory: 'SPORT_EQUIPMENT' },

    // ========================================
    // GYMS & FITNESS
    // ========================================
    'fitness first': { tax_code: 'LIFESTYLE_SPORTS', subcategory: 'SPORT_GYM' },
    'celebrity fitness': { tax_code: 'LIFESTYLE_SPORTS', subcategory: 'SPORT_GYM' },
    'anytime fitness': { tax_code: 'LIFESTYLE_SPORTS', subcategory: 'SPORT_GYM' },
    'chi fitness': { tax_code: 'LIFESTYLE_SPORTS', subcategory: 'SPORT_GYM' },
    'true fitness': { tax_code: 'LIFESTYLE_SPORTS', subcategory: 'SPORT_GYM' },
    'gofit': { tax_code: 'LIFESTYLE_SPORTS', subcategory: 'SPORT_GYM' },
    'firefit': { tax_code: 'LIFESTYLE_SPORTS', subcategory: 'SPORT_GYM' },
    'fire fit': { tax_code: 'LIFESTYLE_SPORTS', subcategory: 'SPORT_GYM' },
    'believe fitness': { tax_code: 'LIFESTYLE_SPORTS', subcategory: 'SPORT_GYM' },
    'peak fitness': { tax_code: 'LIFESTYLE_SPORTS', subcategory: 'SPORT_GYM' },
    'koa fitness': { tax_code: 'LIFESTYLE_SPORTS', subcategory: 'SPORT_GYM' },
    'babel fit': { tax_code: 'LIFESTYLE_SPORTS', subcategory: 'SPORT_GYM' },
    'f45': { tax_code: 'LIFESTYLE_SPORTS', subcategory: 'SPORT_GYM' },

    // ========================================
    // PHARMACIES & HEALTH STORES
    // ========================================
    'watsons': { tax_code: 'MEDICAL_EXAM', subcategory: 'MED_EXAM_COMPLETE' },
    'guardian': { tax_code: 'MEDICAL_EXAM', subcategory: 'MED_EXAM_COMPLETE' },
    'caring pharmacy': { tax_code: 'MEDICAL_EXAM', subcategory: 'MED_EXAM_COMPLETE' },
    'caring': { tax_code: 'MEDICAL_EXAM', subcategory: 'MED_EXAM_COMPLETE' },
    'alpro pharmacy': { tax_code: 'MEDICAL_EXAM', subcategory: 'MED_EXAM_COMPLETE' },
    'alpro': { tax_code: 'MEDICAL_EXAM', subcategory: 'MED_EXAM_COMPLETE' },
    'big pharmacy': { tax_code: 'MEDICAL_EXAM', subcategory: 'MED_EXAM_COMPLETE' },
    'aa pharmacy': { tax_code: 'MEDICAL_EXAM', subcategory: 'MED_EXAM_COMPLETE' },
    'health lane': { tax_code: 'MEDICAL_EXAM', subcategory: 'MED_EXAM_COMPLETE' },
    'am pm pharmacy': { tax_code: 'MEDICAL_EXAM', subcategory: 'MED_EXAM_COMPLETE' },
    'multicare pharmacy': { tax_code: 'MEDICAL_EXAM', subcategory: 'MED_EXAM_COMPLETE' },

    // ========================================
    // PRIVATE HOSPITALS - KL/SELANGOR
    // ========================================
    'gleneagles': { tax_code: 'MEDICAL_SERIOUS', subcategory: 'MED_SERIOUS_DISEASE' },
    'gleneagles kuala lumpur': { tax_code: 'MEDICAL_SERIOUS', subcategory: 'MED_SERIOUS_DISEASE' },
    'gleneagles kl': { tax_code: 'MEDICAL_SERIOUS', subcategory: 'MED_SERIOUS_DISEASE' },
    'pantai hospital': { tax_code: 'MEDICAL_SERIOUS', subcategory: 'MED_SERIOUS_DISEASE' },
    'pantai': { tax_code: 'MEDICAL_SERIOUS', subcategory: 'MED_SERIOUS_DISEASE' },
    'pantai kuala lumpur': { tax_code: 'MEDICAL_SERIOUS', subcategory: 'MED_SERIOUS_DISEASE' },
    'pantai bangsar': { tax_code: 'MEDICAL_SERIOUS', subcategory: 'MED_SERIOUS_DISEASE' },
    'pantai cheras': { tax_code: 'MEDICAL_SERIOUS', subcategory: 'MED_SERIOUS_DISEASE' },
    'pantai ampang': { tax_code: 'MEDICAL_SERIOUS', subcategory: 'MED_SERIOUS_DISEASE' },
    'pantai klang': { tax_code: 'MEDICAL_SERIOUS', subcategory: 'MED_SERIOUS_DISEASE' },
    'sunway medical': { tax_code: 'MEDICAL_SERIOUS', subcategory: 'MED_SERIOUS_DISEASE' },
    'sunway medical centre': { tax_code: 'MEDICAL_SERIOUS', subcategory: 'MED_SERIOUS_DISEASE' },
    'sunway velocity medical': { tax_code: 'MEDICAL_SERIOUS', subcategory: 'MED_SERIOUS_DISEASE' },
    'kpj': { tax_code: 'MEDICAL_SERIOUS', subcategory: 'MED_SERIOUS_DISEASE' },
    'kpj damansara': { tax_code: 'MEDICAL_SERIOUS', subcategory: 'MED_SERIOUS_DISEASE' },
    'kpj ampang': { tax_code: 'MEDICAL_SERIOUS', subcategory: 'MED_SERIOUS_DISEASE' },
    'kpj tawakkal': { tax_code: 'MEDICAL_SERIOUS', subcategory: 'MED_SERIOUS_DISEASE' },
    'kpj kajang': { tax_code: 'MEDICAL_SERIOUS', subcategory: 'MED_SERIOUS_DISEASE' },
    'kpj klang': { tax_code: 'MEDICAL_SERIOUS', subcategory: 'MED_SERIOUS_DISEASE' },
    'kpj selangor': { tax_code: 'MEDICAL_SERIOUS', subcategory: 'MED_SERIOUS_DISEASE' },
    'kpj sentosa': { tax_code: 'MEDICAL_SERIOUS', subcategory: 'MED_SERIOUS_DISEASE' },
    'columbia asia': { tax_code: 'MEDICAL_SERIOUS', subcategory: 'MED_SERIOUS_DISEASE' },
    'prince court': { tax_code: 'MEDICAL_SERIOUS', subcategory: 'MED_SERIOUS_DISEASE' },
    'prince court medical': { tax_code: 'MEDICAL_SERIOUS', subcategory: 'MED_SERIOUS_DISEASE' },
    'thomson hospital': { tax_code: 'MEDICAL_SERIOUS', subcategory: 'MED_SERIOUS_DISEASE' },
    'subang jaya medical': { tax_code: 'MEDICAL_SERIOUS', subcategory: 'MED_SERIOUS_DISEASE' },
    'sjmc': { tax_code: 'MEDICAL_SERIOUS', subcategory: 'MED_SERIOUS_DISEASE' },
    'assunta': { tax_code: 'MEDICAL_SERIOUS', subcategory: 'MED_SERIOUS_DISEASE' },
    'ijn': { tax_code: 'MEDICAL_SERIOUS', subcategory: 'MED_SERIOUS_DISEASE' },
    'institut jantung negara': { tax_code: 'MEDICAL_SERIOUS', subcategory: 'MED_SERIOUS_DISEASE' },
    'tung shin': { tax_code: 'MEDICAL_SERIOUS', subcategory: 'MED_SERIOUS_DISEASE' },
    'pusrawi': { tax_code: 'MEDICAL_SERIOUS', subcategory: 'MED_SERIOUS_DISEASE' },
    'parkcity medical': { tax_code: 'MEDICAL_SERIOUS', subcategory: 'MED_SERIOUS_DISEASE' },
    'beacon hospital': { tax_code: 'MEDICAL_SERIOUS', subcategory: 'MED_SERIOUS_DISEASE' },

    // ========================================
    // PRIVATE HOSPITALS - PENANG
    // ========================================
    'gleneagles penang': { tax_code: 'MEDICAL_SERIOUS', subcategory: 'MED_SERIOUS_DISEASE' },
    'pantai penang': { tax_code: 'MEDICAL_SERIOUS', subcategory: 'MED_SERIOUS_DISEASE' },
    'island hospital': { tax_code: 'MEDICAL_SERIOUS', subcategory: 'MED_SERIOUS_DISEASE' },
    'lam wah ee': { tax_code: 'MEDICAL_SERIOUS', subcategory: 'MED_SERIOUS_DISEASE' },
    'loh guan lye': { tax_code: 'MEDICAL_SERIOUS', subcategory: 'MED_SERIOUS_DISEASE' },
    'mount miriam': { tax_code: 'MEDICAL_SERIOUS', subcategory: 'MED_SERIOUS_DISEASE' },
    'sunway medical penang': { tax_code: 'MEDICAL_SERIOUS', subcategory: 'MED_SERIOUS_DISEASE' },
    'kpj penang': { tax_code: 'MEDICAL_SERIOUS', subcategory: 'MED_SERIOUS_DISEASE' },

    // ========================================
    // PRIVATE HOSPITALS - JOHOR
    // ========================================
    'gleneagles johor': { tax_code: 'MEDICAL_SERIOUS', subcategory: 'MED_SERIOUS_DISEASE' },
    'kpj johor': { tax_code: 'MEDICAL_SERIOUS', subcategory: 'MED_SERIOUS_DISEASE' },
    'mahkota medical': { tax_code: 'MEDICAL_SERIOUS', subcategory: 'MED_SERIOUS_DISEASE' },
    'regency specialist': { tax_code: 'MEDICAL_SERIOUS', subcategory: 'MED_SERIOUS_DISEASE' },

    // ========================================
    // PRIVATE HOSPITALS - OTHER STATES
    // ========================================
    'pantai ipoh': { tax_code: 'MEDICAL_SERIOUS', subcategory: 'MED_SERIOUS_DISEASE' },
    'kpj ipoh': { tax_code: 'MEDICAL_SERIOUS', subcategory: 'MED_SERIOUS_DISEASE' },
    'sunway ipoh': { tax_code: 'MEDICAL_SERIOUS', subcategory: 'MED_SERIOUS_DISEASE' },
    'fatimah hospital': { tax_code: 'MEDICAL_SERIOUS', subcategory: 'MED_SERIOUS_DISEASE' },
    'pantai sungai petani': { tax_code: 'MEDICAL_SERIOUS', subcategory: 'MED_SERIOUS_DISEASE' },
    'kedah medical': { tax_code: 'MEDICAL_SERIOUS', subcategory: 'MED_SERIOUS_DISEASE' },

    // ========================================
    // DENTAL CLINICS
    // ========================================
    'dentalpro': { tax_code: 'MEDICAL_SERIOUS', subcategory: 'MED_DENTAL' },
    'tiew dental': { tax_code: 'MEDICAL_SERIOUS', subcategory: 'MED_DENTAL' },
    'chai dental': { tax_code: 'MEDICAL_SERIOUS', subcategory: 'MED_DENTAL' },
    'kdc dental': { tax_code: 'MEDICAL_SERIOUS', subcategory: 'MED_DENTAL' },
    'pristine dental': { tax_code: 'MEDICAL_SERIOUS', subcategory: 'MED_DENTAL' },

    // ========================================
    // HEALTH SCREENING
    // ========================================
    'bp healthcare': { tax_code: 'MEDICAL_EXAM', subcategory: 'MED_EXAM_COMPLETE' },
    'bphc': { tax_code: 'MEDICAL_EXAM', subcategory: 'MED_EXAM_COMPLETE' },
    'pathlab': { tax_code: 'MEDICAL_EXAM', subcategory: 'MED_EXAM_COMPLETE' },
    'pantai premier pathology': { tax_code: 'MEDICAL_EXAM', subcategory: 'MED_EXAM_COMPLETE' },
    'lablink': { tax_code: 'MEDICAL_EXAM', subcategory: 'MED_EXAM_COMPLETE' },
    'gribbles': { tax_code: 'MEDICAL_EXAM', subcategory: 'MED_EXAM_COMPLETE' },
    'qualitas': { tax_code: 'MEDICAL_EXAM', subcategory: 'MED_EXAM_COMPLETE' },
    'mediviron': { tax_code: 'MEDICAL_EXAM', subcategory: 'MED_EXAM_COMPLETE' },

    // ========================================
    // INSURANCE COMPANIES
    // ========================================
    'prudential': { tax_code: 'LIFE_EPF', subcategory: 'LIFE_INSURANCE' },
    'prudential bsn': { tax_code: 'LIFE_EPF', subcategory: 'LIFE_INSURANCE' },
    'prubsn': { tax_code: 'LIFE_EPF', subcategory: 'LIFE_INSURANCE' },
    'aia': { tax_code: 'LIFE_EPF', subcategory: 'LIFE_INSURANCE' },
    'aia malaysia': { tax_code: 'LIFE_EPF', subcategory: 'LIFE_INSURANCE' },
    'great eastern': { tax_code: 'LIFE_EPF', subcategory: 'LIFE_INSURANCE' },
    'ge life': { tax_code: 'LIFE_EPF', subcategory: 'LIFE_INSURANCE' },
    'allianz': { tax_code: 'LIFE_EPF', subcategory: 'LIFE_INSURANCE' },
    'allianz malaysia': { tax_code: 'LIFE_EPF', subcategory: 'LIFE_INSURANCE' },
    'etiqa': { tax_code: 'LIFE_EPF', subcategory: 'LIFE_INSURANCE' },
    'etiqa insurance': { tax_code: 'LIFE_EPF', subcategory: 'LIFE_INSURANCE' },
    'etiqa takaful': { tax_code: 'LIFE_EPF', subcategory: 'LIFE_INSURANCE' },
    'manulife': { tax_code: 'LIFE_EPF', subcategory: 'LIFE_INSURANCE' },
    'zurich': { tax_code: 'LIFE_EPF', subcategory: 'LIFE_INSURANCE' },
    'zurich malaysia': { tax_code: 'LIFE_EPF', subcategory: 'LIFE_INSURANCE' },
    'tokio marine': { tax_code: 'LIFE_EPF', subcategory: 'LIFE_INSURANCE' },
    'sun life': { tax_code: 'LIFE_EPF', subcategory: 'LIFE_INSURANCE' },
    'hong leong assurance': { tax_code: 'LIFE_EPF', subcategory: 'LIFE_INSURANCE' },
    'hla': { tax_code: 'LIFE_EPF', subcategory: 'LIFE_INSURANCE' },
    'fwd': { tax_code: 'LIFE_EPF', subcategory: 'LIFE_INSURANCE' },
    'fwd insurance': { tax_code: 'LIFE_EPF', subcategory: 'LIFE_INSURANCE' },
    'gibraltar bsn': { tax_code: 'LIFE_EPF', subcategory: 'LIFE_INSURANCE' },
    'ammetlife': { tax_code: 'LIFE_EPF', subcategory: 'LIFE_INSURANCE' },
    'takaful malaysia': { tax_code: 'LIFE_EPF', subcategory: 'LIFE_INSURANCE' },
    'takaful ikhlas': { tax_code: 'LIFE_EPF', subcategory: 'LIFE_INSURANCE' },
    'generali': { tax_code: 'LIFE_EPF', subcategory: 'LIFE_INSURANCE' },

    // ========================================
    // CHILDCARE/KINDERGARTEN
    // ========================================
    'q-dees': { tax_code: 'CHILDCARE', subcategory: 'default' },
    'qdees': { tax_code: 'CHILDCARE', subcategory: 'default' },
    'smart reader': { tax_code: 'CHILDCARE', subcategory: 'default' },
    'little caliphs': { tax_code: 'CHILDCARE', subcategory: 'default' },
    'kinderland': { tax_code: 'CHILDCARE', subcategory: 'default' },
    'genius aulad': { tax_code: 'CHILDCARE', subcategory: 'default' },
    'maple bear': { tax_code: 'CHILDCARE', subcategory: 'default' },
    'brainy bunch': { tax_code: 'CHILDCARE', subcategory: 'default' },
    'cherie hearts': { tax_code: 'CHILDCARE', subcategory: 'default' },
    'mindchamps': { tax_code: 'CHILDCARE', subcategory: 'default' },
    'real kids': { tax_code: 'CHILDCARE', subcategory: 'default' },
    'eaton house': { tax_code: 'CHILDCARE', subcategory: 'default' },
    'the childrens house': { tax_code: 'CHILDCARE', subcategory: 'default' },
    'montessori': { tax_code: 'CHILDCARE', subcategory: 'default' },
    'shichida': { tax_code: 'CHILDCARE', subcategory: 'default' },
    'tabika kemas': { tax_code: 'CHILDCARE', subcategory: 'default' },
    'taska permata': { tax_code: 'CHILDCARE', subcategory: 'default' },

    // ========================================
    // BREASTFEEDING EQUIPMENT
    // ========================================
    'medela': { tax_code: 'BREASTFEEDING', subcategory: 'default' },
    'spectra': { tax_code: 'BREASTFEEDING', subcategory: 'default' },
    'philips avent': { tax_code: 'BREASTFEEDING', subcategory: 'default' },
    'avent': { tax_code: 'BREASTFEEDING', subcategory: 'default' },
    'pigeon': { tax_code: 'BREASTFEEDING', subcategory: 'default' },
    'lansinoh': { tax_code: 'BREASTFEEDING', subcategory: 'default' },
    'haakaa': { tax_code: 'BREASTFEEDING', subcategory: 'default' },
    'momcozy': { tax_code: 'BREASTFEEDING', subcategory: 'default' },
    'autumnz': { tax_code: 'BREASTFEEDING', subcategory: 'default' },
    'lacte': { tax_code: 'BREASTFEEDING', subcategory: 'default' },

    // ========================================
    // EV CHARGING
    // ========================================
    'chargev': { tax_code: 'EV_CHARGING', subcategory: 'EV_CHARGING_FACILITY' },
    'gentari': { tax_code: 'EV_CHARGING', subcategory: 'EV_CHARGING_FACILITY' },
    'shell recharge': { tax_code: 'EV_CHARGING', subcategory: 'EV_CHARGING_FACILITY' },
    'tnb volts': { tax_code: 'EV_CHARGING', subcategory: 'EV_CHARGING_FACILITY' },
    'jomcharge': { tax_code: 'EV_CHARGING', subcategory: 'EV_CHARGING_FACILITY' },

    // ========================================
    // BABY STORES (multiple categories)
    // ========================================
    'mothercare': { tax_code: 'BREASTFEEDING', subcategory: 'default' },
    'mamours': { tax_code: 'BREASTFEEDING', subcategory: 'default' },
    'baby store': { tax_code: 'BREASTFEEDING', subcategory: 'default' },
    'babyland': { tax_code: 'BREASTFEEDING', subcategory: 'default' },
    'firstcry': { tax_code: 'BREASTFEEDING', subcategory: 'default' }
};

/**
 * Tax Relief Limits Reference (YA 2024/2025)
 * For validation purposes
 */
const TAX_RELIEF_LIMITS = {
    'INDIVIDUAL': 9000,
    'SPOUSE': 4000,
    'LIFESTYLE': 2500,
    'LIFESTYLE_SPORTS': 1000,
    'MEDICAL_SERIOUS': 10000,       // Combined for self, spouse, child
    'MEDICAL_EXAM': 1000,           // Within medical limit
    'MEDICAL_DENTAL': 1000,         // Within medical limit
    'EDUCATION_SELF': 7000,
    'EDUCATION_UPSKILLING': 2000,   // Sub-limit within education
    'PARENT_MEDICAL': 8000,
    'LIFE_EPF': 7000,
    'INSURANCE_EDU_MED': 3000,
    'SOCSO': 350,
    'PRS': 3000,
    'SSPN': 8000,
    'CHILDCARE': 3000,
    'BREASTFEEDING': 1000,          // Once every 2 years
    'EV_CHARGING': 2500,
    'DISABLED_EQUIPMENT': 6000,
    'CHILD_UNDER_18': 2000,
    'CHILD_18_PLUS_HIGHER_ED': 8000,
    'CHILD_DISABLED': 6000
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