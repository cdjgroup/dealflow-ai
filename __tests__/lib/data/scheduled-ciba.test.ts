import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ScheduledCibaSession } from "@/lib/types/scheduled-ciba";

const mockSet = vi.fn();
const mockGet = vi.fn();
const mockDel = vi.fn();
const mockMget = vi.fn();
const mockSmembers = vi.fn();

function createMockPipeline() {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const pipeline = {
    set: vi.fn((...args: unknown[]) => { calls.push({ method: "set", args }); return pipeline; }),
    sadd: vi.fn((...args: unknown[]) => { calls.push({ method: "sadd", args }); return pipeline; }),
    del: vi.fn((...args: unknown[]) => { calls.push({ method: "del", args }); return pipeline; }),
    srem: vi.fn((...args: unknown[]) => { calls.push({ method: "srem", args }); return pipeline; }),
    exec: vi.fn(async () => calls.map(() => "OK")),
    _calls: calls,
  };
  return pipeline;
}
const mockPipeline = vi.fn(() => createMockPipeline());

vi.mock("@/lib/redis", () => ({
  getRedis: () => ({
    set: mockSet,
    get: mockGet,
    del: mockDel,
    mget: mockMget,
    smembers: mockSmembers,
    pipeline: mockPipeline,
  }),
}));

const {
  storeScheduledCibaSession,
  getScheduledCibaSession,
  getAllActiveScheduledSessions,
  removeScheduledCibaSession,
} = await import("@/lib/data/scheduled-ciba");

const TEST_SESSION: ScheduledCibaSession = {
  batchId: "2026-04-04T08:00:00.000Z",
  userId: "auth0|user1",
  authReqId: "ciba-req-abc",
  actionIds: ["act1", "act2", "act3"],
  bindingMessage: "Execute 3 pending actions?",
  expiresAt: "2026-04-04T08:10:00.000Z",
  interval: 5,
  createdAt: "2026-04-04T08:00:00.000Z",
};

describe("scheduled-ciba data layer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("storeScheduledCibaSession", () => {
    it("stores session with TTL and adds to active index", async () => {
      await storeScheduledCibaSession(TEST_SESSION);

      const pipeline = mockPipeline.mock.results[0].value;
      expect(pipeline.set).toHaveBeenCalledWith(
        "ciba:scheduled:auth0|user1:2026-04-04T08:00:00.000Z",
        JSON.stringify(TEST_SESSION),
        { ex: 600 }
      );
      expect(pipeline.sadd).toHaveBeenCalledWith(
        "schedule:ciba:active",
        "ciba:scheduled:auth0|user1:2026-04-04T08:00:00.000Z"
      );
      expect(pipeline.exec).toHaveBeenCalled();
    });
  });

  describe("getScheduledCibaSession", () => {
    it("returns session when it exists", async () => {
      mockGet.mockResolvedValue(JSON.stringify(TEST_SESSION));
      const result = await getScheduledCibaSession("auth0|user1", "2026-04-04T08:00:00.000Z");
      expect(result).toEqual(TEST_SESSION);
      expect(mockGet).toHaveBeenCalledWith("ciba:scheduled:auth0|user1:2026-04-04T08:00:00.000Z");
    });

    it("returns null when session does not exist", async () => {
      mockGet.mockResolvedValue(null);
      const result = await getScheduledCibaSession("auth0|user1", "nonexistent");
      expect(result).toBeNull();
    });
  });

  describe("getAllActiveScheduledSessions", () => {
    it("returns all active sessions", async () => {
      const key = "ciba:scheduled:auth0|user1:2026-04-04T08:00:00.000Z";
      mockSmembers.mockResolvedValue([key]);
      mockMget.mockResolvedValue([JSON.stringify(TEST_SESSION)]);

      const sessions = await getAllActiveScheduledSessions();
      expect(sessions).toHaveLength(1);
      expect(sessions[0]).toEqual(TEST_SESSION);
    });

    it("returns empty array when no active sessions", async () => {
      mockSmembers.mockResolvedValue([]);
      const sessions = await getAllActiveScheduledSessions();
      expect(sessions).toEqual([]);
    });

    it("AC-8: cleans up stale index entries where TTL expired", async () => {
      const key = "ciba:scheduled:auth0|stale:2026-04-04T08:00:00.000Z";
      mockSmembers.mockResolvedValue([key]);
      mockMget.mockResolvedValue([null]); // TTL expired

      const sessions = await getAllActiveScheduledSessions();
      expect(sessions).toEqual([]);

      // Should clean up stale key from index
      const pipeline = mockPipeline.mock.results[0].value;
      expect(pipeline.srem).toHaveBeenCalledWith("schedule:ciba:active", key);
    });
  });

  describe("removeScheduledCibaSession", () => {
    it("deletes session and removes from active index", async () => {
      await removeScheduledCibaSession("auth0|user1", "2026-04-04T08:00:00.000Z");

      const pipeline = mockPipeline.mock.results[0].value;
      expect(pipeline.del).toHaveBeenCalledWith(
        "ciba:scheduled:auth0|user1:2026-04-04T08:00:00.000Z"
      );
      expect(pipeline.srem).toHaveBeenCalledWith(
        "schedule:ciba:active",
        "ciba:scheduled:auth0|user1:2026-04-04T08:00:00.000Z"
      );
      expect(pipeline.exec).toHaveBeenCalled();
    });
  });
});
