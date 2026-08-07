/**
 * Authenticated encryption for credentials held in the database.
 *
 * Deliberately separate from utils/crypto.js, which must not be used for this:
 * that module hardcodes its key in the repository and reuses one fixed IV for every
 * value. With AES-CBC a fixed IV makes encryption deterministic — identical plaintexts
 * produce identical ciphertexts, so an attacker with read access to the table learns
 * which credentials are equal, and it offers no integrity protection at all.
 *
 * This uses AES-256-GCM: a fresh random IV per value, plus an authentication tag, so a
 * tampered ciphertext fails to decrypt rather than silently yielding wrong bytes.
 *
 * Stored format (single string, easy to keep in a TEXT column):
 *   v1.<iv-base64>.<authTag-base64>.<ciphertext-base64>
 *
 * The master key lives in CONFIG_ENCRYPTION_KEY and stays in the environment — it cannot
 * live in the database it protects. Generate one with:
 *   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
 */

const crypto = require("crypto");

const VERSION = "v1";
const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12; // 96-bit nonce, the size GCM is specified for
const KEY_BYTES = 32;

let cachedKey = null;

/**
 * Resolves the master key. Accepts base64 (preferred), hex, or a raw 32-char string so a
 * hand-written key still works.
 */
function getKey() {
    if (cachedKey) return cachedKey;

    const raw = process.env.CONFIG_ENCRYPTION_KEY;
    if (!raw) {
        throw new Error(
            "CONFIG_ENCRYPTION_KEY is not set. Stored credentials cannot be read or written without it. " +
            "Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\""
        );
    }

    let key;
    if (/^[0-9a-f]{64}$/i.test(raw)) {
        key = Buffer.from(raw, "hex");
    } else if (Buffer.from(raw, "base64").length === KEY_BYTES) {
        key = Buffer.from(raw, "base64");
    } else {
        key = Buffer.from(raw, "utf8");
    }

    if (key.length !== KEY_BYTES) {
        throw new Error(
            `CONFIG_ENCRYPTION_KEY must decode to ${KEY_BYTES} bytes, got ${key.length}.`
        );
    }

    cachedKey = key;
    return cachedKey;
}

/** True when a key is configured and usable — lets callers degrade instead of throwing. */
function isConfigured() {
    try {
        getKey();
        return true;
    } catch (e) {
        return false;
    }
}

/**
 * Encrypts a string. Returns the versioned envelope described above.
 * Empty/null input returns null so "no value" stays distinguishable from "empty string".
 */
function encrypt(plaintext) {
    if (plaintext === null || plaintext === undefined || plaintext === "") return null;

    const iv = crypto.randomBytes(IV_BYTES);
    const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);

    const ciphertext = Buffer.concat([
        cipher.update(String(plaintext), "utf8"),
        cipher.final(),
    ]);

    return [
        VERSION,
        iv.toString("base64"),
        cipher.getAuthTag().toString("base64"),
        ciphertext.toString("base64"),
    ].join(".");
}

/**
 * Decrypts a value produced by encrypt(). Throws if the payload was tampered with,
 * which is the point — a silent wrong answer would be worse than a failure.
 */
function decrypt(payload) {
    if (payload === null || payload === undefined || payload === "") return null;

    const parts = String(payload).split(".");
    if (parts.length !== 4 || parts[0] !== VERSION) {
        throw new Error("Malformed encrypted value: expected v1.<iv>.<tag>.<ciphertext>");
    }

    const [, ivB64, tagB64, dataB64] = parts;
    const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), Buffer.from(ivB64, "base64"));
    decipher.setAuthTag(Buffer.from(tagB64, "base64"));

    return Buffer.concat([
        decipher.update(Buffer.from(dataB64, "base64")),
        decipher.final(),
    ]).toString("utf8");
}

/** True if the string looks like one of our envelopes (used when migrating values in). */
function isEncrypted(value) {
    return typeof value === "string" && value.startsWith(`${VERSION}.`) && value.split(".").length === 4;
}

/**
 * Masks a secret for display: keeps the last 4 characters so an admin can recognise which
 * key is in place without the value ever leaving the server.
 */
function mask(plaintext) {
    if (!plaintext) return null;
    const s = String(plaintext);
    if (s.length <= 4) return "••••";
    return `••••••••${s.slice(-4)}`;
}

module.exports = {
    encrypt,
    decrypt,
    isEncrypted,
    isConfigured,
    mask,
};
