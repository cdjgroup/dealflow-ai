import { describe, it, expect, vi, beforeEach } from "vitest";
import { createDelegation, getDelegation, revokeDelegation } from "@/lib/delegation";

const mockSet = vi.fn();
const mockGet = vi.fn();
const mockDel = vi.fn();
vi.mock("@/lib/redis", () => ({
  getRedis: () => ({ set: mockSet, get: mockGet, del: mockDel }),
}));

const TEST_USER = "auth0|test123";

describe("delegation token store", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("createDelegation (AC-12)", () => {
    it("returns a delegation token with id, userId, allowedTools, ttlSeconds, createdAt, expiresAt", async () => {
      mockSet.mockResolvedValue("OK");

      const token = await createDelegation(TEST_USER, ["checkCalendar", "searchEmails"], 300);

      expect(token.id).toBeDefined();
      expect(typeof token.id).toBe("string");
      expect(token.userId).toBe(TEST_USER);
      expect(token.allowedTools).toEqual(["checkCalendar", "searchEmails"]);
      expect(token.ttlSeconds).toBe(300);
      expect(token.createdAt).toBeDefined();
      expect(token.expiresAt).toBeDefined();
    });

    it("persists the delegation to Redis with TTL", async () => {
      mockSet.mockResolvedValue("OK");

      const token = await createDelegation(TEST_USER, ["listDeals"], 600);

      expect(mockSet).toHaveBeenCalledWith(
        expect.stringContaining("delegation:"),
        expect.objectContaining({
          userId: TEST_USER,
          allowedTools: ["listDeals"],
        }),
        { ex: 600 }
      );
    });

    it("generates a unique id for each delegation", async () => {
      mockSet.mockResolvedValue("OK");

      const t1 = await createDelegation(TEST_USER, ["checkCalendar"], 60);
      const t2 = await createDelegation(TEST_USER, ["checkCalendar"], 60);

      expect(t1.id).not.toBe(t2.id);
    });
  });

  describe("getDelegation (AC-12)", () => {
    it("returns the delegation token when it exists", async () => {
      const stored = {
        id: "del-abc",
        userId: TEST_USER,
        allowedTools: ["checkCalendar"],
        ttlSeconds: 300,
        createdAt: "2026-04-03T12:00:00.000Z",
        expiresAt: "2026-04-03T12:05:00.000Z",
      };
      mockGet.mockResolvedValue(stored);

      const result = await getDelegation("del-abc");
      expect(result).toEqual(stored);
    });

    it("returns null when delegation does not exist or expired", async () => {
      mockGet.mockResolvedValue(null);

      const result = await getDelegation("del-nonexistent");
      expect(result).toBeNull();
    });
  });

  describe("revokeDelegation (AC-12)", () => {
    it("deletes the delegation from Redis", async () => {
      mockDel.mockResolvedValue(1);

      await revokeDelegation("del-abc");

      expect(mockDel).toHaveBeenCalledWith(expect.stringContaining("delegation:"));
    });
  });
});
