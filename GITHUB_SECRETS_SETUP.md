# GitHub Actions Secrets Setup Guide

## 🔐 Required Secrets

You need to add **30 secrets** to your GitHub repository.

### How to Add Secrets:
1. Go to your GitHub repository
2. Click **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret**
4. Add each secret below

---

## 📋 Secrets List

### **Server Access (3 secrets)**
```
SSH_PRIVATE_KEY     → Your SSH private key for server access
DEPLOY_USER         → taxlah
SERVER_HOST         → Your server IP (e.g., 206.189.36.90)
```

### **Development Environment (10 secrets)**
```
DEV_DB_HOST                    → 206.189.36.90
DEV_DB_USERNAME                → taxlah
DEV_DB_PASSWORD                → R@iden28
DEV_DB_DATABASE                → taxlah_development
DEV_APP_SECRET                 → $2a$10$r0HL1ThK9B5GJVZKVlbqneeuoawrHOXEOuttESQwVnPG2dxZWIVie
DEV_ADMIN_SECRET               → $2a$10$O9nL2sL9kHuyyf9QAuB/Z.iYhvZOmB6cjBDYxLg1PGM5IADPARb36
DEV_CHIP_BRAND_ID              → 3661e896-89cc-43b5-93db-54fc8d5da00e
DEV_CHIP_API_KEY               → xGFwSV3Vch9PkQdIBSW5JgHr-MN5qBSoK0Q9RG5R7RPMEXNjfdLXiCW0dWhibewYQeIcNGBaoukwGPP_-iNA4w==
DEV_CHIP_WEBHOOK_PUBLIC_KEY    → (paste the full public key from env.yaml - multiline)
DEV_CHIP_CALLBACK_URL          → https://dev.taxlah.com/api/credit/webhook
```

### **Staging Environment (10 secrets)**
```
STAGING_DB_HOST                → localhost
STAGING_DB_USERNAME            → taxlah
STAGING_DB_PASSWORD            → R@iden28
STAGING_DB_DATABASE            → taxlah_staging
STAGING_APP_SECRET             → $2a$10$Q1vSFQxL5o7LiDLat.G/Su6OF6APjOiap2mOQFuU/KZnV6N7c.QQ2
STAGING_ADMIN_SECRET           → $2a$10$BnFzilwX14i585PJz0WUcewvNEeIxVH.2yZK2UbtDoPZt7fsuQv4u
STAGING_CHIP_BRAND_ID          → 3661e896-89cc-43b5-93db-54fc8d5da00e
STAGING_CHIP_API_KEY           → xGFwSV3Vch9PkQdIBSW5JgHr-MN5qBSoK0Q9RG5R7RPMEXNjfdLXiCW0dWhibewYQeIcNGBaoukwGPP_-iNA4w==
STAGING_CHIP_WEBHOOK_PUBLIC_KEY → (paste the full public key from env.yaml - multiline)
STAGING_CHIP_CALLBACK_URL      → https://dev.taxlah.com/api/credit/webhook
```

### **Production Environment (10 secrets)**
```
PROD_DB_HOST                   → localhost
PROD_DB_USERNAME               → taxlah
PROD_DB_PASSWORD               → R@iden28
PROD_DB_DATABASE               → taxlah_production
PROD_APP_SECRET                → $2a$15$ypZlxvLhAa3l7WT1oF1pGeQ7wXLjJya4ngStuMeiv1YzNLW/iVZfq
PROD_ADMIN_SECRET              → $2a$15$HobrryKG.jNVB9Eijtquw.XtxvpNOm1Ji.qJgKWtX1FtbWZF0C4sm
PROD_CHIP_BRAND_ID             → 3661e896-89cc-43b5-93db-54fc8d5da00e
PROD_CHIP_API_KEY              → XJOIbzYWngRkoR75js0JG2E1eKTL9AGIyWqqxp_2Amyyl2asIn7Qhmh0vrS3DT5bV_hVQXn-zRBd-OPov2IfZQ==
PROD_CHIP_WEBHOOK_PUBLIC_KEY   → (leave empty if not available yet)
PROD_CHIP_CALLBACK_URL         → https://taxlah.com/api/credit/webhook
```

---

## 📝 For Multiline Secrets (Public Keys)

When adding `CHIP_WEBHOOK_PUBLIC_KEY`, paste the **entire block** including the header and footer:

