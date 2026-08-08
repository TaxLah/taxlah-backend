/**
 * Social login token verification — Google & Apple, verified directly.
 *
 * The app talks to Google / Apple natively and sends the provider's own ID
 * token. We verify that token against the provider's public JWKS ourselves — no
 * Firebase in the loop. (Firebase Auth would have pulled the FirebaseAuth Swift
 * pod into the iOS app, which does not integrate with the app's static-library
 * build; verifying the provider token directly keeps the mobile native build
 * unchanged and removes a whole SDK from the trust path.)
 *
 * Implementation note: this deliberately uses ONLY jsonwebtoken (already a
 * dependency) plus Node's built-in `crypto` and `https`. It does not use jwks-rsa
 * or jose — those drag in an ESM-only `jose` build, and `require()`-ing an ESM
 * module crashes on the Node version production runs (ERR_REQUIRE_ESM), which took
 * the whole API down on boot. Node can import a JWK straight into a public key via
 * crypto.createPublicKey({ format: 'jwk' }), so no JWKS library is needed.
 *
 * What "verified" means here, and why it is enough to trust the identity:
 *   - signature checked against the provider's rotating public keys (RS256)
 *   - `iss` is exactly the provider's issuer
 *   - `aud` is one of *our* client IDs / our bundle id — a token minted for some
 *     other app is rejected even if it is validly signed by the provider
 *   - `exp` enforced by jsonwebtoken
 *   - for Apple, the `nonce` claim is matched against the nonce the app generated,
 *     which is what makes a replayed token useless
 *
 * Returns a normalised claim object: { provider, uid, email, email_verified, name }.
 * `uid` is the provider's stable subject id (`sub`) — the identifier we store and
 * match returning users on, so Apple's "email/name only on first sign-in" is a
 * non-issue: we never need the email again to recognise them.
 */

const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const https = require('https');

// Client IDs / bundle id are public identifiers, not secrets — safe to default in
// code, overridable per environment.
const GOOGLE_AUDIENCES = (
    process.env.GOOGLE_OAUTH_AUDIENCES ||
    [
        // Web client id — @react-native-google-signin is configured with this as
        // its webClientId, so the idToken it returns carries this `aud`.
        '883174192008-sepa0t0gnkqsjht7u72r30a073akbj0k.apps.googleusercontent.com',
        // iOS client id (from the app's REVERSED_CLIENT_ID) — accepted too, so the
        // exchange keeps working if the token is ever minted for the iOS client.
        '883174192008-f4rrpsja8j00psqb0qko505g7j51ji45.apps.googleusercontent.com',
    ].join(',')
)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];
const GOOGLE_JWKS_URI = 'https://www.googleapis.com/oauth2/v3/certs';

// Native "Sign in with Apple" mints a token whose `aud` is the app's bundle id.
const APPLE_AUDIENCE = process.env.APPLE_BUNDLE_ID || 'com.taxlah';
const APPLE_ISSUER = 'https://appleid.apple.com';
const APPLE_JWKS_URI = 'https://appleid.apple.com/auth/keys';

// In-memory JWKS cache: uri -> { keys: { kid: pemString }, exp: epochMs }.
const jwksCache = {};
const JWKS_TTL_MS = 6 * 60 * 60 * 1000; // providers rotate keys slowly

/** GET a JSON document over https, with a short timeout. */
function httpsGetJson(url) {
    return new Promise((resolve, reject) => {
        const req = https.get(url, (res) => {
            if (res.statusCode !== 200) {
                res.resume();
                return reject(new Error(`JWKS fetch failed (${res.statusCode}) for ${url}`));
            }
            let data = '';
            res.on('data', (chunk) => (data += chunk));
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    reject(new Error('JWKS response was not valid JSON'));
                }
            });
        });
        req.on('error', reject);
        req.setTimeout(8000, () => req.destroy(new Error('JWKS fetch timed out')));
    });
}

/**
 * Resolves a `kid` to a PEM public key from the provider's JWKS, caching the whole
 * key set. On a cache miss (unknown kid, e.g. after a provider key rotation) it
 * refetches once.
 */
