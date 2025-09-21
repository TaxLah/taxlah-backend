import crypto from "crypto"

const key   = Buffer.from("12345678901234567890123456789012"); // same as frontend
const iv    = Buffer.from("1234567890123456");

export function encryptData(data) {
    const cipher    = crypto.createCipheriv("aes-256-cbc", key, iv);
    let encrypted   = cipher.update(JSON.stringify(data), "utf8", "base64");
    encrypted       += cipher.final("base64");
    return encrypted;
}

export function decryptData(encrypted) {
    const decipher    = crypto.createDecipheriv("aes-256-cbc", key, iv);
    let decrypted     = decipher.update(encrypted, "base64", "utf8");
    decrypted         += decipher.final("utf8");

    return JSON.parse(decrypted);
}

// Middleware
export function decryptMiddleware(req, res, next) {
  try {
        if (!req.body.data) return res.status(400).json({ error: "Missing encrypted data" });
        const decrypted     = decryptData(req.body.data);
        req.decryptedBody   = decrypted; // attach decrypted data for later use

        next();
  } catch (err) {
        console.error("Decryption failed:", err.message);
        return res.status(400).json({ error: "Invalid encrypted payload" });
  }
}