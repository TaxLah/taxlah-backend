#!/usr/bin/env node
/**
 * Prints the values that must be added as GitHub Environment secrets before deploying.
 *
 *   node scripts/print-deploy-secrets.js development
 *
 * Run it yourself and copy into GitHub → Settings → Environments → <env> → Secrets.
 * Nothing is sent anywhere; this only reads your local env.yaml.
 */
const path = require("path");
const yenv = require("yenv");

const env = process.argv[2];
if (!["development", "staging", "production"].includes(env)) {
    console.error("\n  Usage: node scripts/print-deploy-secrets.js <development|staging|production>\n");
    process.exit(1);
}

// yenv wraps the object in keyblade, which THROWS on an undefined key rather than
// returning undefined. Read through a helper so a missing value is reportable.
const e = yenv(path.join(__dirname, "..", "env.yaml"), { env });
const read = (k) => { try { return e[k]; } catch { return null; } };

// Only the ones the workflow did not previously write. Everything else is already set.
const NEEDED = [
    "CONFIG_ENCRYPTION_KEY",
    // Not in env.yaml: the deploy writes it to taxlah-fcmadmin.json on the server.
    // Without it Firebase never initialises and every push silently fails.
    "FIREBASE_SERVICE_ACCOUNT",
    "GMAIL_USER",
    "GMAIL_CLIENT_ID",
    "GMAIL_CLIENT_SECRET",
    "GMAIL_REFRESH_TOKEN",
    "RECEIPT_TOKEN_SECRET",
];

console.log(`\n  GitHub Environment: ${env}\n`);
for (const k of NEEDED) {
    const v = read(k);
    console.log(`  ${k}`);
    console.log(`  ${v ? v : "*** NOT IN env.yaml — you must supply this ***"}\n`);
}
console.log("  Paste each into GitHub → Settings → Environments → " + env + " → Add secret\n");