async function getSigningKeyPem(jwksUri, kid) {
    const now = Date.now();
    let entry = jwksCache[jwksUri];

    if (!entry || entry.exp < now || !entry.keys[kid]) {
        const jwks = await httpsGetJson(jwksUri);
        const keys = {};
        for (const jwk of jwks.keys || []) {
            try {
                keys[jwk.kid] = crypto
                    .createPublicKey({ key: jwk, format: 'jwk' })
                    .export({ type: 'spki', format: 'pem' });
            } catch (e) {
                // Skip a key we cannot import rather than failing the whole set.
            }
        }
        entry = { keys, exp: now + JWKS_TTL_MS };
        jwksCache[jwksUri] = entry;
    }

    const pem = entry.keys[kid];
    if (!pem) throw new Error(`No matching JWKS key for kid ${kid}`);
    return pem;
}

/** Verifies a token's signature + claims against a provider's JWKS. */
async function verifyWithJwks(token, jwksUri, options) {
    const decoded = jwt.decode(token, { complete: true });
    if (!decoded || !decoded.header) throw new Error('Malformed token');
    const kid = decoded.header.kid;
    if (!kid) throw new Error('Token header is missing a kid');

    const pem = await getSigningKeyPem(jwksUri, kid);
    // jwt.verify with a PEM string is synchronous: returns the payload or throws.
    return jwt.verify(token, pem, { algorithms: ['RS256'], ...options });
}

/** email_verified arrives as a boolean or the string "true" depending on provider. */
function isVerified(claim) {
    return claim === true || claim === 'true';
}

/**
 * Verifies a Google ID token.
 * @param {string} idToken
 * @returns {Promise<{provider, uid, email, email_verified, name}>}
 */
async function verifyGoogleToken(idToken) {
    const payload = await verifyWithJwks(idToken, GOOGLE_JWKS_URI, {
        issuer: GOOGLE_ISSUERS,
        audience: GOOGLE_AUDIENCES,
    });
    return {
        provider: 'Google',
        uid: payload.sub,
        email: payload.email || null,
        email_verified: isVerified(payload.email_verified),
        name: payload.name || null,
    };
}

/**
 * Verifies an Apple identity token, and (when a nonce was used) checks it.
 *
 * The app generates a random nonce, hands Apple its SHA-256 hash, and Apple echoes
 * that hash back in the token's `nonce` claim; the app sends us the *raw* nonce.
 * We accept a match against either the raw value or its SHA-256 hash, since the
 * exact form depends on the native library version — either way a token minted for
 * a different sign-in attempt won't match.
 *
 * @param {string} idToken - Apple identityToken
 * @param {string} [rawNonce] - the un-hashed nonce the app generated
 * @returns {Promise<{provider, uid, email, email_verified, name}>}
 */
async function verifyAppleToken(idToken, rawNonce) {
    const payload = await verifyWithJwks(idToken, APPLE_JWKS_URI, {
        issuer: APPLE_ISSUER,
        audience: APPLE_AUDIENCE,
    });

    if (payload.nonce) {
        const hashed = crypto.createHash('sha256').update(String(rawNonce || '')).digest('hex');
        if (payload.nonce !== rawNonce && payload.nonce !== hashed) {
            throw new Error('Apple token nonce mismatch');
        }
    }

    return {
        provider: 'Apple',
        uid: payload.sub,
        // Apple only returns the email on the first authorisation; absent later.
        email: payload.email || null,
        email_verified: isVerified(payload.email_verified),
        // Name is never in the Apple token — it comes from the app on first sign-in.
        name: null,
    };
}

/**
 * Verifies whichever provider the app named. A bad token throws; the caller turns
 * that into a 401.
 *
 * @param {string} provider - 'Google' | 'Apple' (case-insensitive)
 * @param {string} idToken
 * @param {string} [nonce] - raw nonce, Apple only
 * @returns {Promise<{provider, uid, email, email_verified, name}>}
 */
async function verifySocialToken(provider, idToken, nonce) {
    const p = String(provider || '').toLowerCase();
    if (p === 'google') return verifyGoogleToken(idToken);
    if (p === 'apple') return verifyAppleToken(idToken, nonce);
    throw new Error(`Unsupported social provider: ${provider}`);
}

module.exports = { verifySocialToken, verifyGoogleToken, verifyAppleToken };
