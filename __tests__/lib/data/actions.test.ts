import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SuggestedAction } from "@/lib/types/actions";

const mockGet = vi.fn();
const mockSet = vi.fn();
const mockMget = vi.fn();
const mockSmembers = vi.fn();
const mockSadd = vi.fn();

function createMockPipeline() {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  return {
    set: vi.fn((...args: unknown[]) => {
      calls.push({ method: "set", args });
    }),
    sadd: vi.fn((...args: unknown[]) => {
      calls.push({ method: "sadd", args });
    }),
    exec: vi.fn(async () => calls.map(() => "OK")),
    _calls: calls,
  };
}
const mockPipeline = vi.fn(() => createMockPipeline());

vi.mock("@/lib/redis", () => ({
  getRedis: () => ({
    get: mockGet,
    set: mockSet,
    mget: mockMget,
    smembers: mockSmembers,
    sadd: mockSadd,
    pipeline: mockPipeline,
  }),
}));

// Import after mock setup
const {
  getActions,
  getAction,
  createAction,
  updateAction,
  batchUpdateStatus,
  getPendingActionCount,
} = await import("@/lib/data/actions");

describe("Actions Data Layer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // --- AC-1: Action list displays seeded actions ---

  describe("getActions", () => {
    it("should return all actions for a user", async () => {
      const action: SuggestedAction = {
        id: "act1",
        userId: "user1",
        type: "email",
        status: "pending",
        priority: "high",
        dealId: "d1",
        dealName: "Meridian Platform Migration",
        contactName: "Sarah Chen",
        justification: "Deal stalled in proposal stage",
        draft: { to: "sarah@meridian.io", subject: "Follow up", body: "Hi Sarah" },
        createdAt: "2026-04-01T10:00:00Z",
        updatedAt: "2026-04-01T10:00:00Z",
      };
      mockSmembers.mockResolvedValue(["act1"]);
      mockMget.mockResolvedValue([JSON.stringify(action)]);

      const actions = await getActions("user1");

      expect(mockSmembers).toHaveBeenCalledWith("user1:_idx:actions");
      expect(mockMget).toHaveBeenCalledWith("user1:action:act1");
      expect(actions).toHaveLength(1);
      expect(actions[0].contactName).toBe("Sarah Chen");
    });

    it("should filter actions by status", async () => {
      const pending: SuggestedAction = {
        id: "act1",
        userId: "user1",
        type: "email",
        status: "pending",
        priority: "high",
        dealId: "d1",
        dealName: "Deal A",
        contactName: "Alice",
        justification: "Follow up needed",
        draft: { to: "a@b.com", subject: "Hi", body: "Hello" },
        createdAt: "2026-04-01T10:00:00Z",
        updatedAt: "2026-04-01T10:00:00Z",
      };
      const approved: SuggestedAction = {
        ...pending,
        id: "act2",
        status: "approved",
        contactName: "Bob",
      };
      mockSmembers.mockResolvedValue(["act1", "act2"]);
      mockMget.mockResolvedValue([JSON.stringify(pending), JSON.stringify(approved)]);

      const filtered = await getActions("user1", { status: "pending" });

      expect(filtered).toHaveLength(1);
      expect(filtered[0].status).toBe("pending");
    });
  });

  // --- AC-2: Empty state when no actions exist ---

  describe("getActions - empty", () => {
    it("should return empty array when no actions exist", async () => {
      mockSmembers.mockResolvedValue([]);

      const actions = await getActions("user1");

      expect(actions).toEqual([]);
    });
  });

  // --- getAction ---

  describe("getAction", () => {
    it("should return a specific action", async () => {
      const action: SuggestedAction = {
        id: "act1",
        userId: "user1",
        type: "slack",
        status: "pending",
        priority: "medium",
        dealId: "d2",
        dealName: "Vantage",
        contactName: "Marcus",
        justification: "Update team",
        draft: { channel: "#sales", message: "Pipeline update" },
        createdAt: "2026-04-01T10:00:00Z",
        updatedAt: "2026-04-01T10:00:00Z",
      };
      mockGet.mockResolvedValue(JSON.stringify(action));

      const result = await getAction("user1", "act1");

      expect(mockGet).toHaveBeenCalledWith("user1:action:act1");
      expect(result?.type).toBe("slack");
    });

    it("should return null for missing action", async () => {
      mockGet.mockResolvedValue(null);

      const result = await getAction("user1", "missing");

      expect(result).toBeNull();
    });
  });

  // --- createAction ---

  describe("createAction", () => {
    it("should create an action with generated id and timestamps via pipeline", async () => {
      const action = await createAction("user1", {
        type: "email",
        status: "pending",
        priority: "high",
        dealId: "d1",
        dealName: "Meridian",
        contactName: "Sarah",
        justification: "Follow up",
        draft: { to: "sarah@test.com", subject: "Hi", body: "Hello" },
      });

      expect(action.id).toBeDefined();
      expect(action.userId).toBe("user1");
      expect(action.createdAt).toBeDefined();
      expect(action.updatedAt).toBeDefined();
      expect(mockPipeline).toHaveBeenCalled();

      const pipeline = mockPipeline.mock.results[0].value;
      expect(pipeline.set).toHaveBeenCalledWith(
        `user1:action:${action.id}`,
        JSON.stringify(action),
        { ex: 2592000 }
      );
      expect(pipeline.sadd).toHaveBeenCalledWith("user1:_idx:actions", action.id);
      expect(pipeline.exec).toHaveBeenCalled();
    });
  });

  // --- updateAction (AC-4, AC-5 approve/dismiss) ---

  describe("updateAction", () => {
    it("should update action status to approved", async () => {
      const existing: SuggestedAction = {
        id: "act1",
        userId: "user1",
        type: "email",
        status: "pending",
        priority: "high",
        dealId: "d1",
        dealName: "Meridian",
        contactName: "Sarah",
        justification: "Follow up",
        draft: { to: "sarah@test.com", subject: "Hi", body: "Hello" },
        createdAt: "2026-04-01T10:00:00Z",
        updatedAt: "2026-04-01T10:00:00Z",
      };
      mockGet.mockResolvedValue(JSON.stringify(existing));

      const updated = await updateAction("user1", "act1", { status: "approved" });

      expect(updated?.status).toBe("approved");
      expect(mockSet).toHaveBeenCalled();
      // updatedAt should change
      expect(updated?.updatedAt).not.toBe(existing.updatedAt);
    });

    it("should update action draft", async () => {
      const existing: SuggestedAction = {
        id: "act1",
        userId: "user1",
        type: "email",
        status: "pending",
        priority: "high",
        dealId: "d1",
        dealName: "Meridian",
        contactName: "Sarah",
        justification: "Follow up",
        draft: { to: "sarah@test.com", subject: "Old subject", body: "Old body" },
        createdAt: "2026-04-01T10:00:00Z",
        updatedAt: "2026-04-01T10:00:00Z",
      };
      mockGet.mockResolvedValue(JSON.stringify(existing));

      const newDraft = { to: "sarah@test.com", subject: "New subject", body: "New body" };
      const updated = await updateAction("user1", "act1", { draft: newDraft });

      expect(updated?.draft).toEqual(newDraft);
    });

    it("should return null for non-existent action", async () => {
      mockGet.mockResolvedValue(null);

      const result = await updateAction("user1", "missing", { status: "approved" });

      expect(result).toBeNull();
    });
  });

  // --- AC-8: Batch approve ---

  describe("batchUpdateStatus", () => {
    it("should update multiple actions to approved", async () => {
      const action1: SuggestedAction = {
        id: "act1",
        userId: "user1",
        type: "email",
        status: "pending",
        priority: "high",
        dealId: "d1",
        dealName: "A",
        contactName: "Alice",
        justification: "j",
        draft: { to: "a@b.com", subject: "s", body: "b" },
        createdAt: "2026-04-01T10:00:00Z",
        updatedAt: "2026-04-01T10:00:00Z",
      };
      const action2: SuggestedAction = { ...action1, id: "act2", contactName: "Bob" };

      // batchUpdateStatus calls getAction (1 mockGet) then updateAction->getAction (1 mockGet) for each
      mockGet
        .mockResolvedValueOnce(JSON.stringify(action1))  // getAction for act1
        .mockResolvedValueOnce(JSON.stringify(action1))  // updateAction->getAction for act1
        .mockResolvedValueOnce(JSON.stringify(action2))  // getAction for act2
        .mockResolvedValueOnce(JSON.stringify(action2)); // updateAction->getAction for act2

      const results = await batchUpdateStatus("user1", ["act1", "act2"], "approved");

      expect(results).toHaveLength(2);
      expect(results[0].status).toBe("approved");
      expect(results[1].status).toBe("approved");
    });

    it("should skip actions that are already in the target status", async () => {
      const alreadyApproved: SuggestedAction = {
        id: "act1",
        userId: "user1",
        type: "email",
        status: "approved",
        priority: "high",
        dealId: "d1",
        dealName: "A",
        contactName: "Alice",
        justification: "j",
        draft: { to: "a@b.com", subject: "s", body: "b" },
        createdAt: "2026-04-01T10:00:00Z",
        updatedAt: "2026-04-01T10:00:00Z",
      };
      mockGet.mockResolvedValue(JSON.stringify(alreadyApproved));

      const results = await batchUpdateStatus("user1", ["act1"], "approved");

      // Should still return it but not re-write
      expect(results).toHaveLength(1);
      expect(results[0].status).toBe("approved");
    });
  });

  // --- AC-10: Nav badge ---

  describe("getPendingActionCount", () => {
    it("should return count of active actions (excludes sent and dismissed)", async () => {
      const pending: SuggestedAction = {
        id: "act1",
        userId: "user1",
        type: "email",
        status: "pending",
        priority: "high",
        dealId: "d1",
        dealName: "A",
        contactName: "Alice",
        justification: "j",
        draft: { to: "a@b.com", subject: "s", body: "b" },
        createdAt: "2026-04-01T10:00:00Z",
        updatedAt: "2026-04-01T10:00:00Z",
      };
      const approved: SuggestedAction = { ...pending, id: "act2", status: "approved" };
      const sent: SuggestedAction = { ...pending, id: "act3", status: "sent" };
      const dismissed: SuggestedAction = { ...pending, id: "act4", status: "dismissed" };

      mockSmembers.mockResolvedValue(["act1", "act2", "act3", "act4"]);
      mockMget.mockResolvedValue([
        JSON.stringify(pending),
        JSON.stringify(approved),
        JSON.stringify(sent),
        JSON.stringify(dismissed),
      ]);

      const count = await getPendingActionCount("user1");

      expect(count).toBe(2); // pending + approved are active; sent + dismissed are terminal
    });

    it("should return 0 when no actions exist", async () => {
      mockSmembers.mockResolvedValue([]);

      const count = await getPendingActionCount("user1");

      expect(count).toBe(0);
    });
  });

});
