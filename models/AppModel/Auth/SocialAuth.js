/**
 * Social login account resolution.
 *
 * Given the claims from a verified Firebase ID token, returns the account_id and
 * auth_id to issue tokens for — creating or linking as needed. The verification
 * itself lives in FirebaseService; this file only trusts an already-decoded token
 * and never touches the network, which is what makes it unit-testable with a
 * plain object.
 *
 * Linking policy (decided with the product owner): a social login whose email is
 * verified by the provider auto-links to an existing account with the same email,
 * or registers a fresh account — either way it lands straight on the dashboard,
 * with no OTP step, because the provider already proved the email.
 */

const db = require('../../../utils/sqlbuilder');
const bcrypt = require('bcrypt');

const PROVIDER_LABEL = { 'google.com': 'Google', 'apple.com': 'Apple' };

/** Turns Firebase's sign_in_provider into our stored label. */
function providerLabel(decoded) {
    const p = decoded?.firebase?.sign_in_provider || '';
    return PROVIDER_LABEL[p] || 'Google';
}

/** A readable, unique-enough username seed from the email or name. */
function deriveUsername(email, name) {
    const base = (email ? email.split('@')[0] : (name || 'user'))
        .toLowerCase()
        .replace(/[^a-z0-9._-]/g, '')
        .slice(0, 40) || 'user';
    return base;
}

/**
 * Resolves a verified Firebase token to an { account_id, auth_id, isNew }.
 *
 * @param {object} decoded - claims from FirebaseService.verifyIdToken (uid, email, …)
 * @returns {Promise<{status: boolean, data?: object, message?: string}>}
 */
async function resolveSocialAccount(decoded) {
    try {
        const firebaseUid = decoded.uid;
        const email = (decoded.email || '').toLowerCase().trim();
        const emailVerified = decoded.email_verified === true;
        const name = decoded.name || decoded.displayName || (email ? email.split('@')[0] : 'TaxLah User');
        const provider = providerLabel(decoded);

        if (!firebaseUid) {
            return { status: false, message: 'Token is missing a user identifier.' };
        }

        // 1. Returning social login — match on the Firebase UID, the one identifier
        //    that is stable across sign-ins (this is how Apple's "email only once"
        //    is a non-issue: we never need the email again to recognise them).
        const byUid = await db.raw(
            `SELECT auth_id, account_id FROM auth_access
              WHERE auth_provider_uid = ? AND auth_status = 'Active' LIMIT 1`,
            [firebaseUid]
        );
        if (byUid.length) {
            return { status: true, data: { account_id: byUid[0].account_id, auth_id: byUid[0].auth_id, isNew: false } };
        }

        // 2. Link to an existing account with the same, provider-verified email.
        //    Only when the provider says the email is verified — an unverified email
        //    must never take over someone else's account.
        if (email && emailVerified) {
            const byEmail = await db.raw(
                `SELECT auth_id, account_id FROM auth_access
                  WHERE auth_usermail = ? AND auth_status = 'Active' LIMIT 1`,
                [email]
            );
            if (byEmail.length) {
                await db.raw(
                    `UPDATE auth_access
                        SET auth_provider = ?, auth_provider_uid = ?, auth_socmed = 'Yes',
                            auth_is_verified = 'Yes', last_modified = NOW()
                      WHERE auth_id = ?`,
                    [provider, firebaseUid, byEmail[0].auth_id]
                );
                return { status: true, data: { account_id: byEmail[0].account_id, auth_id: byEmail[0].auth_id, isNew: false, linked: true } };
            }
        }

        // 3. Brand-new user — create the account and its credential row. No password
        //    is ever usable (random 60-char bcrypt), the email is already verified by
        //    the provider, and the account is Active immediately.
        if (!email) {
            return { status: false, message: 'This sign-in did not provide an email address.' };
        }

        const now = new Date();
        const accountInsert = await db.insert('account', {
            account_name: deriveUsername(email, name),
            account_fullname: name,
            account_email: email,
            account_status: 'Active',
            account_verified: 'Approved',
            created_date: now,
            last_modified: now,
        });
        if (!accountInsert.insertId) {
            return { status: false, message: 'Could not create the account.' };
        }
        const account_id = accountInsert.insertId;

        // A random, unguessable password so the NOT NULL column is satisfied without
        // ever granting a password login to a social-only account.
        const unusablePassword = await bcrypt.hash(`social:${firebaseUid}:${Math.random()}`, 12);

        const authInsert = await db.insert('auth_access', {
            auth_username: deriveUsername(email, name),
            auth_usermail: email,
            auth_password: unusablePassword,
            auth_role: 'Individual',
            auth_socmed: 'Yes',
            auth_is_verified: 'Yes',
            auth_status: 'Active',
            account_id,
            auth_provider: provider,
            auth_provider_uid: firebaseUid,
            created_date: now,
            last_modified: now,
            is_deleted: 0,
        });
        if (!authInsert.insertId) {
            return { status: false, message: 'Could not create the credential.' };
        }

        return { status: true, data: { account_id, auth_id: authInsert.insertId, isNew: true } };
    } catch (error) {
        console.error('[SocialAuth] resolveSocialAccount error:', error);
        return { status: false, message: error.message };
    }
}

module.exports = { resolveSocialAccount, deriveUsername, providerLabel };
