import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SuggestedAction } from "@/lib/types/actions";

// Mock token exchange
const mockExchangeToken = vi.fn();
vi.mock("@/lib/token-exchange", () => ({
  exchangeToken: (...args: unknown[]) => mockExchangeToken(...args),
  sanitizeApiError: (status: number, label: string) => `${label}: failed (${status})`,
}));

// Mock api-utils (buildRawEmail, resolveSlackChannelId)
vi.mock("@/lib/api-utils", () => ({
  buildRawEmail: (_to: string, _subject: string, _body: string) => "base64encodedmessage",
  resolveSlackChannelId: async (_channel: string, _token: string) => ({ id: "C123" }),
}));

// Mock fetch for Google/Slack APIs
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

const { executeAction, executeActionWithToken } = await import(
  "@/lib/actions/executor"
);

function makeAction(overrides: Partial<SuggestedAction> = {}): SuggestedAction {
  return {
    id: "act-1",
    userId: "auth0|user1",
    type: "email",
    status: "approved",
    priority: "high",
    dealId: "deal-1",
    dealName: "Acme Corp",
    contactName: "John Doe",
    justification: "Follow up on proposal",
    draft: { to: "john@acme.com", subject: "Follow up", body: "Hi John" },
    createdAt: "2026-04-04T00:00:00Z",
    updatedAt: "2026-04-04T00:00:00Z",
    ...overrides,
  };
}

describe("executor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("executeAction (existing — AC-12)", () => {
    it("AC-12: calls exchangeToken for email actions", async () => {
      mockExchangeToken.mockResolvedValue({
        token: "google-token",
        scope: "gmail",
        expiresIn: 3600,
        connection: "google-oauth2",
        exchangedAt: "2026-04-04T00:00:00Z",
      });
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ id: "draft-1" }),
      });

      const result = await executeAction(makeAction());

      expect(mockExchangeToken).toHaveBeenCalledWith("google-oauth2");
      expect(result.success).toBe(true);
    });

    it("AC-12: calls exchangeToken for calendar actions", async () => {
      mockExchangeToken.mockResolvedValue({
        token: "google-token",
        scope: "calendar",
        expiresIn: 3600,
        connection: "google-oauth2",
        exchangedAt: "2026-04-04T00:00:00Z",
      });
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ id: "event-1", htmlLink: "https://cal.google.com" }),
      });

      const action = makeAction({
        type: "calendar",
        draft: {
          title: "Meeting",
          date: "2026-04-05",
          time: "10:00",
          duration: 30,
          attendees: ["john@acme.com"],
        },
      });
      const result = await executeAction(action);

      expect(mockExchangeToken).toHaveBeenCalledWith("google-oauth2");
      expect(result.success).toBe(true);
    });
  });

  describe("executeActionWithToken (new — AC-5, AC-6)", () => {
    it("AC-5: executes email action with provided token (no exchangeToken call)", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ id: "draft-1" }),
      });

      const result = await executeActionWithToken(makeAction(), "pre-obtained-token");

      // Should NOT call exchangeToken — uses provided token directly
      expect(mockExchangeToken).not.toHaveBeenCalled();
      // Should call Gmail API with the provided token
      expect(mockFetch).toHaveBeenCalledWith(
        "https://www.googleapis.com/gmail/v1/users/me/drafts",
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: "Bearer pre-obtained-token",
          }),
        })
      );
      expect(result.success).toBe(true);
    });

    it("AC-5: executes calendar action with provided token", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ id: "event-1", htmlLink: "https://cal" }),
      });

      const action = makeAction({
        type: "calendar",
        draft: {
          title: "Meeting",
          date: "2026-04-05",
          time: "10:00",
          duration: 30,
          attendees: ["john@acme.com"],
        },
      });
      const result = await executeActionWithToken(action, "cal-token");

      expect(mockExchangeToken).not.toHaveBeenCalled();
      expect(result.success).toBe(true);
    });

    it("AC-5: executes slack action with provided token", async () => {
      // resolveSlackChannelId is mocked — only chat.postMessage goes through fetch
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, channel: "C123", ts: "12345" }),
      });

      const action = makeAction({
        type: "slack",
        draft: { channel: "#sales", message: "Hello team" },
      });
      const result = await executeActionWithToken(action, "slack-token");

      expect(mockExchangeToken).not.toHaveBeenCalled();
      expect(result.success).toBe(true);
    });

    it("AC-6: throws on API failure", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
      });

      await expect(
        executeActionWithToken(makeAction(), "bad-token")
      ).rejects.toThrow();
    });
  });
});
