import { describe, it, expect, vi, beforeEach } from "vitest";

describe("crypto", () => {
  beforeEach(() => {
    // 32 bytes base64-encoded = valid AES-256 key
    process.env.TOKEN_ENCRYPTION_KEY = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
  });

  it("AC-11: encrypt returns a base64 string different from plaintext", async () => {
    const { encrypt } = await import("@/lib/crypto");
    const plaintext = "rt_refresh_token_value_here";
    const encrypted = encrypt(plaintext);
    expect(encrypted).not.toBe(plaintext);
    expect(() => Buffer.from(encrypted, "base64")).not.toThrow();
  });

  it("AC-11: decrypt reverses encrypt", async () => {
    const { encrypt, decrypt } = await import("@/lib/crypto");
    const plaintext = "rt_refresh_token_value_here";
    const encrypted = encrypt(plaintext);
    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe(plaintext);
  });

  it("AC-11: different encryptions of same plaintext produce different ciphertexts (random IV)", async () => {
    const { encrypt } = await import("@/lib/crypto");
    const plaintext = "same-token";
    const a = encrypt(plaintext);
    const b = encrypt(plaintext);
    expect(a).not.toBe(b);
  });

  it("AC-11: tampered ciphertext throws on decrypt", async () => {
    const { encrypt, decrypt } = await import("@/lib/crypto");
    const encrypted = encrypt("secret");
    // Flip a byte in the middle
    const buf = Buffer.from(encrypted, "base64");
    buf[20] ^= 0xff;
    const tampered = buf.toString("base64");
    expect(() => decrypt(tampered)).toThrow();
  });
});
