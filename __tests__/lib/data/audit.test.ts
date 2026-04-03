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

    // --- Filter tests (AC-9, AC-10) ---

    const MIXED_ENTRIES = [
      JSON.stringify({
        id: "b1",
        userId: TEST_USER,
        threadId: "t1",
        toolName: "checkCalendar",
        input: {},
        result: "success",
        timestamp: "2026-04-01T10:00:00Z",
      }),
      JSON.stringify({
        id: "b2",
        userId: TEST_USER,
        threadId: "t1",
        toolName: "draftEmail",
        input: {},
        result: "error",
        errorMessage: "Gmail API error",
        timestamp: "2026-04-01T11:00:00Z",
      }),
      JSON.stringify({
        id: "b3",
        userId: TEST_USER,
        threadId: "t2",
        toolName: "checkCalendar",
        input: {},
        result: "error",
        errorMessage: "Calendar API error",
        timestamp: "2026-04-02T09:00:00Z",
      }),
      JSON.stringify({
        id: "b4",
        userId: TEST_USER,
        threadId: "t2",
        toolName: "listDeals",
        input: {},
        result: "success",
        timestamp: "2026-04-03T08:00:00Z",
      }),
    ];

    it("AC-9: filters by toolName and returns only matching entries", async () => {
      // Arrange
      mockLrange.mockResolvedValue(MIXED_ENTRIES);

      // Act
      const log = await getAuditLog(TEST_USER, { toolName: "checkCalendar" });

      // Assert — only b1 and b3 match toolName "checkCalendar"
      expect(log).toHaveLength(2);
      expect(log.every((e) => e.toolName === "checkCalendar")).toBe(true);
    });

    it("AC-9: returns empty array when no entries match toolName", async () => {
      // Arrange
      mockLrange.mockResolvedValue(MIXED_ENTRIES);

      // Act
      const log = await getAuditLog(TEST_USER, { toolName: "searchEmails" });

      // Assert — no entries have toolName "searchEmails"
      expect(log).toEqual([]);
    });

    it("AC-10: filters by result and returns only error entries", async () => {
      // Arrange
      mockLrange.mockResolvedValue(MIXED_ENTRIES);

      // Act
      const log = await getAuditLog(TEST_USER, { result: "error" });

      // Assert — only b2 and b3 have result "error"
      expect(log).toHaveLength(2);
      expect(log.every((e) => e.result === "error")).toBe(true);
    });

    it("AC-10: filters by result and returns only success entries", async () => {
      // Arrange
      mockLrange.mockResolvedValue(MIXED_ENTRIES);

      // Act
      const log = await getAuditLog(TEST_USER, { result: "success" });

      // Assert — only b1 and b4 have result "success"
      expect(log).toHaveLength(2);
      expect(log.every((e) => e.result === "success")).toBe(true);
    });

    it("AC-9+AC-10: combined toolName and result filters AND together", async () => {
      // Arrange
      mockLrange.mockResolvedValue(MIXED_ENTRIES);

      // Act — only b3 is checkCalendar AND error
      const log = await getAuditLog(TEST_USER, {
        toolName: "checkCalendar",
        result: "error",
      });

      // Assert
      expect(log).toHaveLength(1);
      expect(log[0].id).toBe("b3");
    });

    it("combined filters return empty array when no entries satisfy all conditions", async () => {
      // Arrange
      mockLrange.mockResolvedValue(MIXED_ENTRIES);

      // Act — no entry is both listDeals AND error
      const log = await getAuditLog(TEST_USER, {
        toolName: "listDeals",
        result: "error",
      });

      // Assert
      expect(log).toEqual([]);
    });

    it("date range filter returns only entries within startDate and endDate (inclusive)", async () => {
      // Arrange
      mockLrange.mockResolvedValue(MIXED_ENTRIES);

      // Act — b1 and b2 and b3 fall within 2026-04-01 to 2026-04-02; b4 is 2026-04-03
      const log = await getAuditLog(TEST_USER, {
        startDate: "2026-04-01",
        endDate: "2026-04-02",
      });

      // Assert — b4 (2026-04-03) excluded
      expect(log).toHaveLength(3);
      expect(log.map((e) => e.id)).toEqual(
        expect.arrayContaining(["b1", "b2", "b3"])
      );
      expect(log.map((e) => e.id)).not.toContain("b4");
    });

    it("date range filter returns empty array when no entries fall within range", async () => {
      // Arrange
      mockLrange.mockResolvedValue(MIXED_ENTRIES);

      // Act — no entries in 2025 date range
      const log = await getAuditLog(TEST_USER, {
        startDate: "2025-01-01",
        endDate: "2025-12-31",
      });

      // Assert
      expect(log).toEqual([]);
    });

    it("date range combined with toolName ANDs both conditions", async () => {
      // Arrange
      mockLrange.mockResolvedValue(MIXED_ENTRIES);

      // Act — checkCalendar entries within 2026-04-01 to 2026-04-02: b1 and b3
      const log = await getAuditLog(TEST_USER, {
        toolName: "checkCalendar",
        startDate: "2026-04-01",
        endDate: "2026-04-02",
      });

      // Assert
      expect(log).toHaveLength(2);
      expect(log.every((e) => e.toolName === "checkCalendar")).toBe(true);
    });
  });
});
