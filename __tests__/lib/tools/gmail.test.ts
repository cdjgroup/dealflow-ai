import { describe, it, expect, vi, beforeEach } from "vitest";
import { draftEmail, searchEmails } from "@/lib/tools/gmail";

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
  sanitizeApiError: (status: number, label: string) => `${label}: request failed (status ${status})`,
  buildTokenMeta: (result: Record<string, unknown>, minScope: string) => ({
    scope: result.scope,
    expiresIn: result.expiresIn,
    connection: result.connection,
    exchangedAt: result.exchangedAt,
    minScope,
  }),
}));

// Mock fetch for Gmail API
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

const MOCK_TOKEN_SUCCESS = {
  token: "gmail-access-token",
  scope: "https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.compose",
  expiresIn: 3600,
  connection: "google-oauth2",
  exchangedAt: "2026-04-03T12:00:00.000Z",
};

describe("gmail tools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("searchEmails", () => {
    it("AC-3: should include _tokenMeta in result on successful search", async () => {
      // Arrange
      mockExchangeToken.mockResolvedValue(MOCK_TOKEN_SUCCESS);
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ messages: [], resultSizeEstimate: 0 }),
      });

      // Act
      const result = await searchEmails.execute(
        { query: "from:boss@company.com", maxResults: 5 },
        { toolCallId: "test", messages: [], abortSignal: undefined as unknown as AbortSignal }
      );

      // Assert
      expect(result).toHaveProperty("_tokenMeta");
    });

    it("AC-3: _tokenMeta on searchEmails should have all required fields", async () => {
      // Arrange
      mockExchangeToken.mockResolvedValue(MOCK_TOKEN_SUCCESS);
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ messages: [], resultSizeEstimate: 0 }),
      });

      // Act
      const result = await searchEmails.execute(
        { query: "subject:invoice", maxResults: 5 },
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

    it("AC-3: searchEmails _tokenMeta.minScope should be gmail.readonly", async () => {
      // Arrange
      mockExchangeToken.mockResolvedValue(MOCK_TOKEN_SUCCESS);
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ messages: [], resultSizeEstimate: 0 }),
      });

      // Act
      const result = await searchEmails.execute(
        { query: "label:unread", maxResults: 5 },
        { toolCallId: "test", messages: [], abortSignal: undefined as unknown as AbortSignal }
      );

      // Assert
      const meta = (result as Record<string, unknown>)["_tokenMeta"] as Record<string, unknown>;
      expect(meta.minScope).toBe("gmail.readonly");
    });

    it("AC-3: searchEmails error result should NOT include _tokenMeta", async () => {
      // Arrange — token exchange fails
      mockExchangeToken.mockResolvedValue({ error: "access_denied" });

      // Act
      const result = await searchEmails.execute(
        { query: "test", maxResults: 5 },
        { toolCallId: "test", messages: [], abortSignal: undefined as unknown as AbortSignal }
      );

      // Assert
      expect(result).not.toHaveProperty("_tokenMeta");
      expect(result).toHaveProperty("error");
    });

    it("AC-3: searchEmails API error should NOT include _tokenMeta", async () => {
      // Arrange — token ok, API fails
      mockExchangeToken.mockResolvedValue(MOCK_TOKEN_SUCCESS);
      mockFetch.mockResolvedValue({
        ok: false,
        status: 429,
      });

      // Act
      const result = await searchEmails.execute(
        { query: "test", maxResults: 5 },
        { toolCallId: "test", messages: [], abortSignal: undefined as unknown as AbortSignal }
      );

      // Assert
      expect(result).not.toHaveProperty("_tokenMeta");
    });
  });

  describe("draftEmail", () => {
    it("AC-3: should include _tokenMeta in result on successful draft", async () => {
      // Arrange
      mockExchangeToken.mockResolvedValue(MOCK_TOKEN_SUCCESS);
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ id: "draft-001" }),
      });

      // Act
      const result = await draftEmail.execute(
        { to: "sarah@example.com", subject: "Follow up", body: "Hello" },
        { toolCallId: "test", messages: [], abortSignal: undefined as unknown as AbortSignal }
      );

      // Assert
      expect(result).toHaveProperty("_tokenMeta");
    });

    it("AC-3: _tokenMeta on draftEmail should have all required fields", async () => {
      // Arrange
      mockExchangeToken.mockResolvedValue(MOCK_TOKEN_SUCCESS);
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ id: "draft-002" }),
      });

      // Act
      const result = await draftEmail.execute(
        { to: "team@example.com", subject: "Meeting", body: "See you" },
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

    it("AC-3: draftEmail _tokenMeta.minScope should be gmail.compose", async () => {
      // Arrange
      mockExchangeToken.mockResolvedValue(MOCK_TOKEN_SUCCESS);
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ id: "draft-003" }),
      });

      // Act
      const result = await draftEmail.execute(
        { to: "ceo@example.com", subject: "Update", body: "Status" },
        { toolCallId: "test", messages: [], abortSignal: undefined as unknown as AbortSignal }
      );

      // Assert
      const meta = (result as Record<string, unknown>)["_tokenMeta"] as Record<string, unknown>;
      expect(meta.minScope).toBe("gmail.compose");
    });

    it("AC-3: draftEmail error result should NOT include _tokenMeta", async () => {
      // Arrange — token exchange fails
      mockExchangeToken.mockResolvedValue({ error: "access_denied" });

      // Act
      const result = await draftEmail.execute(
        { to: "nobody@example.com", subject: "Test", body: "Test" },
        { toolCallId: "test", messages: [], abortSignal: undefined as unknown as AbortSignal }
      );

      // Assert
      expect(result).not.toHaveProperty("_tokenMeta");
      expect(result).toHaveProperty("error");
    });
  });
});
