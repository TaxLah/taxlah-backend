/**
 * Superadmin session handling.
 *
 * The admin JWT used to live in localStorage and travel in an Authorization header, so
 * any XSS anywhere in the admin SPA exfiltrated a full superadmin token. It now lives in
 * an httpOnly cookie that JavaScript cannot read.
 *
 * Moving to a cookie reintroduces CSRF, which the header-based scheme was immune to, so
 * every mutating request must also carry a CSRF token.
 *
 * The CSRF token is derived from the session rather than stored in a second cookie:
 * a second cookie is unreadable by document.cookie whenever the SPA and the API sit on
 * different hosts, and the four config sources in this project disagree about whether
 * they do. Deriving it means the server can always recompute the expected value from the
 * session cookie alone, whatever the topology.
 */

const crypto = require('crypto')
const jwt = require('jsonwebtoken')

const COOKIE_NAME = 'taxlah_sa'
const CSRF_HEADER = 'x-csrf-token'

// Methods that can change state. GET/HEAD/OPTIONS are exempt.
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

/**
 * Entry points that must never require a CSRF token.
 *
 * These are the routes you reach *before* holding a session, so the SPA has no token to
 * send. They still get hit while a stale cookie is present — signing in again from a
 * freshly loaded login page is exactly that case — and without this exemption that
 * request is rejected and the admin can never sign back in.
 *
 * Exempting them costs nothing: they establish identity from credentials rather than
 * acting on an existing session, so there is no ambient authority for CSRF to abuse.
 */
const CSRF_EXEMPT_PATHS = new Set([
    '/auth/login',
    '/auth/forgot-password',
    '/auth/reset-password'
])

/**
 * Cookie attributes.
 *
 * - httpOnly  : the whole point — JS cannot read it.
 * - sameSite  : 'lax' is enough because the SPA and API are same-site under taxlah.com.
 *               If the portal ever moves to a different registrable domain this must
 *               become 'none' and CSRF protection stops being optional.
 * - domain    : deliberately unset. A host-only cookie is still returned to the API host
 *               from any *.taxlah.com page. Setting Domain=.taxlah.com would attach the
 *               admin session to every mobile API request too.
 * - path      : scoped to the API surface so it is not sent to unrelated routes.
 * - secure    : derived from the request. app.set('trust proxy', 1) in server.js makes
 *               req.secure reflect X-Forwarded-Proto, so this is true behind nginx and
 *               false only for plain http://localhost during local development.
 */
function cookieOptions(req, maxAgeMs = 24 * 60 * 60 * 1000) {
    return {
        httpOnly: true,
        secure: Boolean(req.secure),
        sameSite: 'lax',
        path: '/superadmin',
        maxAge: maxAgeMs
    }
}

/** Random session id embedded in the JWT, and the seed for the CSRF token. */
function newSessionId() {
    return crypto.randomBytes(16).toString('hex')
}

/**
 * CSRF token for a session id. Unguessable without ADMIN_SECRET, and safe to hand to the
 * client in a response body — on its own it grants nothing, because the httpOnly session
 * cookie is still required.
 */
function csrfTokenFor(sessionId) {
    return crypto
        .createHmac('sha256', process.env.ADMIN_SECRET || '')
        .update(String(sessionId))
        .digest('hex')
        .substring(0, 32)
}

function safeEqual(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string') return false
    const bufA = Buffer.from(a, 'utf8')
    const bufB = Buffer.from(b, 'utf8')
    if (bufA.length !== bufB.length) return false
    return crypto.timingSafeEqual(bufA, bufB)
}

/**
 * Rejects mutating requests whose X-CSRF-Token does not match the session in the cookie.
 *
 * Reads and verifies the cookie itself rather than relying on req.payload, so it can be
 * mounted once at the /superadmin router instead of after superauth() in all 16
 * controllers.
 *
 * Requests carrying no valid session cookie pass straight through: there is no ambient
 * authority for an attacker to abuse, and superauth() will reject them anyway if the
 * route requires a session. This is what lets login, forgot-password and reset-password
 * keep working — they are POSTs made before any session exists.
 */
function csrfProtection() {
    return (req, res, next) => {
        if (!MUTATING_METHODS.has(req.method)) return next()

        // req.path here is relative to the /superadmin mount, e.g. "/auth/login".
        if (CSRF_EXEMPT_PATHS.has(req.path)) return next()

        const token = req.cookies?.[COOKIE_NAME]
        if (!token) return next()

        let sessionId
        try {
            sessionId = jwt.verify(token, process.env.ADMIN_SECRET)?.sid
        } catch (e) {
            return next() // invalid/expired session — superauth() will produce the 401
        }

        // Every cookie is minted by the login handler above, which always sets sid.
        // A valid session without one is anomalous, so fail closed rather than open.
        if (!sessionId || !safeEqual(csrfTokenFor(sessionId), req.get(CSRF_HEADER))) {
            return res.status(403).json({
                status_code: 403,
                status: 'error',
                message: 'Invalid or missing CSRF token. Please refresh and try again.',
                data: null
            })
        }

        return next()
    }
}

module.exports = {
    COOKIE_NAME,
    CSRF_HEADER,
    cookieOptions,
    newSessionId,
    csrfTokenFor,
    csrfProtection
}
