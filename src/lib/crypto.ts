import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

const ALG = "aes-256-gcm";

function getKey(): Buffer {
  const b64 = process.env.TOKEN_ENCRYPTION_KEY;
  if (!b64) throw new Error("Missing TOKEN_ENCRYPTION_KEY environment variable");
  const key = Buffer.from(b64, "base64");
  if (key.length < 32) {
    throw new Error(
      `TOKEN_ENCRYPTION_KEY must decode to at least 32 bytes (got ${key.length}). ` +
      `Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
    );
  }
  return key.subarray(0, 32);
}

export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALG, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Layout: [12-byte IV][16-byte auth tag][ciphertext]
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

export function decrypt(ciphertext: string): string {
  const key = getKey();
  const buf = Buffer.from(ciphertext, "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const encrypted = buf.subarray(28);
  const decipher = createDecipheriv(ALG, key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(encrypted, undefined, "utf8") + decipher.final("utf8");
}

const API_KEY_PREFIX = "dfk_";

/**
 * SHA-256 is intentional here — NOT a mistake. API keys have 256 bits of
 * entropy (randomBytes(32)), making brute-force preimage attacks infeasible.
 * Slow hashes (bcrypt/argon2) defend against low-entropy password guessing,
 * which doesn't apply. GitHub, Stripe, and AWS use fast hashes for API keys.
 */
export function hashApiKey(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export function generateApiKey(): { raw: string; hash: string; prefix: string } {
  const random = randomBytes(32).toString("base64url");
  const raw = `${API_KEY_PREFIX}${random}`;
  const hash = hashApiKey(raw);
  return { raw, hash, prefix: raw.substring(0, 12) };
}
