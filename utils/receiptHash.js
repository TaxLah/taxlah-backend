/**
 * Receipt hash utilities for duplicate detection
 *
 * computeFileHash(filePath)
 *   → SHA-256 hex of the raw file buffer
 *   → Catches byte-identical re-uploads (same file, different upload time)
 *
 * computePerceptualHash(filePath)
 *   → 64-bit average hash (aHash) via sharp
 *   → Resize to 8×8 grayscale, compare each pixel to mean → 64-bit integer
 *   → Hamming distance ≤ 10 = same-looking receipt photographed multiple times
 *   → Returns null for PDFs or if image processing fails (non-fatal)
 *
 * hammingDistance(a, b)
 *   → Count differing bits between two BigInts
 *
 * PHASH_THRESHOLD
 *   → Max allowed Hamming distance for a "similar image" match (10 = ~85 % similarity)
 */

const fs     = require('fs');
const crypto = require('crypto');
const sharp  = require('sharp');

const PHASH_THRESHOLD = 10; // bits — tune up/down to widen/narrow similarity window

/**
 * Compute SHA-256 hex hash of the raw file at filePath.
 * @param {string} filePath  Absolute path on disk
 * @returns {string} 64-char lowercase hex string
 */
function computeFileHash(filePath) {
    const buffer = fs.readFileSync(filePath);
    return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * Compute a 64-bit average perceptual hash of an image.
 * Returns null when the file is a PDF or when sharp cannot process it.
 *
 * Algorithm (aHash):
 *  1. Resize to 8×8 pixels, flatten to greyscale
 *  2. Compute mean pixel value
 *  3. Bit i = 1 if pixel[i] >= mean, 0 otherwise
 *  4. Pack 64 bits into a BigInt
 *
 * @param {string} filePath      Absolute path on disk
 * @param {string} [mimetype]    Optional MIME type; skips processing for PDFs
 * @returns {Promise<BigInt|null>}
 */
async function computePerceptualHash(filePath, mimetype) {
    // Skip non-image files
    if (mimetype && (mimetype === 'application/pdf' || !mimetype.startsWith('image/'))) {
        return null;
    }

    try {
        const { data } = await sharp(filePath)
            .resize(8, 8, { fit: 'fill' })
            .greyscale()
            .raw()
            .toBuffer({ resolveWithObject: true });

        const pixels = Array.from(data); // 64 bytes, each 0-255
        const mean   = pixels.reduce((s, v) => s + v, 0) / pixels.length;

        let hash = 0n;
        for (let i = 0; i < 64; i++) {
            if (pixels[i] >= mean) {
                hash |= (1n << BigInt(63 - i));
            }
        }
        return hash;
    } catch (err) {
        console.warn('[receiptHash] perceptual hash failed, skipping:', err.message);
        return null;
    }
}

/**
 * Count differing bits between two BigInt hashes (Hamming distance).
 * @param {BigInt} a
 * @param {BigInt} b
 * @returns {number}
 */
function hammingDistance(a, b) {
    let xor = a ^ b;
    let dist = 0;
    while (xor > 0n) {
        if (xor & 1n) dist++;
        xor >>= 1n;
    }
    return dist;
}

module.exports = { computeFileHash, computePerceptualHash, hammingDistance, PHASH_THRESHOLD };
