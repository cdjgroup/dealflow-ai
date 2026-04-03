import { describe, it, expect, vi, beforeEach } from "vitest";
import { exchangeToken, exchangeTokenWithRefresh, sanitizeApiError } from "@/lib/token-exchange";

// Mock Auth0 session (exchangeToken calls auth0.getSession and getUser)
vi.mock("@/lib/auth0", () => ({
  auth0: {
    getSession: vi.fn().mockResolvedValue({
      tokenSet: { refreshToken: "test-refresh-token" },
    }),
  },
  getUser: vi.fn().mockResolvedValue({ sub: "auth0|test123" }),
}));

// Mock connection disabled check (from main branch merge)
vi.mock("@/lib/data/connections", () => ({
  isConnectionDisabled: vi.fn().mockResolvedValue(false),
}));

// Mock fetch for Auth0 token exchange endpoint
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("token-exchange", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("exchangeToken", () => {
    // AC-1: Success result includes enriched metadata fields
    it("AC-1: should return token, scope, expiresIn, connection, and exchangedAt on success", async () => {
      // Arrange
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          access_token: "goog-access-token-xyz",
          scope: "https://www.googleapis.com/auth/calendar.readonly",
          expires_in: 3600,
        }),
      });

      // Act
      const result = await exchangeToken("google-oauth2");

      // Assert — must have all TokenExchangeSuccess fields
      expect(result).not.toHaveProperty("error");
      const success = result as {
        token: string;
        scope: string | null;
        expiresIn: number | null;
        connection: string;
        exchangedAt: string;
      };
      expect(success.token).toBe("goog-access-token-xyz");
      expect(success.scope).toBe("https://www.googleapis.com/auth/calendar.readonly");
      expect(success.expiresIn).toBe(3600);
      expect(success.connection).toBe("google-oauth2");
      expect(success.exchangedAt).toBeDefined();
    });

    it("AC-1: exchangedAt should be a valid ISO timestamp string", async () => {
      // Arrange
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          access_token: "token-abc",
          scope: "email",
          expires_in: 1800,
        }),
      });

      // Act
      const result = await exchangeToken("google-oauth2");

      // Assert
      const success = result as { exchangedAt: string };
      expect(() => new Date(success.exchangedAt)).not.toThrow();
      expect(new Date(success.exchangedAt).toISOString()).toBe(success.exchangedAt);
    });

    it("AC-1: should set scope to null when exchange response omits scope", async () => {
      // Arrange
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          access_token: "token-no-scope",
          // no scope field
          expires_in: 3600,
        }),
      });

      // Act
      const result = await exchangeToken("google-oauth2");

      // Assert
      const success = result as { scope: string | null };
      expect(success.scope).toBeNull();
    });

    it("AC-1: should set expiresIn to null when exchange response omits expires_in", async () => {
      // Arrange
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          access_token: "token-no-expiry",
          scope: "email",
          // no expires_in field
        }),
      });

      // Act
      const result = await exchangeToken("google-oauth2");

      // Assert
      const success = result as { expiresIn: number | null };
      expect(success.expiresIn).toBeNull();
    });

    it("AC-1: should preserve { error: string } shape when exchange fails", async () => {
      // Arrange
      mockFetch.mockResolvedValue({
        ok: false,
        json: async () => ({ error: "access_denied", error_description: "No refresh token" }),
      });

      // Act
      const result = await exchangeToken("google-oauth2");

      // Assert — error result must have exactly { error: string } and no token metadata
      expect(result).toHaveProperty("error");
      expect(typeof (result as { error: string }).error).toBe("string");
      expect(result).not.toHaveProperty("token");
      expect(result).not.toHaveProperty("scope");
      expect(result).not.toHaveProperty("expiresIn");
      expect(result).not.toHaveProperty("connection");
      expect(result).not.toHaveProperty("exchangedAt");
    });

    it("AC-1: should return generic error when fetch throws a network error (no details leaked)", async () => {
      // Arrange
      mockFetch.mockRejectedValue(new Error("DNS resolution failed for auth0.example.com"));

      // Act
      const result = await exchangeToken("google-oauth2");

      // Assert — generic message, no network details leaked
      expect(result).toHaveProperty("error");
      const err = (result as { error: string }).error;
      expect(err).toBe("Token exchange failed — please try again");
      expect(err).not.toContain("DNS");
    });

    it("AC-1: connection field in success result matches the connection argument passed in", async () => {
      // Arrange
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          access_token: "slack-token",
          scope: "channels:read",
          expires_in: 900,
        }),
      });

      // Act
      const result = await exchangeToken("sign-in-with-slack");

      // Assert
      const success = result as { connection: string };
      expect(success.connection).toBe("sign-in-with-slack");
    });
  });

  describe("exchangeTokenWithRefresh", () => {
    // AC-1: exchangeTokenWithRefresh has the same enriched return type
    it("AC-1: should return enriched TokenExchangeSuccess when given connection and refreshToken", async () => {
      // Arrange
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          access_token: "refreshed-token-xyz",
          scope: "https://mail.google.com/",
          expires_in: 3600,
        }),
      });

      // Act
      const result = await exchangeTokenWithRefresh("google-oauth2", "refresh-token-abc");

      // Assert — same fields as exchangeToken success
      expect(result).not.toHaveProperty("error");
      const success = result as {
        token: string;
        scope: string | null;
        expiresIn: number | null;
        connection: string;
        exchangedAt: string;
      };
      expect(success.token).toBe("refreshed-token-xyz");
      expect(success.scope).toBe("https://mail.google.com/");
      expect(success.expiresIn).toBe(3600);
      expect(success.connection).toBe("google-oauth2");
      expect(typeof success.exchangedAt).toBe("string");
      expect(new Date(success.exchangedAt).toISOString()).toBe(success.exchangedAt);
    });

    it("AC-1: should preserve { error: string } shape when refreshToken exchange fails", async () => {
      // Arrange
      mockFetch.mockResolvedValue({
        ok: false,
        json: async () => ({ error: "invalid_grant" }),
      });

      // Act
      const result = await exchangeTokenWithRefresh("google-oauth2", "expired-refresh-token");

      // Assert
      expect(result).toHaveProperty("error");
      expect(result).not.toHaveProperty("token");
    });

    it("AC-1: should set scope and expiresIn to null when response fields are absent", async () => {
      // Arrange
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ access_token: "min-token" }),
      });

      // Act
      const result = await exchangeTokenWithRefresh("google-oauth2", "refresh-token");

      // Assert
      const success = result as { scope: string | null; expiresIn: number | null };
      expect(success.scope).toBeNull();
      expect(success.expiresIn).toBeNull();
    });
  });

  describe("sanitizeApiError", () => {
    it("returns auth failure message for 401", () => {
      expect(sanitizeApiError(401, "Calendar")).toContain("authorization failed");
    });

    it("returns auth failure message for 403", () => {
      expect(sanitizeApiError(403, "Gmail")).toContain("authorization failed");
    });

    it("returns not found for 404", () => {
      expect(sanitizeApiError(404, "Calendar")).toContain("not found");
    });

    it("returns rate limit message for 429", () => {
      expect(sanitizeApiError(429, "Slack")).toContain("rate limit");
    });

    it("returns status code for unrecognized status", () => {
      expect(sanitizeApiError(500, "API")).toContain("500");
    });

    it("includes the label in all messages", () => {
      expect(sanitizeApiError(401, "MyService")).toContain("MyService");
      expect(sanitizeApiError(500, "MyService")).toContain("MyService");
    });
  });
});
