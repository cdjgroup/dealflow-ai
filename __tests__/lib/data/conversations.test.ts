import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  saveConversation,
  loadConversation,
  listConversations,
  deleteConversation,
} from "@/lib/data/conversations";

const mockGet = vi.fn();
const mockSet = vi.fn();
const mockDel = vi.fn();
const mockZadd = vi.fn();
const mockZrange = vi.fn();
const mockZrem = vi.fn();
const mockPipelineSet = vi.fn();
const mockPipelineZadd = vi.fn();
const mockPipelineExec = vi.fn();

vi.mock("@/lib/redis", () => ({
  getRedis: () => ({
    get: mockGet,
    set: mockSet,
    del: mockDel,
    zadd: mockZadd,
    zrange: mockZrange,
    zrem: mockZrem,
    pipeline: () => ({
      set: mockPipelineSet,
      zadd: mockPipelineZadd,
      exec: mockPipelineExec,
    }),
    mget: vi.fn().mockResolvedValue([]),
  }),
}));

const TEST_USER = "auth0|test123";

describe("conversations data layer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPipelineExec.mockResolvedValue([]);
  });

  describe("saveConversation", () => {
    it("persists messages and metadata", async () => {
      const messages = [
        { role: "user", content: "Hello" },
        { role: "assistant", content: "Hi there!" },
      ];

      await saveConversation(TEST_USER, "conv-1", messages);

      expect(mockPipelineSet).toHaveBeenCalledTimes(2); // meta + messages
      expect(mockPipelineZadd).toHaveBeenCalledTimes(1); // index
    });

    it("generates title from first user message", async () => {
      const messages = [
        { role: "user", content: "Show me my deals for this quarter" },
      ];

      await saveConversation(TEST_USER, "conv-2", messages);

      // Check that meta was set with a title derived from the first message
      const metaCall = mockPipelineSet.mock.calls.find(
        (call: unknown[]) => typeof call[0] === "string" && (call[0] as string).includes(":thread:")
      );
      expect(metaCall).toBeDefined();
      const meta = JSON.parse(metaCall![1] as string);
      expect(meta.title).toContain("Show me my deals");
    });
  });

  describe("loadConversation", () => {
    it("returns null for non-existent conversation", async () => {
      mockGet.mockResolvedValue(null);
      const result = await loadConversation(TEST_USER, "nonexistent");
      expect(result).toBeNull();
    });

    it("returns meta and messages for existing conversation", async () => {
      const meta = {
        id: "conv-1",
        title: "Test",
        createdAt: "2026-04-02T00:00:00Z",
        updatedAt: "2026-04-02T00:00:00Z",
        messageCount: 2,
      };
      const messages = [{ role: "user", content: "Hello" }];

      // First call: meta, second call: messages
      mockGet.mockResolvedValueOnce(meta).mockResolvedValueOnce(messages);

      const result = await loadConversation(TEST_USER, "conv-1");
      expect(result).not.toBeNull();
      expect(result!.meta.title).toBe("Test");
      expect(result!.messages).toHaveLength(1);
    });
  });

  describe("listConversations", () => {
    it("returns empty array when no conversations", async () => {
      mockZrange.mockResolvedValue([]);
      const list = await listConversations(TEST_USER);
      expect(list).toEqual([]);
    });
  });

  describe("deleteConversation", () => {
    it("removes meta, messages, and index entry", async () => {
      mockDel.mockResolvedValue(1);
      mockZrem.mockResolvedValue(1);

      await deleteConversation(TEST_USER, "conv-1");

      expect(mockDel).toHaveBeenCalledTimes(2); // meta + messages
      expect(mockZrem).toHaveBeenCalledTimes(1); // index
    });
  });
});
