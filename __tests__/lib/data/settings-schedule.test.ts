import { describe, it, expect, vi, beforeEach } from "vitest";
import { DEFAULT_SETTINGS } from "@/lib/types/settings";

const mockGet = vi.fn();
const mockSet = vi.fn();
const mockSmembers = vi.fn();

function createMockPipeline() {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const pipeline = {
    srem: vi.fn((...args: unknown[]) => { calls.push({ method: "srem", args }); return pipeline; }),
    sadd: vi.fn((...args: unknown[]) => { calls.push({ method: "sadd", args }); return pipeline; }),
    exec: vi.fn(async () => calls.map(() => "OK")),
    _calls: calls,
  };
  return pipeline;
}
const mockPipeline = vi.fn(() => createMockPipeline());

vi.mock("@/lib/redis", () => ({
  getRedis: () => ({
    get: mockGet,
    set: mockSet,
    smembers: mockSmembers,
    pipeline: mockPipeline,
  }),
}));

const {
  getUserSettings,
  updateUserSettings,
  updateScheduleIndex,
  getUsersForScheduleHour,
} = await import("@/lib/data/settings");

const TEST_USER = "auth0|user1";

describe("settings schedule extensions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("DEFAULT_SETTINGS includes schedule", () => {
    it("AC-1: default schedule is disabled with empty hours", () => {
      expect(DEFAULT_SETTINGS.schedule).toEqual({
        enabled: false,
        hours: [],
        timezone: "UTC",
      });
    });
  });

  describe("updateUserSettings merges schedule", () => {
    it("AC-1: merges schedule field into settings", async () => {
      mockGet.mockResolvedValue(DEFAULT_SETTINGS);
      mockSet.mockResolvedValue("OK");

      const result = await updateUserSettings(TEST_USER, {
        schedule: { enabled: true, hours: [8], timezone: "America/New_York" },
      });

      expect(result.schedule).toEqual({
        enabled: true,
        hours: [8],
        timezone: "America/New_York",
      });
      // Other fields preserved
      expect(result.capabilities).toEqual(DEFAULT_SETTINGS.capabilities);
    });

    it("AC-2: preserves schedule when updating other fields", async () => {
      const existing = {
        ...DEFAULT_SETTINGS,
        schedule: { enabled: true, hours: [8, 12], timezone: "America/Chicago" },
      };
      mockGet.mockResolvedValue(existing);
      mockSet.mockResolvedValue("OK");

      const result = await updateUserSettings(TEST_USER, {
        capabilities: { ...DEFAULT_SETTINGS.capabilities, slack: true },
      });

      expect(result.schedule).toEqual(existing.schedule);
    });
  });

  describe("updateScheduleIndex", () => {
    it("AC-1: adds user to new hour indexes", async () => {
      await updateScheduleIndex(TEST_USER, [], [8, 12]);

      const pipeline = mockPipeline.mock.results[0].value;
      expect(pipeline.sadd).toHaveBeenCalledWith("schedule:idx:8", TEST_USER);
      expect(pipeline.sadd).toHaveBeenCalledWith("schedule:idx:12", TEST_USER);
      expect(pipeline.exec).toHaveBeenCalled();
    });

    it("AC-2: removes user from old hour indexes", async () => {
      await updateScheduleIndex(TEST_USER, [8, 12], []);

      const pipeline = mockPipeline.mock.results[0].value;
      expect(pipeline.srem).toHaveBeenCalledWith("schedule:idx:8", TEST_USER);
      expect(pipeline.srem).toHaveBeenCalledWith("schedule:idx:12", TEST_USER);
    });

    it("only changes differing hours", async () => {
      await updateScheduleIndex(TEST_USER, [8, 12], [8, 17]);

      const pipeline = mockPipeline.mock.results[0].value;
      // Remove 12 (was in old, not in new)
      expect(pipeline.srem).toHaveBeenCalledWith("schedule:idx:12", TEST_USER);
      // Add 17 (in new, not in old)
      expect(pipeline.sadd).toHaveBeenCalledWith("schedule:idx:17", TEST_USER);
      // 8 unchanged — no sadd or srem for it
      expect(pipeline.sadd).not.toHaveBeenCalledWith("schedule:idx:8", TEST_USER);
      expect(pipeline.srem).not.toHaveBeenCalledWith("schedule:idx:8", TEST_USER);
    });

    it("rejects invalid hours", async () => {
      await updateScheduleIndex(TEST_USER, [], [8, 99]);

      const pipeline = mockPipeline.mock.results[0].value;
      expect(pipeline.sadd).toHaveBeenCalledWith("schedule:idx:8", TEST_USER);
      // 99 is not a valid hour
      expect(pipeline.sadd).not.toHaveBeenCalledWith("schedule:idx:99", TEST_USER);
    });
  });

  describe("getUsersForScheduleHour", () => {
    it("AC-3: returns user IDs for a given hour", async () => {
      mockSmembers.mockResolvedValue(["auth0|user1", "auth0|user2"]);
      const users = await getUsersForScheduleHour(8);
      expect(users).toEqual(["auth0|user1", "auth0|user2"]);
      expect(mockSmembers).toHaveBeenCalledWith("schedule:idx:8");
    });

    it("returns empty array when no users opted in", async () => {
      mockSmembers.mockResolvedValue([]);
      const users = await getUsersForScheduleHour(17);
      expect(users).toEqual([]);
    });
  });
});
