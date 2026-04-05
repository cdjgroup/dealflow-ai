import { describe, it, expect, vi, beforeEach } from "vitest";
import { DEFAULT_TRUST_STATS } from "@/lib/types/settings";
import type { TrustStats } from "@/lib/types/settings";

// Mock Redis — same shape used across all settings data layer tests
const mockGet = vi.fn();
const mockSet = vi.fn();
vi.mock("@/lib/redis", () => ({
  getRedis: () => ({ get: mockGet, set: mockSet }),
}));

const { getTrustStats, incrementTrustStat } = await import(
  "@/lib/data/settings"
);

const TEST_USER = "auth0|trust-test-user";

describe("trust calibration stats data layer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getTrustStats", () => {
    it("AC-5: returns DEFAULT_TRUST_STATS when no stats exist in Redis", async () => {
      // Arrange
      mockGet.mockResolvedValue(null);

      // Act
      const stats = await getTrustStats(TEST_USER);

      // Assert
      expect(stats).toEqual(DEFAULT_TRUST_STATS);
    });

    it("returns all three action types with approved and dismissed counters in defaults", async () => {
      // Arrange
      mockGet.mockResolvedValue(null);

      // Act
      const stats = await getTrustStats(TEST_USER);

      // Assert — default values are zeroed out for all action types
      expect(stats.email).toEqual({ approved: 0, dismissed: 0 });
      expect(stats.calendar).toEqual({ approved: 0, dismissed: 0 });
      expect(stats.slack).toEqual({ approved: 0, dismissed: 0 });
    });

    it("returns stored stats when they exist in Redis", async () => {
      // Arrange
      const stored: TrustStats = {
        email: { approved: 5, dismissed: 2 },
        calendar: { approved: 1, dismissed: 0 },
        slack: { approved: 3, dismissed: 1 },
      };
      mockGet.mockResolvedValue(stored);

      // Act
      const stats = await getTrustStats(TEST_USER);

      // Assert — returns what was stored, not defaults
      expect(stats.email.approved).toBe(5);
      expect(stats.email.dismissed).toBe(2);
      expect(stats.calendar.approved).toBe(1);
      expect(stats.slack.dismissed).toBe(1);
    });

    it("uses the correct Redis key for the given userId", async () => {
      // Arrange
      mockGet.mockResolvedValue(null);

      // Act
      await getTrustStats(TEST_USER);

      // Assert
      expect(mockGet).toHaveBeenCalledWith(`${TEST_USER}:trustStats`);
    });
  });

  describe("incrementTrustStat", () => {
    it("AC-5: increments email.approved counter by 1", async () => {
      // Arrange — existing stats start at zero
      const initial: TrustStats = {
        email: { approved: 0, dismissed: 0 },
        calendar: { approved: 0, dismissed: 0 },
        slack: { approved: 0, dismissed: 0 },
      };
      mockGet.mockResolvedValue(initial);
      mockSet.mockResolvedValue("OK");

      // Act
      await incrementTrustStat(TEST_USER, "email", "approved");

      // Assert — set is called with email.approved = 1
      expect(mockSet).toHaveBeenCalledWith(
        `${TEST_USER}:trustStats`,
        expect.objectContaining({
          email: expect.objectContaining({ approved: 1, dismissed: 0 }),
        })
      );
    });

    it("AC-6: increments calendar.dismissed counter by 1", async () => {
      // Arrange
      const initial: TrustStats = {
        email: { approved: 2, dismissed: 0 },
        calendar: { approved: 0, dismissed: 0 },
        slack: { approved: 0, dismissed: 0 },
      };
      mockGet.mockResolvedValue(initial);
      mockSet.mockResolvedValue("OK");

      // Act
      await incrementTrustStat(TEST_USER, "calendar", "dismissed");

      // Assert — only calendar.dismissed is bumped; other counters unchanged
      expect(mockSet).toHaveBeenCalledWith(
        `${TEST_USER}:trustStats`,
        expect.objectContaining({
          email: expect.objectContaining({ approved: 2, dismissed: 0 }),
          calendar: expect.objectContaining({ approved: 0, dismissed: 1 }),
          slack: expect.objectContaining({ approved: 0, dismissed: 0 }),
        })
      );
    });

    it("AC-7: batch — 2 email approvals + 1 slack approval produce correct final counters", async () => {
      // Arrange — simulate sequential increments; each call reads current stored state
      const state: TrustStats = {
        email: { approved: 0, dismissed: 0 },
        calendar: { approved: 0, dismissed: 0 },
        slack: { approved: 0, dismissed: 0 },
      };

      // mockGet always returns the current in-memory state;
      // mockSet captures the written value back into state so subsequent reads see the update
      mockGet.mockImplementation(async () => JSON.parse(JSON.stringify(state)));
      mockSet.mockImplementation(async (_key: string, value: TrustStats) => {
        state.email = { ...value.email };
        state.calendar = { ...value.calendar };
        state.slack = { ...value.slack };
        return "OK";
      });

      // Act — call 3 times: 2 email approvals, then 1 slack approval
      await incrementTrustStat(TEST_USER, "email", "approved");
      await incrementTrustStat(TEST_USER, "email", "approved");
      await incrementTrustStat(TEST_USER, "slack", "approved");

      // Assert final accumulated state
      expect(state.email.approved).toBe(2);
      expect(state.email.dismissed).toBe(0);
      expect(state.slack.approved).toBe(1);
      expect(state.slack.dismissed).toBe(0);
      expect(state.calendar.approved).toBe(0);
      expect(state.calendar.dismissed).toBe(0);
    });

    it("increments from defaults when no prior stats exist in Redis", async () => {
      // Arrange — no stored stats (new user)
      mockGet.mockResolvedValue(null);
      mockSet.mockResolvedValue("OK");

      // Act
      await incrementTrustStat(TEST_USER, "slack", "dismissed");

      // Assert — defaults applied first, then increment
      expect(mockSet).toHaveBeenCalledWith(
        `${TEST_USER}:trustStats`,
        expect.objectContaining({
          slack: expect.objectContaining({ approved: 0, dismissed: 1 }),
        })
      );
    });

    it("does not modify action types that were not incremented", async () => {
      // Arrange
      const initial: TrustStats = {
        email: { approved: 10, dismissed: 3 },
        calendar: { approved: 5, dismissed: 1 },
        slack: { approved: 0, dismissed: 0 },
      };
      mockGet.mockResolvedValue(initial);
      mockSet.mockResolvedValue("OK");

      // Act — only touch email.approved
      await incrementTrustStat(TEST_USER, "email", "approved");

      // Assert — calendar and slack are preserved exactly
      expect(mockSet).toHaveBeenCalledWith(
        `${TEST_USER}:trustStats`,
        expect.objectContaining({
          email: expect.objectContaining({ approved: 11, dismissed: 3 }),
          calendar: expect.objectContaining({ approved: 5, dismissed: 1 }),
          slack: expect.objectContaining({ approved: 0, dismissed: 0 }),
        })
      );
    });
  });
});
