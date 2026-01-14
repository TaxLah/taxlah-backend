module.exports = {
    apps: [
        {
            name: 'taxlah-development-api',
            script: './server.js',
            // exec_mode: 'cluster',
            env: {
                NODE_ENV: 'development',
                PORT: process.env.PORT || 3000,
                DB_HOST: process.env.DB_HOST,
                DB_USERNAME: process.env.DB_USERNAME,
                DB_PASSWORD: process.env.DB_PASSWORD,
                DB_DATABASE: process.env.DB_DATABASE,
                APP_SECRET: process.env.APP_SECRET,
                ADMIN_SECRET: process.env.ADMIN_SECRET,
                CHIP_BRAND_ID: process.env.CHIP_BRAND_ID,
                CHIP_API_KEY: process.env.CHIP_API_KEY,
                CHIP_WEBHOOK_PUBLIC_KEY: process.env.CHIP_WEBHOOK_PUBLIC_KEY,
                CHIP_CALLBACK_URL: process.env.CHIP_CALLBACK_URL,
                BASE_URL: process.env.BASE_URL || 'https://dev.taxlah.com'
            },
            error_file: './logs/dev-error.log',
            out_file: './logs/dev-out.log',
            log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
            merge_logs: true,
            autorestart: true,
            watch: false
        },
        {
            name: 'taxlah-staging-api',
            script: './server.js',
            // exec_mode: 'cluster',
            env: {
                NODE_ENV: 'staging',
                PORT: process.env.PORT || 3100,
                DB_HOST: process.env.DB_HOST,
                DB_USERNAME: process.env.DB_USERNAME,
                DB_PASSWORD: process.env.DB_PASSWORD,
                DB_DATABASE: process.env.DB_DATABASE,
                APP_SECRET: process.env.APP_SECRET,
                ADMIN_SECRET: process.env.ADMIN_SECRET,
                CHIP_BRAND_ID: process.env.CHIP_BRAND_ID,
                CHIP_API_KEY: process.env.CHIP_API_KEY,
                CHIP_WEBHOOK_PUBLIC_KEY: process.env.CHIP_WEBHOOK_PUBLIC_KEY,
                CHIP_CALLBACK_URL: process.env.CHIP_CALLBACK_URL,
                BASE_URL: process.env.BASE_URL || 'https://staging.taxlah.com'
            },
            error_file: './logs/staging-error.log',
            out_file: './logs/staging-out.log',
            log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
            merge_logs: true,
            autorestart: true,
            watch: false
        },
        {
            name: 'taxlah-production-api',
            script: './server.js',
            exec_mode: 'cluster',
            env: {
                NODE_ENV: 'production',
                PORT: process.env.PORT || 4000,
                DB_HOST: process.env.DB_HOST,
                DB_USERNAME: process.env.DB_USERNAME,
                DB_PASSWORD: process.env.DB_PASSWORD,
                DB_DATABASE: process.env.DB_DATABASE,
                APP_SECRET: process.env.APP_SECRET,
                ADMIN_SECRET: process.env.ADMIN_SECRET,
                CHIP_BRAND_ID: process.env.CHIP_BRAND_ID,
                CHIP_API_KEY: process.env.CHIP_API_KEY,
                CHIP_WEBHOOK_PUBLIC_KEY: process.env.CHIP_WEBHOOK_PUBLIC_KEY,
                CHIP_CALLBACK_URL: process.env.CHIP_CALLBACK_URL,
                BASE_URL: process.env.BASE_URL || 'https://taxlah.com'
            },
            error_file: './logs/prod-error.log',
            out_file: './logs/prod-out.log',
            log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
            merge_logs: true,
            autorestart: true,
            watch: false
        }
    ]
};