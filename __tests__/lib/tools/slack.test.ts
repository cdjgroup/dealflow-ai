import { describe, it, expect, vi, beforeEach } from "vitest";
import { listSlackChannels, sendSlackMessage } from "@/lib/tools/slack";

// Mock Auth0 session
vi.mock("@/lib/auth0", () => ({
  auth0: {
    getSession: vi.fn().mockResolvedValue({
      tokenSet: { refreshToken: "test-refresh-token" },
    }),
  },
}));

// Mock exchangeToken with new TokenExchangeSuccess shape (AC-1)
const mockExchangeToken = vi.fn();
vi.mock("@/lib/token-exchange", () => ({
  exchangeToken: (...args: unknown[]) => mockExchangeToken(...args),
  buildTokenMeta: (result: Record<string, unknown>, minScope: string) => ({
    scope: result.scope,
    expiresIn: result.expiresIn,
    connection: result.connection,
    exchangedAt: result.exchangedAt,
    minScope,
  }),
}));

// Mock fetch for Slack API
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

const MOCK_TOKEN_SUCCESS = {
  token: "slack-access-token",
  scope: "channels:read,chat:write",
  expiresIn: 900,
  connection: "sign-in-with-slack",
  exchangedAt: "2026-04-03T12:00:00.000Z",
};

describe("slack tools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("listSlackChannels", () => {
    it("AC-3: should include _tokenMeta in result on successful channel list", async () => {
      // Arrange
      mockExchangeToken.mockResolvedValue(MOCK_TOKEN_SUCCESS);
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          ok: true,
          channels: [
            { id: "C01", name: "general", num_members: 42 },
          ],
        }),
      });

      // Act
      const result = await listSlackChannels.execute(
        {},
        { toolCallId: "test", messages: [], abortSignal: undefined as unknown as AbortSignal }
      );

      // Assert
      expect(result).toHaveProperty("_tokenMeta");
    });

    it("AC-3: listSlackChannels _tokenMeta should contain all required fields", async () => {
      // Arrange
      mockExchangeToken.mockResolvedValue(MOCK_TOKEN_SUCCESS);
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true, channels: [] }),
      });

      // Act
      const result = await listSlackChannels.execute(
        {},
        { toolCallId: "test", messages: [], abortSignal: undefined as unknown as AbortSignal }
      );

      // Assert
      const meta = (result as Record<string, unknown>)["_tokenMeta"] as Record<string, unknown>;
      expect(meta).toHaveProperty("scope");
      expect(meta).toHaveProperty("expiresIn");
      expect(meta).toHaveProperty("connection");
      expect(meta).toHaveProperty("exchangedAt");
      expect(meta).toHaveProperty("minScope");
    });

    it("AC-3: listSlackChannels _tokenMeta.minScope should be channels:read", async () => {
      // Arrange
      mockExchangeToken.mockResolvedValue(MOCK_TOKEN_SUCCESS);
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true, channels: [] }),
      });

      // Act
      const result = await listSlackChannels.execute(
        {},
        { toolCallId: "test", messages: [], abortSignal: undefined as unknown as AbortSignal }
      );

      // Assert
      const meta = (result as Record<string, unknown>)["_tokenMeta"] as Record<string, unknown>;
      expect(meta.minScope).toBe("channels:read");
    });

    it("AC-3: listSlackChannels error result should NOT include _tokenMeta", async () => {
      // Arrange — token exchange fails
      mockExchangeToken.mockResolvedValue({ error: "access_denied" });

      // Act
      const result = await listSlackChannels.execute(
        {},
        { toolCallId: "test", messages: [], abortSignal: undefined as unknown as AbortSignal }
      );

      // Assert
      expect(result).not.toHaveProperty("_tokenMeta");
      expect(result).toHaveProperty("error");
    });

    it("AC-3: listSlackChannels Slack API error should NOT include _tokenMeta", async () => {
      // Arrange — token ok, Slack returns error
      mockExchangeToken.mockResolvedValue(MOCK_TOKEN_SUCCESS);
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ ok: false, error: "missing_scope" }),
      });

      // Act
      const result = await listSlackChannels.execute(
        {},
        { toolCallId: "test", messages: [], abortSignal: undefined as unknown as AbortSignal }
      );

      // Assert
      expect(result).not.toHaveProperty("_tokenMeta");
    });
  });

  describe("sendSlackMessage", () => {
    it("AC-3: should include _tokenMeta in result on successful message send", async () => {
      // Arrange — need channel lookup + message send
      mockExchangeToken.mockResolvedValue(MOCK_TOKEN_SUCCESS);
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            ok: true,
            channels: [{ id: "C01", name: "general" }],
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ ok: true, ts: "1234567890.123456", channel: "C01" }),
        });

      // Act
      const result = await sendSlackMessage.execute(
        { channel: "general", text: "Hello team!" },
        { toolCallId: "test", messages: [], abortSignal: undefined as unknown as AbortSignal }
      );

      // Assert
      expect(result).toHaveProperty("_tokenMeta");
    });

    it("AC-3: sendSlackMessage _tokenMeta.minScope should be chat:write", async () => {
      // Arrange
      mockExchangeToken.mockResolvedValue(MOCK_TOKEN_SUCCESS);
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            ok: true,
            channels: [{ id: "C01", name: "general" }],
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ ok: true, ts: "1234567890.000", channel: "C01" }),
        });

      // Act
      const result = await sendSlackMessage.execute(
        { channel: "general", text: "Deploy complete." },
        { toolCallId: "test", messages: [], abortSignal: undefined as unknown as AbortSignal }
      );

      // Assert
      const meta = (result as Record<string, unknown>)["_tokenMeta"] as Record<string, unknown>;
      expect(meta.minScope).toBe("chat:write");
    });

    it("AC-3: sendSlackMessage error result should NOT include _tokenMeta", async () => {
      // Arrange — token exchange fails
      mockExchangeToken.mockResolvedValue({ error: "access_denied" });

      // Act
      const result = await sendSlackMessage.execute(
        { channel: "general", text: "Test" },
        { toolCallId: "test", messages: [], abortSignal: undefined as unknown as AbortSignal }
      );

      // Assert
      expect(result).not.toHaveProperty("_tokenMeta");
      expect(result).toHaveProperty("error");
    });
  });
});
