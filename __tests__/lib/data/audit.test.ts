import { describe, it, expect, vi, beforeEach } from "vitest";
import { writeAuditEntry, getAuditLog } from "@/lib/data/audit";

const mockLpush = vi.fn();
const mockLrange = vi.fn();
const mockExpire = vi.fn();
vi.mock("@/lib/redis", () => ({
  getRedis: () => ({
    lpush: mockLpush,
    lrange: mockLrange,
    expire: mockExpire,
  }),
}));

const TEST_USER = "auth0|test123";

describe("audit data layer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("writeAuditEntry", () => {
    it("writes entry to Redis list with correct key", async () => {
      mockLpush.mockResolvedValue(1);
      mockExpire.mockResolvedValue(1);

      const entry = await writeAuditEntry(TEST_USER, {
        threadId: "thread-1",
        toolName: "checkCalendar",
        input: { date: "2026-04-02" },
        result: "success",
        durationMs: 150,
      });

      expect(mockLpush).toHaveBeenCalledWith(
        `${TEST_USER}:audit`,
        expect.stringContaining('"toolName":"checkCalendar"')
      );
      expect(entry.id).toBeDefined();
      expect(entry.timestamp).toBeDefined();
    });

    it("sets TTL on audit list", async () => {
      mockLpush.mockResolvedValue(1);
      mockExpire.mockResolvedValue(1);

      await writeAuditEntry(TEST_USER, {
        threadId: "t1",
        toolName: "listDeals",
        input: {},
        result: "success",
      });

      expect(mockExpire).toHaveBeenCalledWith(
        `${TEST_USER}:audit`,
        7 * 24 * 60 * 60 // 7 days
      );
    });

    it("does not throw when Redis fails", async () => {
      mockLpush.mockRejectedValue(new Error("Redis down"));

      // Should not throw — fire and forget
      await expect(
        writeAuditEntry(TEST_USER, {
          threadId: "t1",
          toolName: "listDeals",
          input: {},
          result: "success",
        })
      ).resolves.toBeDefined();
    });

    it("records error entries", async () => {
      mockLpush.mockResolvedValue(1);
      mockExpire.mockResolvedValue(1);

      const entry = await writeAuditEntry(TEST_USER, {
        threadId: "t1",
        toolName: "draftEmail",
        input: { to: "test@example.com" },
        result: "error",
        errorMessage: "Gmail API error",
      });

      expect(entry.result).toBe("error");
      expect(entry.errorMessage).toBe("Gmail API error");
    });
  });

  describe("getAuditLog", () => {
    it("returns entries from Redis list", async () => {
      const stored = [
        JSON.stringify({
          id: "a1",
          toolName: "checkCalendar",
          result: "success",
          timestamp: "2026-04-02T00:00:00Z",
        }),
      ];
      mockLrange.mockResolvedValue(stored);

      const log = await getAuditLog(TEST_USER);
      expect(log).toHaveLength(1);
      expect(log[0].toolName).toBe("checkCalendar");
    });

    it("respects limit parameter", async () => {
      mockLrange.mockResolvedValue([]);
      await getAuditLog(TEST_USER, { limit: 10 });
      expect(mockLrange).toHaveBeenCalledWith(`${TEST_USER}:audit`, 0, 9);
    });

    it("defaults to 50 entries", async () => {
      mockLrange.mockResolvedValue([]);
      await getAuditLog(TEST_USER);
      expect(mockLrange).toHaveBeenCalledWith(`${TEST_USER}:audit`, 0, 49);
    });

    it("handles empty log", async () => {
      mockLrange.mockResolvedValue([]);
      const log = await getAuditLog(TEST_USER);
      expect(log).toEqual([]);
    });
  });
});
