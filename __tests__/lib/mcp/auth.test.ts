import { describe, it, expect, vi, beforeEach } from "vitest";

// Hoist mock refs so vi.mock factories can reference them
const { mockLookupByApiKey, mockGetMcpClient, mockFetch } = vi.hoisted(() => ({
  mockLookupByApiKey: vi.fn(),
  mockGetMcpClient: vi.fn(),
  mockFetch: vi.fn(),
}));

vi.mock("@/lib/data/mcp-clients", () => ({
  lookupByApiKey: mockLookupByApiKey,
  getMcpClient: mockGetMcpClient,
}));

// Replace global fetch so Auth0 /userinfo calls can be intercepted
vi.stubGlobal("fetch", mockFetch);

// Dynamic import deferred until after mocks are set up
let verifyMcpToken: (bearerToken?: string) => Promise<import("@modelcontextprotocol/sdk/server/auth/types.js").AuthInfo | undefined>;

beforeEach(async () => {
  vi.clearAllMocks();
  // Re-import on each test to pick up fresh mock state
  vi.resetModules();
  const mod = await import("@/lib/mcp/auth");
  verifyMcpToken = mod.verifyMcpToken;
});

describe("verifyMcpToken", () => {
  // ──────────────────────────────────────────────
  // AC-7: API key path — valid dfk_ token
  // ──────────────────────────────────────────────
  describe("AC-7: API key path — valid dfk_ bearer token", () => {
    it("AC-7: returns AuthInfo with mcpClientId from client record", async () => {
      // Arrange
      const rawKey = "dfk_validkey123";
      mockLookupByApiKey.mockResolvedValue({ userId: "user-abc", clientId: "client-bot-a" });
      mockGetMcpClient.mockResolvedValue({
        id: "client-bot-a",
        userId: "user-abc",
        name: "Bot-A",
        allowedTools: ["listDeals"],
        trustTier: "standard",
        rateLimit: 60,
        apiKeyHash: "hash",
        apiKeyPrefix: "dfk_",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      // Act
      const result = await verifyMcpToken(rawKey);

      // Assert
      expect(result).toBeDefined();
      expect(result!.extra?.mcpClientId).toBe("client-bot-a");
    });

    it("AC-7: returns AuthInfo with allowedTools from client record", async () => {
      // Arrange
      const rawKey = "dfk_validkey123";
      mockLookupByApiKey.mockResolvedValue({ userId: "user-abc", clientId: "client-bot-a" });
      mockGetMcpClient.mockResolvedValue({
        id: "client-bot-a",
        userId: "user-abc",
        name: "Bot-A",
        allowedTools: ["listDeals"],
        trustTier: "standard",
        rateLimit: 60,
        apiKeyHash: "hash",
        apiKeyPrefix: "dfk_",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      // Act
      const result = await verifyMcpToken(rawKey);

      // Assert
      expect(result!.extra?.allowedTools).toEqual(["listDeals"]);
    });

    it("AC-7: returns AuthInfo with rateLimit from client record", async () => {
      // Arrange
      const rawKey = "dfk_validkey123";
      mockLookupByApiKey.mockResolvedValue({ userId: "user-abc", clientId: "client-bot-a" });
      mockGetMcpClient.mockResolvedValue({
        id: "client-bot-a",
        userId: "user-abc",
        name: "Bot-A",
        allowedTools: ["listDeals"],
        trustTier: "standard",
        rateLimit: 30,
        apiKeyHash: "hash",
        apiKeyPrefix: "dfk_",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      // Act
      const result = await verifyMcpToken(rawKey);

      // Assert
      expect(result!.extra?.rateLimit).toBe(30);
    });

    it("AC-7: returns AuthInfo with trustTier and clientName from client record", async () => {
      // Arrange
      const rawKey = "dfk_validkey123";
      mockLookupByApiKey.mockResolvedValue({ userId: "user-abc", clientId: "client-bot-a" });
      mockGetMcpClient.mockResolvedValue({
        id: "client-bot-a",
        userId: "user-abc",
        name: "Bot-A",
        allowedTools: ["listDeals"],
        trustTier: "standard",
        rateLimit: 60,
        apiKeyHash: "hash",
        apiKeyPrefix: "dfk_",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      // Act
      const result = await verifyMcpToken(rawKey);

      // Assert
      expect(result!.extra?.trustTier).toBe("standard");
      expect(result!.extra?.clientName).toBe("Bot-A");
    });
  });

  // ──────────────────────────────────────────────
  // AC-8: API key path — invalid dfk_ token
  // ──────────────────────────────────────────────
  describe("AC-8: API key path — invalid dfk_ bearer token", () => {
    it("AC-8: returns undefined when lookupByApiKey finds no record", async () => {
      // Arrange — key is dfk_-prefixed but not found in store
      mockLookupByApiKey.mockResolvedValue(null);

      // Act
      const result = await verifyMcpToken("dfk_xxx_invalid");

      // Assert
      expect(result).toBeUndefined();
    });

    it("AC-8: returns undefined when getMcpClient returns null (client deleted)", async () => {
      // Arrange — key maps to a clientId but the client record is gone
      mockLookupByApiKey.mockResolvedValue({ userId: "user-abc", clientId: "ghost-client" });
      mockGetMcpClient.mockResolvedValue(null);

      // Act
      const result = await verifyMcpToken("dfk_orphaned_key");

      // Assert
      expect(result).toBeUndefined();
    });

    it("AC-8: does not call Auth0 /userinfo for dfk_-prefixed tokens", async () => {
      // Arrange
      mockLookupByApiKey.mockResolvedValue(null);

      // Act
      await verifyMcpToken("dfk_xxx_invalid");

      // Assert — Auth0 path must not be taken for API key tokens
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  // ──────────────────────────────────────────────
  // AC-9: Auth0 token backward compatibility
  // ──────────────────────────────────────────────
  describe("AC-9: Auth0 token — backward compatibility when no dfk_ prefix", () => {
    it("AC-9: returns AuthInfo with mcpClientId 'default' for valid Auth0 token", async () => {
      // Arrange — non-dfk_ token; Auth0 /userinfo responds with a user
      const auth0Token = "eyJhbGciOiJSUzI1NiJ9.validAuth0Token";
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ sub: "auth0|user-xyz" }),
      });

      // Act
      const result = await verifyMcpToken(auth0Token);

      // Assert
      expect(result).toBeDefined();
      expect(result!.extra?.mcpClientId).toBe("default");
    });

    it("AC-9: does not call lookupByApiKey for non-dfk_ tokens", async () => {
      // Arrange
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ sub: "auth0|user-xyz" }),
      });

      // Act
      await verifyMcpToken("eyJhbGciOiJSUzI1NiJ9.validAuth0Token");

      // Assert — API key path must not be taken for Auth0 tokens
      expect(mockLookupByApiKey).not.toHaveBeenCalled();
    });

    it("AC-9: returns undefined when Auth0 /userinfo returns non-ok status", async () => {
      // Arrange — Auth0 rejects the token
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ error: "invalid_token" }),
      });

      // Act
      const result = await verifyMcpToken("bearer_invalid_auth0_token");

      // Assert
      expect(result).toBeUndefined();
    });

    it("AC-9: returns undefined when bearer token is undefined", async () => {
      // Act
      const result = await verifyMcpToken(undefined);

      // Assert
      expect(result).toBeUndefined();
    });
  });
});
