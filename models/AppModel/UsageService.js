/**
 * Account usage against the entitlements of the user's plan.
 *
 * Storage is measured by walking the account's upload folder rather than read from a
 * counter, because no counter exists: account_file and account_storage are defined in
 * the schema but hold zero rows in production while 2,944 receipts have been uploaded,
 * so nothing has ever written to them. Summing the directory is accurate for every
 * existing user from the first request, with no migration and no backfill — the cost is
 * one directory read per call, which is small next to the queries this sits beside.
 *
 * If that ever becomes hot, the fix is to cache this or start maintaining a counter;
 * neither changes the shape returned here.
 */

const fs = require('fs');
const path = require('path');
const db = require('../../utils/sqlbuilder');
const ConfigService = require('../../services/ConfigService');

const ASSET_ROOT = path.join(__dirname, '../../asset');

/** Plan used when the account has no active subscription. */
const FREE_PACKAGE_CODE = 'BASIC';

/**
 * Total bytes stored under a directory, one level deep.
 *
 * Uploads are flat inside asset/<account_id>/, so recursion is unnecessary. Anything
 * unreadable is skipped: a usage figure is not worth failing the dashboard over.
 */
function directoryBytes(dir) {
    let total = 0;
    let files = 0;

    if (!fs.existsSync(dir)) return { total, files };

    let entries;
    try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (e) {
        console.error('[UsageService] cannot read', dir, e.message);
        return { total, files };
    }

    for (const entry of entries) {
        const full = path.join(dir, entry.name);
        try {
            if (entry.isDirectory()) {
                const nested = directoryBytes(full);
                total += nested.total;
                files += nested.files;
            } else {
                total += fs.statSync(full).size;
                files += 1;
            }
        } catch (e) {
            // File removed between readdir and stat, or a permission problem.
            continue;
        }
    }

    return { total, files };
}

/** Reports the account has generated, counted from both folders reports can live in. */
function countReports(accountId) {
    const dirs = [
        path.join(ASSET_ROOT, 'document', String(accountId)),
        path.join(__dirname, '../../assets/document'),
    ];

    let count = 0;
    let bytes = 0;

    for (const dir of dirs) {
        if (!fs.existsSync(dir)) continue;
        let files;
        try {
            files = fs.readdirSync(dir);
        } catch (e) {
            continue;
        }
        for (const f of files) {
            if (!f.startsWith('tax_report_') || !f.includes(`_${accountId}_`) || !f.endsWith('.pdf')) continue;
            try {
                bytes += fs.statSync(path.join(dir, f)).size;
                count += 1;
            } catch (e) {
                continue;
            }
        }
    }

    return { count, bytes };
}

/** The plan whose limits apply: the active subscription's, else the free package. */
async function resolvePlan(accountId) {
    const active = await db.raw(
        `SELECT p.package_code, p.package_name, p.storage_limit_mb, p.max_receipts, p.max_reports
           FROM account_subscription s
           JOIN subscription_package p ON p.sub_package_id = s.sub_package_id
          WHERE s.account_id = ?
            AND s.status IN ('Active', 'Trial')
          ORDER BY s.subscription_id DESC
          LIMIT 1`,
        [accountId]
    );

    if (active.length) return { ...active[0], is_free: false };

    const free = await db.raw(
        `SELECT package_code, package_name, storage_limit_mb, max_receipts, max_reports
           FROM subscription_package
          WHERE package_code = ?
          LIMIT 1`,
        [FREE_PACKAGE_CODE]
    );

    return free.length
        ? { ...free[0], is_free: true }
        : { package_code: FREE_PACKAGE_CODE, package_name: 'Free', storage_limit_mb: null, max_receipts: null, max_reports: null, is_free: true };
}

/**
 * Builds one metric.
 *
 * A null limit means unlimited, which is meaningfully different from a limit of zero —
 * so remaining and percentage are null rather than 0, and the caller can render
 * "Unlimited" instead of a full bar.
 */
function metric(used, limit) {
    const cap = limit === null || limit === undefined ? null : Number(limit);
    const unlimited = cap === null;
    const usedNum = Number(used) || 0;

    return {
        used: usedNum,
        limit: cap,
        unlimited,
        // Rounded because the subtraction is done in binary floating point, where
        // 20 - 19.81 lands on 0.19000000000000128 — and the app prints this figure
        // as it arrives, so the artefact reached the dashboard verbatim. Storage is
        // reported to two decimals (see storageMb), so rounding to the same
        // precision loses nothing; receipt and report counts are whole numbers and
        // are unaffected.
        remaining: unlimited ? null : Math.max(round2(cap - usedNum), 0),
        percentage: unlimited || cap <= 0 ? null : Math.min(Math.round((usedNum / cap) * 100), 100),
    };
}

/** Two decimal places, without the float tail that plain subtraction leaves behind. */
function round2(n) {
    return Math.round(n * 100) / 100;
}

async function getAccountUsage(accountId) {
    const plan = await resolvePlan(accountId);

    /**
     * Whether the plan's limits are actually being applied.
     *
     * Quota gating is deliberately off during the beta, so real accounts already sit
     * well past their nominal caps — one development account has 19 receipts against a
     * limit of 3. Reporting "19 / 3, 0 left" would warn users about a ceiling nothing
     * enforces. While APP_MODE is Beta the figures are informational, and the app is
     * told so rather than having to infer it.
     */
    const mode = String((await ConfigService.get('app', 'APP_MODE', 'Beta')) || 'Beta').trim();
    const enforced = mode.toLowerCase() === 'live';

    // Uploads live in asset/<account_id>/; generated reports in asset/document/<id>/.
    const uploads = directoryBytes(path.join(ASSET_ROOT, String(accountId)));
    const reports = countReports(accountId);

    const storageBytes = uploads.total + reports.bytes;
    const storageMb = Number((storageBytes / (1024 * 1024)).toFixed(2));

    const receiptRow = await db.raw(
        `SELECT COUNT(*) AS total FROM receipt WHERE account_id = ? AND status = 'Active'`,
        [accountId]
    );
    const receiptCount = Number(receiptRow[0]?.total || 0);

    return {
        plan: {
            package_code: plan.package_code,
            package_name: plan.package_name,
            is_free: plan.is_free,
            // False while the beta is running: limits exist but nothing applies them.
            limits_enforced: enforced,
        },
        storage: {
            ...metric(storageMb, plan.storage_limit_mb),
            unit: 'MB',
            file_count: uploads.files + reports.count,
        },
        receipts: metric(receiptCount, plan.max_receipts),
        reports: metric(reports.count, plan.max_reports),
    };
}

module.exports = { getAccountUsage };
