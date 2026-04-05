import { describe, it, expect, vi, beforeEach } from "vitest";
import { recordMcpCall, getMcpAnalytics } from "@/lib/data/mcp-analytics";

const mockGet = vi.fn();
const mockSet = vi.fn();
const mockHincrby = vi.fn();
const mockHgetall = vi.fn();
const mockPipelineExec = vi.fn();
const mockPipeline = vi.fn(() => ({ exec: mockPipelineExec }));

vi.mock("@/lib/redis", () => ({
  getRedis: () => ({
    get: mockGet,
    set: mockSet,
    hincrby: mockHincrby,
    hgetall: mockHgetall,
    pipeline: mockPipeline,
  }),
}));

const TEST_USER = "auth0|test-user-analytics";
const TEST_CLIENT = "client-bot-a";

describe("mcp-analytics data layer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ----------------------------------------------------------------
  // recordMcpCall
  // ----------------------------------------------------------------
  describe("recordMcpCall", () => {
    it("records a successful call without throwing", async () => {
      // Arrange
      mockHincrby.mockResolvedValue(1);

      // Act + Assert
      await expect(
        recordMcpCall(TEST_USER, TEST_CLIENT, "listDeals", true)
      ).resolves.toBeUndefined();
    });

    it("records a failed call without throwing", async () => {
      // Arrange
      mockHincrby.mockResolvedValue(1);

      // Act + Assert
      await expect(
        recordMcpCall(TEST_USER, TEST_CLIENT, "searchContacts", false)
      ).resolves.toBeUndefined();
    });

    it("increments a counter in Redis on each call", async () => {
      // Arrange
      mockHincrby.mockResolvedValue(1);

      // Act
      await recordMcpCall(TEST_USER, TEST_CLIENT, "listDeals", true);

      // Assert — hincrby (or equivalent) must be called to persist the count
      expect(mockHincrby).toHaveBeenCalled();
    });

    it("does not throw when Redis fails", async () => {
      // Arrange — Redis is down
      mockHincrby.mockRejectedValue(new Error("Redis connection refused"));

      // Act + Assert — should silently absorb the error (fire-and-forget pattern)
      await expect(
        recordMcpCall(TEST_USER, TEST_CLIENT, "listDeals", true)
      ).resolves.toBeUndefined();
    });
  });

  // ----------------------------------------------------------------
  // getMcpAnalytics
  // ----------------------------------------------------------------
  describe("getMcpAnalytics", () => {
    it("AC-18: returns totalCalls=7 after 5 successes and 2 failures", async () => {
      // Arrange — simulate stored hash reflecting 5 successes and 2 failures
      mockHgetall.mockResolvedValue({
        totalCalls: "7",
        successCount: "5",
        errorCount: "2",
      });

      // Act
      const analytics = await getMcpAnalytics(TEST_USER, TEST_CLIENT, 1);

      // Assert
      expect(analytics.totalCalls).toBe(7);
      expect(analytics.successCount).toBe(5);
      expect(analytics.errorCount).toBe(2);
    });

    it("AC-18: successRate equals successCount / totalCalls", async () => {
      // Arrange — 5 successes out of 7 calls = ~71.4%
      mockHgetall.mockResolvedValue({
        totalCalls: "7",
        successCount: "5",
        errorCount: "2",
      });

      // Act
      const analytics = await getMcpAnalytics(TEST_USER, TEST_CLIENT, 1);

      // Assert — successRate should be the ratio (implementation may express as 0-1 or 0-100)
      const expectedRate = 5 / 7;
      expect(analytics.successRate).toBeCloseTo(expectedRate, 2);
    });

    it("returns zero counts when no calls have been recorded", async () => {
      // Arrange — nothing stored yet
      mockHgetall.mockResolvedValue(null);

      // Act
      const analytics = await getMcpAnalytics(TEST_USER, TEST_CLIENT);

      // Assert
      expect(analytics.totalCalls).toBe(0);
      expect(analytics.successCount).toBe(0);
      expect(analytics.errorCount).toBe(0);
    });

    it("returns successRate of 0 when totalCalls is 0 (no division by zero)", async () => {
      // Arrange
      mockHgetall.mockResolvedValue(null);

      // Act
      const analytics = await getMcpAnalytics(TEST_USER, TEST_CLIENT);

      // Assert — must not produce NaN or Infinity
      expect(analytics.successRate).toBe(0);
    });

    it("returns a topTools array in the response", async () => {
      // Arrange
      mockHgetall.mockResolvedValue({
        totalCalls: "5",
        successCount: "5",
        errorCount: "0",
      });

      // Act
      const analytics = await getMcpAnalytics(TEST_USER, TEST_CLIENT, 1);

      // Assert — field must be present even if empty
      expect(Array.isArray(analytics.topTools)).toBe(true);
    });

    it("returns a dailyBreakdown array in the response", async () => {
      // Arrange
      mockHgetall.mockResolvedValue({
        totalCalls: "5",
        successCount: "5",
        errorCount: "0",
      });

      // Act
      const analytics = await getMcpAnalytics(TEST_USER, TEST_CLIENT, 1);

      // Assert — field must be present even if empty
      expect(Array.isArray(analytics.dailyBreakdown)).toBe(true);
    });

    it("accepts an optional days parameter without throwing", async () => {
      // Arrange
      mockHgetall.mockResolvedValue({
        totalCalls: "3",
        successCount: "3",
        errorCount: "0",
      });

      // Act + Assert — no exception thrown when days is provided
      await expect(
        getMcpAnalytics(TEST_USER, TEST_CLIENT, 7)
      ).resolves.toBeDefined();
    });

    it("returns analytics scoped to the specific clientId (not all clients)", async () => {
      // Arrange — only Bot-A has data; Bot-B returns null
      mockHgetall.mockImplementation(async (key: string) => {
        if (key.includes(TEST_CLIENT)) {
          return { totalCalls: "7", successCount: "5", errorCount: "2" };
        }
        return null;
      });

      // Act
      const analytics = await getMcpAnalytics(TEST_USER, TEST_CLIENT, 1);

      // Assert
      expect(analytics.totalCalls).toBe(7);
    });

    it("errorCount + successCount equals totalCalls", async () => {
      // Arrange
      mockHgetall.mockResolvedValue({
        totalCalls: "7",
        successCount: "5",
        errorCount: "2",
      });

      // Act
      const analytics = await getMcpAnalytics(TEST_USER, TEST_CLIENT);

      // Assert — counts must be internally consistent
      expect(analytics.successCount + analytics.errorCount).toBe(
        analytics.totalCalls
      );
    });
  });
});
