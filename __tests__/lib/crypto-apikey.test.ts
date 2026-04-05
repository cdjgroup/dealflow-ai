import { describe, it, expect } from "vitest";

describe("crypto — API key utilities", () => {
  describe("generateApiKey", () => {
    it("AC-1: raw key starts with 'dfk_' prefix", async () => {
      const { generateApiKey } = await import("@/lib/crypto");
      const { raw } = generateApiKey();
      expect(raw).toMatch(/^dfk_/);
    });

    it("AC-1: raw key is approximately 47 characters long", async () => {
      const { generateApiKey } = await import("@/lib/crypto");
      const { raw } = generateApiKey();
      // prefix "dfk_" (4) + 32 bytes base64url (~43) = ~47 chars
      expect(raw.length).toBeGreaterThanOrEqual(44);
      expect(raw.length).toBeLessThanOrEqual(52);
    });

    it("AC-1: returned hash matches hashApiKey applied to raw", async () => {
      const { generateApiKey, hashApiKey } = await import("@/lib/crypto");
      const { raw, hash } = generateApiKey();
      expect(hashApiKey(raw)).toBe(hash);
    });

    it("AC-1: result includes a prefix field starting with 'dfk_' (first 12 chars of key)", async () => {
      const { generateApiKey } = await import("@/lib/crypto");
      const { raw, prefix } = generateApiKey();
      expect(prefix).toBe(raw.substring(0, 12));
      expect(prefix.startsWith("dfk_")).toBe(true);
      expect(prefix.length).toBe(12);
    });

    it("AC-2: two consecutive calls produce different raw keys", async () => {
      const { generateApiKey } = await import("@/lib/crypto");
      const first = generateApiKey();
      const second = generateApiKey();
      expect(first.raw).not.toBe(second.raw);
    });

    it("AC-2: two consecutive calls produce different hashes", async () => {
      const { generateApiKey } = await import("@/lib/crypto");
      const first = generateApiKey();
      const second = generateApiKey();
      expect(first.hash).not.toBe(second.hash);
    });
  });

  describe("hashApiKey", () => {
    it("returns a non-empty string for a valid raw key", async () => {
      const { generateApiKey, hashApiKey } = await import("@/lib/crypto");
      const { raw } = generateApiKey();
      const hash = hashApiKey(raw);
      expect(typeof hash).toBe("string");
      expect(hash.length).toBeGreaterThan(0);
    });

    it("same raw key always produces the same hash (deterministic)", async () => {
      const { generateApiKey, hashApiKey } = await import("@/lib/crypto");
      const { raw } = generateApiKey();
      expect(hashApiKey(raw)).toBe(hashApiKey(raw));
    });

    it("different raw keys produce different hashes", async () => {
      const { generateApiKey, hashApiKey } = await import("@/lib/crypto");
      const a = generateApiKey();
      const b = generateApiKey();
      expect(hashApiKey(a.raw)).not.toBe(hashApiKey(b.raw));
    });
  });
});