```
-----BEGIN PUBLIC KEY-----
MIIBojANBgkqhkiG9w0BAQEFAAOCAY8AMIIBigKCAYEA5bqs+PKbkHAh3nddH1TY
k3CSp2/TjszxwzPTEquy6n0QjBtjqJjExImRhmaZj4tvLV0YzX12iDlb6ZMOjcrX
b7cFOvzNXUcy53GLL8FE56FKGC9ZDA5GSa/4Y+VA/C0U7BhF4rLT+P3q1+WaZr0q
O5LC1uAY3VT1J/gbRYpLO+Hy+GLDe2On1+xBsdRlvfCpJEHIj2/sIzEBy1YEKfEa
0HQ6LYc1bZ/jZENtmXfyvaUi3CkgMsnJ+HRogNS4Q/amdg8+4HwPBgYuBTZ79mys
luYfOMuaLtFlGJLj1+LNbgnrDKSeA/5z+Ty8NmeInohkQ5nbd4eV1ZPwdr6b9tDj
MmNgLevYIaLhhfdksW+hDPfElvaSHGhhrbOxC2LHKTHTZ+DjjklSZTkODBSYBAdu
AWR5pBC/VdKZMVbopHfBKDBvouCI8hhOre9AgyVjDE1YYVXWHy6EDz1IAcUNYqcU
kBbSz8i8/dH2u+2a74fwjkAmy6qLQDRQadzCcxrJ7XHrAgMBAAE=
-----END PUBLIC KEY-----
```

---

## ✅ What Changed

### **1. ecosystem.config.js**
- ✅ Removed hardcoded secrets
- ✅ Now reads from `process.env` (loaded from .env file)
- ✅ Added `BASE_URL`, `CHIP_API_KEY`, `CHIP_WEBHOOK_PUBLIC_KEY`, etc.

### **2. deployment.yml**
- ✅ Added all 27 environment secrets
- ✅ Creates `.env` file on server during deployment
- ✅ Injects secrets from GitHub Secrets into `.env`
- ✅ PM2 automatically loads `.env` file

---

## 🔄 How It Works Now

### **Deployment Flow:**
1. GitHub Actions runs on push to `main`
2. Code is synced to server (excluding `.env`)
3. **Workflow creates `.env` file** with secrets from GitHub Secrets
4. PM2 restarts and loads environment variables from `.env`
5. Your app uses `process.env.DB_PASSWORD` etc.

### **Security Benefits:**
- ✅ Secrets never stored in git repository
- ✅ Secrets managed centrally in GitHub
- ✅ Different secrets per environment
- ✅ Easy to rotate secrets (just update GitHub Secrets)
- ✅ `.env` file excluded from git (in .gitignore)

---

## 🚨 Important Notes

1. **Never commit .env file** to git (make sure it's in .gitignore)
2. **Never commit env.yaml** to git (contains sensitive data)
3. After adding all secrets, the next deployment will automatically create `.env` files
4. If you need to update a secret, update it in GitHub Secrets → redeploy
5. Local development: create your own `.env` file (not tracked by git)

---

## 🧪 Testing

After adding all secrets:

1. Push to `main` branch
2. GitHub Actions will run automatically
3. Check workflow logs to see `.env` file being created
4. SSH to server and verify: `cat /home/taxlah/api/development/.env`
5. Check PM2 status: `pm2 status`

---

## 📦 Local Development

Create `.env` file in your project root for local development:

```bash
PORT=3000
DB_HOST=localhost
DB_USERNAME=taxlah
DB_PASSWORD=yourpassword
DB_DATABASE=taxlah_development
APP_SECRET=your-app-secret
ADMIN_SECRET=your-admin-secret
CHIP_BRAND_ID=your-brand-id
CHIP_API_KEY=your-api-key
CHIP_WEBHOOK_PUBLIC_KEY=your-public-key
CHIP_CALLBACK_URL=http://localhost:3000/api/credit/webhook
BASE_URL=http://localhost:3000
CHIP_API_URL=https://gate.chip-in.asia/api/v1
NODE_ENV=development
```

Then install dotenv:
```bash
npm install dotenv
```

And add to your `server.js` at the very top:
```javascript
require('dotenv').config();
```

This will load `.env` for local development while production uses GitHub Secrets!
