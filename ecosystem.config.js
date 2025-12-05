module.exports = {
    apps: [
        {
            name: 'taxlah-development-api',
            script: './server.js',
            // exec_mode: 'cluster',
            env: {
                NODE_ENV: 'development',
                PORT: 3000,
                DB_HOST: "206.189.36.90",
                DB_USERNAME: "taxlah",
                DB_PASSWORD: "R@iden28",
                DB_DATABASE: "taxlah_development",
                APP_SECRET: "$2a$10$r0HL1ThK9B5GJVZKVlbqneeuoawrHOXEOuttESQwVnPG2dxZWIVie",
                ADMIN_SECRET: "$2a$10$O9nL2sL9kHuyyf9QAuB/Z.iYhvZOmB6cjBDYxLg1PGM5IADPARb36"
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
                PORT: 3100,
                DB_HOST: "206.189.36.90",
                DB_USERNAME: "taxlah",
                DB_PASSWORD: "R@iden28",
                DB_DATABASE: "taxlah_development",
                APP_SECRET: "$2a$10$Q1vSFQxL5o7LiDLat.G/Su6OF6APjOiap2mOQFuU/KZnV6N7c.QQ2",
                ADMIN_SECRET: "$2a$10$BnFzilwX14i585PJz0WUcewvNEeIxVH.2yZK2UbtDoPZt7fsuQv4u"
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
                PORT: 4000,
                DB_HOST: "206.189.36.90",
                DB_USERNAME: "taxlah",
                DB_PASSWORD: "R@iden28",
                DB_DATABASE: "taxlah_production",
                APP_SECRET: "$2a$15$ypZlxvLhAa3l7WT1oF1pGeQ7wXLjJya4ngStuMeiv1YzNLW/iVZfq",
                ADMIN_SECRET: "$2a$15$HobrryKG.jNVB9Eijtquw.XtxvpNOm1Ji.qJgKWtX1FtbWZF0C4sm"
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