/**
 * Social login — Google / Apple, brokered by Firebase.
 *
 * POST /api/auth/social   { id_token }
 *
 * The app signs in with Google or Apple through Firebase and sends the resulting
 * Firebase ID token. This verifies it with firebase-admin, resolves (or creates,
 * or links) the account, and returns exactly the same { profile, access_token,
 * refresh_token } envelope as password sign-in — so everything downstream is
 * identical whether the user came in by password or social.
 *
 * No OTP: the provider has already verified the email.
 */

const express = require('express');
const router = express.Router();
const {
    DEFAULT_API_RESPONSE,
    INTERNAL_SERVER_ERROR_API_RESPONSE,
    BAD_REQUEST_API_RESPONSE,
    UNAUTHORIZED_API_RESPONSE,
    SUCCESS_API_RESPONSE,
    CREATE_ACCESS_TOKEN,
    CREATE_REFRESH_TOKEN,
    CHECK_EMPTY,
} = require('../../../configs/helper');

const moment = require('moment');
const fcm = require('../../../services/FirebaseService');
const { resolveSocialAccount } = require('../../../models/AppModel/Auth/SocialAuth');
const { AccountGetInfo } = require('../../../models/AppModel/Account');
const { UserNotificationCreate } = require('../../../models/AppModel/Notification');
const { addAutoClaimReliefs } = require('../../../models/AppModel/TaxClaimServices');

router.post('/', async (req, res) => {
    let response = { ...DEFAULT_API_RESPONSE };

    try {
        const idToken = req.body?.id_token || req.body?.firebase_id_token || null;

        if (CHECK_EMPTY(idToken)) {
            response = { ...BAD_REQUEST_API_RESPONSE, message: 'Missing id_token.', data: null };
            return res.status(response.status_code).json(response);
        }

        // 1. Verify the Firebase token. A bad token is a 401, never a 500.
        const verified = await fcm.verifyIdToken(idToken);
        if (!verified.success) {
            response = { ...UNAUTHORIZED_API_RESPONSE, message: 'Invalid or expired sign-in token.', data: { error: verified.error } };
            return res.status(response.status_code).json(response);
        }

        // 2. Find / link / create the account behind this identity.
        const resolved = await resolveSocialAccount(verified.decoded);
        if (!resolved.status) {
            response = { ...BAD_REQUEST_API_RESPONSE, message: resolved.message || 'Could not resolve the account.', data: null };
            return res.status(response.status_code).json(response);
        }

        const { account_id, auth_id, isNew } = resolved.data;

        // 3. Build the same profile + tokens password sign-in issues.
        const user_profile = await AccountGetInfo(account_id);
        const profile = {
            uid: auth_id,
            aid: account_id,
            username: user_profile.data?.account_name,
            usermail: user_profile.data?.account_email,
            ...user_profile.data,
        };

        const access_token = await CREATE_ACCESS_TOKEN(profile);
        const refresh_token = await CREATE_REFRESH_TOKEN(profile);

        // 4. Side effects mirror password login (all non-blocking / best-effort).
        UserNotificationCreate({
            account_id,
            notification_title: 'Login Successful',
            notification_description: `You've successfully logged in at ${moment().format('DD MMM YYYY, hh:mm A')}.`,
            read_status: 'No',
            archive_status: 'No',
            status: 'Active',
        }).catch(() => {});

        addAutoClaimReliefs(account_id, new Date().getFullYear())
            .catch((err) => console.error('[SocialLogin] Tax init error:', err.message));

        response = {
            ...SUCCESS_API_RESPONSE,
            status_code: 200,
            message: isNew ? 'Account created. Welcome to TaxLah.' : 'Login Successful.',
            data: {
                profile,
                access_token,
                refresh_token,
                status: 'Approved',
                is_new_account: !!isNew,
            },
        };
        return res.status(response.status_code).json(response);
    } catch (e) {
        console.error('[SocialLogin] error:', e);
        response = { ...INTERNAL_SERVER_ERROR_API_RESPONSE, data: null };
        return res.status(response.status_code).json(response);
    }
});

module.exports = router;
