import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted mock refs — must be created before vi.mock() is evaluated
// ---------------------------------------------------------------------------
const { mockInitiateCiba, mockPollCiba } = vi.hoisted(() => ({
  mockInitiateCiba: vi.fn(),
  mockPollCiba: vi.fn(),
}));

vi.mock("@/lib/ciba/authorize", () => ({
  initiateCiba: mockInitiateCiba,
}));

vi.mock("@/lib/ciba/poll", () => ({
  pollCiba: mockPollCiba,
}));

// Dynamic import so module resolution happens AFTER mocks are registered
const { cibaGate, buildMcpBindingMessage } = await import(
  "@/lib/mcp/ciba-gate"
);

// ---------------------------------------------------------------------------
// Shared test helpers
// ---------------------------------------------------------------------------

/** Returns a standard successful initiateCiba response */
function makeInitiateResponse(overrides?: Partial<{
  authReqId: string;
  expiresIn: number;
  interval: number;
  bindingMessage: string;
}>) {
  return {
    authReqId: "test-auth-req-id",
    expiresIn: 120,
    interval: 5,
    bindingMessage: "MCP: draft email to john@acme.com",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ciba-gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  // -------------------------------------------------------------------------
  describe("cibaGate", () => {
    // AC-2 + AC-3: Approved flow
    it("AC-2/AC-3: should call initiateCiba and return approved:true when pollCiba returns approved", async () => {
      // Arrange
      mockInitiateCiba.mockResolvedValueOnce(makeInitiateResponse());
      mockPollCiba.mockResolvedValueOnce({ status: "approved", accessToken: "tok_abc" });

      // Act
      const result = await cibaGate("user-1", "draftEmail", "MCP: draft email to john@acme.com");

      // Assert
      expect(mockInitiateCiba).toHaveBeenCalledOnce();
      expect(mockInitiateCiba).toHaveBeenCalledWith("user-1", "MCP: draft email to john@acme.com");
      expect(mockPollCiba).toHaveBeenCalledOnce();
      expect(mockPollCiba).toHaveBeenCalledWith("test-auth-req-id");
      expect(result).toEqual({ approved: true });
    });

    // AC-3: Multiple polls before approval
    it("AC-3: should poll until approved and return approved:true", async () => {
      // Arrange
      vi.useFakeTimers();
      mockInitiateCiba.mockResolvedValueOnce(makeInitiateResponse({ interval: 1 }));
      mockPollCiba
        .mockResolvedValueOnce({ status: "pending" })
        .mockResolvedValueOnce({ status: "pending" })
        .mockResolvedValueOnce({ status: "approved", accessToken: "tok_abc" });

      // Act — advance timers as polling is driven by intervals
      const resultPromise = cibaGate("user-1", "draftEmail", "MCP: draft email to john@acme.com", 10000);
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      // Assert
      expect(mockPollCiba).toHaveBeenCalledTimes(3);
      expect(result).toEqual({ approved: true });
    });

    // AC-4: User denies
    it("AC-4: should return approved:false with status denied when pollCiba returns denied", async () => {
      // Arrange
      mockInitiateCiba.mockResolvedValueOnce(makeInitiateResponse());
      mockPollCiba.mockResolvedValueOnce({ status: "denied" });

      // Act
      const result = await cibaGate("user-1", "draftEmail", "MCP: draft email to john@acme.com");

      // Assert
      expect(result).toEqual({
        approved: false,
        error: "User denied approval for draftEmail",
        status: "denied",
      });
    });

    // AC-5: Timeout — user does not respond within maxWaitMs
    it("AC-5: should return approved:false with status timeout when maxWaitMs is exceeded", async () => {
      // Arrange
      vi.useFakeTimers();
      mockInitiateCiba.mockResolvedValueOnce(makeInitiateResponse({ interval: 5 }));
      // Always pending — never approves
      mockPollCiba.mockResolvedValue({ status: "pending" });

      // Act
      const resultPromise = cibaGate("user-1", "draftEmail", "MCP: draft email to john@acme.com", 15);
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      // Assert
      expect(result).toEqual({
        approved: false,
        error: "Approval timed out for draftEmail",
        status: "timeout",
      });
    });

    // CIBA expired (Auth0 expired the auth_req_id — distinct from client-side timeout)
    it("should return approved:false with status expired when pollCiba returns expired", async () => {
      // Arrange
      mockInitiateCiba.mockResolvedValueOnce(makeInitiateResponse());
      mockPollCiba.mockResolvedValueOnce({ status: "expired" });

      // Act
      const result = await cibaGate("user-1", "draftEmail", "MCP: draft email to john@acme.com");

      // Assert
      expect(result).toEqual({
        approved: false,
        error: expect.stringContaining("draftEmail"),
        status: "expired",
      });
    });

    // CIBA generic Auth0 error
    it("should return approved:false with status error when pollCiba returns error", async () => {
      // Arrange
      mockInitiateCiba.mockResolvedValueOnce(makeInitiateResponse());
      mockPollCiba.mockResolvedValueOnce({ status: "error", error: "Auth0 server error" });

      // Act
      const result = await cibaGate("user-1", "draftEmail", "MCP: draft email to john@acme.com");

      // Assert
      expect(result).toEqual({
        approved: false,
        error: expect.stringContaining("draftEmail"),
        status: "error",
      });
    });

    // initiateCiba throws
    it("should return approved:false with status error when initiateCiba throws", async () => {
      // Arrange
      mockInitiateCiba.mockRejectedValueOnce(new Error("Network failure"));

      // Act
      const result = await cibaGate("user-1", "draftEmail", "MCP: draft email to john@acme.com");

      // Assert
      expect(result).toEqual({
        approved: false,
        error: expect.stringContaining("Network failure"),
        status: "error",
      });
    });

    // Poll interval is respected — polls use the interval returned by initiateCiba
    it("should use the interval from initiateCiba response when scheduling polls", async () => {
      // Arrange
      vi.useFakeTimers();
      const customInterval = 3; // seconds
      mockInitiateCiba.mockResolvedValueOnce(makeInitiateResponse({ interval: customInterval }));
      mockPollCiba
        .mockResolvedValueOnce({ status: "pending" })
        .mockResolvedValueOnce({ status: "approved", accessToken: "tok" });

      // Act
      const resultPromise = cibaGate("user-1", "draftEmail", "MCP: draft email", 30000);

      // Advance less than one interval — no poll yet (besides any immediate first poll)
      await vi.advanceTimersByTimeAsync((customInterval * 1000) - 100);
      const callsBeforeInterval = mockPollCiba.mock.calls.length;

      // Advance past the interval — second poll fires
      await vi.advanceTimersByTimeAsync(200);
      const callsAfterInterval = mockPollCiba.mock.calls.length;

      await vi.runAllTimersAsync();
      await resultPromise;

      // Assert that a second poll did not fire before the interval elapsed
      expect(callsBeforeInterval).toBeLessThan(callsAfterInterval);
    });

    // Default maxWaitMs is 50000
    it("should default maxWaitMs to 50000ms when not provided", async () => {
      // Arrange
      vi.useFakeTimers();
      mockInitiateCiba.mockResolvedValueOnce(makeInitiateResponse({ interval: 5 }));
      mockPollCiba.mockResolvedValue({ status: "pending" });

      // Act — do not pass maxWaitMs
      const resultPromise = cibaGate("user-1", "draftEmail", "MCP: draft email");

      // Advance to just under 50 seconds — should NOT have timed out yet
      await vi.advanceTimersByTimeAsync(49_999);
      // At this point the promise should still be pending (not resolved/rejected)
      // We verify by racing against a short-circuit
      let resolved = false;
      resultPromise.then(() => { resolved = true; });
      await vi.advanceTimersByTimeAsync(0);
      expect(resolved).toBe(false);

      // Now advance past 50s — should time out
      await vi.advanceTimersByTimeAsync(5_000);
      const result = await resultPromise;
      expect(result).toEqual({
        approved: false,
        error: expect.stringContaining("draftEmail"),
        status: "timeout",
      });
    });
  });

  // -------------------------------------------------------------------------
  describe("buildMcpBindingMessage", () => {
    // AC-11: draftEmail binding message
    it("AC-11: should build binding message for draftEmail with recipient", () => {
      // Arrange
      const params = { to: "john@acme.com", subject: "Q2 Proposal" };

      // Act
      const message = buildMcpBindingMessage("draftEmail", params);

      // Assert
      expect(message).toBe("MCP: draft email to john@acme.com");
    });

    // AC-11: createCalendarEvent binding message
    it("AC-11: should build binding message for createCalendarEvent with summary", () => {
      // Arrange
      const params = { summary: "Pipeline Review" };

      // Act
      const message = buildMcpBindingMessage("createCalendarEvent", params);

      // Assert
      expect(message).toBe('MCP: calendar "Pipeline Review"');
    });

    // AC-11: sendSlackMessage binding message
    it("AC-11: should build binding message for sendSlackMessage with channel and text", () => {
      // Arrange
      const params = { channel: "deals", text: "Pipeline update..." };

      // Act
      const message = buildMcpBindingMessage("sendSlackMessage", params);

      // Assert
      expect(message).toBe('MCP: slack #deals "Pipeline update..."');
    });

    // AC-11: All messages truncated to 64 chars max
    it("AC-11: should truncate binding message to 64 characters", () => {
      // Arrange — a very long subject that would produce a long message
      const params = {
        to: "longrecipient@verylongdomain.example.com",
        subject: "An extremely long subject line that goes on and on",
      };

      // Act
      const message = buildMcpBindingMessage("draftEmail", params);

      // Assert
      expect(message.length).toBeLessThanOrEqual(64);
    });

    // Edge: unknown tool name falls back gracefully
    it("should return a generic MCP binding message for unknown tool names", () => {
      // Arrange
      const params = { someField: "someValue" };

      // Act
      const message = buildMcpBindingMessage("unknownTool", params);

      // Assert
      expect(message).toMatch(/^MCP:/);
      expect(message.length).toBeLessThanOrEqual(64);
    });

    // Edge: empty params object
    it("should handle empty params without throwing", () => {
      // Arrange + Act + Assert
      expect(() => buildMcpBindingMessage("draftEmail", {})).not.toThrow();
    });

    // Edge: message with long channel + text is still truncated
    it("should truncate sendSlackMessage binding message when channel and text are long", () => {
      // Arrange
      const params = {
        channel: "very-long-channel-name-that-exceeds-limits",
        text: "A very long message body that will push this well past sixty-four characters",
      };

      // Act
      const message = buildMcpBindingMessage("sendSlackMessage", params);

      // Assert
      expect(message.length).toBeLessThanOrEqual(64);
    });

    // AC-7: Client name prefix in binding message
    it("AC-7: should prefix binding message with client name when provided", () => {
      const params = { to: "alice@acme.com" };
      const message = buildMcpBindingMessage("draftEmail", params, "Cursor IDE");
      expect(message).toBe("Cursor IDE - draft email to alice@acme.com");
    });

    // AC-8: No client name preserves existing MCP: prefix
    it("AC-8: should use MCP: prefix when clientName is undefined", () => {
      const params = { to: "alice@acme.com" };
      const message = buildMcpBindingMessage("draftEmail", params);
      expect(message).toBe("MCP: draft email to alice@acme.com");
    });

    // AC-9: CIBA-unsafe characters stripped from client name
    it("AC-9: should strip CIBA-unsafe characters from clientName", () => {
      const params = { to: "a@b.com" };
      const message = buildMcpBindingMessage("draftEmail", params, "Bad[Name]{Test}");
      expect(message).toMatch(/^BadNameTest - /);
    });

    // AC-10: Long client name still truncates to 64 chars total
    it("AC-10: should truncate total message to 64 characters with long clientName", () => {
      const params = { to: "alice@acme.com" };
      const longName = "A".repeat(50);
      const message = buildMcpBindingMessage("draftEmail", params, longName);
      expect(message.length).toBeLessThanOrEqual(64);
    });

    // AC-7: Client name works for createCalendarEvent
    it("AC-7: should prefix calendar binding message with client name", () => {
      const params = { summary: "Pipeline Review" };
      const message = buildMcpBindingMessage("createCalendarEvent", params, "Sales Bot");
      expect(message).toBe('Sales Bot - calendar "Pipeline Review"');
    });

    // AC-7: Client name works for sendSlackMessage
    it("AC-7: should prefix slack binding message with client name", () => {
      const params = { channel: "deals", text: "Update" };
      const message = buildMcpBindingMessage("sendSlackMessage", params, "Slack Agent");
      expect(message).toBe('Slack Agent - slack #deals "Update"');
    });
  });
});
