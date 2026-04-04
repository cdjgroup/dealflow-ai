import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSet = vi.fn();
const mockGet = vi.fn();
const mockDel = vi.fn();

vi.mock("@/lib/redis", () => ({
  getRedis: () => ({
    set: mockSet,
    get: mockGet,
    del: mockDel,
  }),
}));

// Mock crypto module
const mockEncrypt = vi.fn((s: string) => `encrypted:${s}`);
const mockDecrypt = vi.fn((s: string) => s.replace("encrypted:", ""));
vi.mock("@/lib/crypto", () => ({
  encrypt: (s: string) => mockEncrypt(s),
  decrypt: (s: string) => mockDecrypt(s),
}));

const {
  storeScheduleRefreshToken,
  getScheduleRefreshToken,
  deleteScheduleRefreshToken,
} = await import("@/lib/data/schedule-tokens");

const TEST_USER = "auth0|user1";
const TEST_TOKEN = "v1.refresh-token-abc123";

describe("schedule-tokens data layer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("storeScheduleRefreshToken", () => {
    it("AC-11: encrypts token before storing in Redis", async () => {
      mockSet.mockResolvedValue("OK");
      await storeScheduleRefreshToken(TEST_USER, TEST_TOKEN);

      expect(mockEncrypt).toHaveBeenCalledWith(TEST_TOKEN);
      expect(mockSet).toHaveBeenCalledWith(
        `${TEST_USER}:schedule:refresh-token`,
        `encrypted:${TEST_TOKEN}`,
        { ex: 90 * 24 * 60 * 60 } // 90 day TTL
      );
    });
  });

  describe("getScheduleRefreshToken", () => {
    it("AC-11: decrypts token after reading from Redis", async () => {
      mockGet.mockResolvedValue(`encrypted:${TEST_TOKEN}`);
      const result = await getScheduleRefreshToken(TEST_USER);

      expect(mockGet).toHaveBeenCalledWith(`${TEST_USER}:schedule:refresh-token`);
      expect(mockDecrypt).toHaveBeenCalledWith(`encrypted:${TEST_TOKEN}`);
      expect(result).toBe(TEST_TOKEN);
    });

    it("AC-10: returns null when no token stored", async () => {
      mockGet.mockResolvedValue(null);
      const result = await getScheduleRefreshToken(TEST_USER);
      expect(result).toBeNull();
    });
  });

  describe("deleteScheduleRefreshToken", () => {
    it("AC-2: deletes token from Redis", async () => {
      mockDel.mockResolvedValue(1);
      await deleteScheduleRefreshToken(TEST_USER);
      expect(mockDel).toHaveBeenCalledWith(`${TEST_USER}:schedule:refresh-token`);
    });
  });
});
