import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Hoisted mock refs — must be declared before vi.mock() is evaluated
// ---------------------------------------------------------------------------
const {
  mockGetScheduleRefreshToken,
  mockExchangeTokenWithRefresh,
  mockExchangeToken,
  mockIsConnectionDisabled,
  mockCibaGate,
  mockBuildMcpBindingMessage,
  mockShouldRequireCibaMcp,
  mockWriteAuditEntry,
  mockGetUserSettings,
} = vi.hoisted(() => ({
  mockGetScheduleRefreshToken: vi.fn(),
  mockExchangeTokenWithRefresh: vi.fn(),
  mockExchangeToken: vi.fn(),
  mockIsConnectionDisabled: vi.fn(),
  mockCibaGate: vi.fn(),
  mockBuildMcpBindingMessage: vi.fn(),
  mockShouldRequireCibaMcp: vi.fn(),
  mockWriteAuditEntry: vi.fn(),
  mockGetUserSettings: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock("@/lib/data/schedule-tokens", () => ({
  getScheduleRefreshToken: mockGetScheduleRefreshToken,
}));

vi.mock("@/lib/token-exchange", () => ({
  exchangeTokenWithRefresh: mockExchangeTokenWithRefresh,
  exchangeToken: mockExchangeToken,
  sanitizeApiError: vi.fn((status: number, label: string) => `${label}: error ${status}`),
  buildTokenMeta: vi.fn(),
}));

vi.mock("@/lib/data/connections", () => ({
  isConnectionDisabled: mockIsConnectionDisabled,
}));

vi.mock("@/lib/mcp/ciba-gate", () => ({
  cibaGate: mockCibaGate,
  buildMcpBindingMessage: mockBuildMcpBindingMessage,
}));

vi.mock("@/lib/ciba/should-require", () => ({
  shouldRequireCiba: vi.fn(() => false),
  shouldRequireCibaMcp: mockShouldRequireCibaMcp,
}));

vi.mock("@/lib/data/audit", () => ({
  writeAuditEntry: mockWriteAuditEntry,
}));

vi.mock("@/lib/data/settings", () => ({
  getUserSettings: mockGetUserSettings,
}));

vi.mock("@/lib/rate-limit", () => ({
  getMcpClientLimiter: vi.fn().mockReturnValue({
    limit: vi.fn().mockResolvedValue({ success: true }),
  }),
  getToolRateLimiter: vi.fn().mockReturnValue({
    limit: vi.fn().mockResolvedValue({ success: true, remaining: 9, reset: Date.now() + 60000, limit: 10 }),
  }),
}));

vi.mock("@/lib/data/mcp-analytics", () => ({
  recordMcpCall: vi.fn().mockResolvedValue(undefined),
}));

// Tool definition mocks — no actual API calls
vi.mock("@/lib/tools/calendar", () => ({
  checkCalendar: {
    description: "Check calendar",
    inputSchema: z.object({ date: z.string() }),
  },
  createCalendarEvent: {
    description: "Create calendar event",
    inputSchema: z.object({
      summary: z.string(),
      startDateTime: z.string(),
      endDateTime: z.string(),
    }),
  },
}));

vi.mock("@/lib/tools/gmail", () => ({
  searchEmails: {
    description: "Search emails",
    inputSchema: z.object({ query: z.string() }),
  },
  draftEmail: {
    description: "Draft email",
    inputSchema: z.object({
      to: z.string(),
      subject: z.string(),
      body: z.string(),
    }),
  },
}));

vi.mock("@/lib/tools/slack", () => ({
  listSlackChannels: {
    description: "List Slack channels",
    inputSchema: z.object({}),
  },
  sendSlackMessage: {
    description: "Send Slack message",
    inputSchema: z.object({
      channel: z.string(),
      text: z.string(),
    }),
  },
}));

vi.mock("@/lib/tools/crm", () => ({
  createCrmTools: vi.fn(() => ({
    listDeals: {
      description: "List deals",
      inputSchema: z.object({}),
      execute: vi.fn().mockResolvedValue({ deals: [] }),
    },
    getDealDetails: {
      description: "Get deal details",
      inputSchema: z.object({ dealId: z.string() }),
      execute: vi.fn().mockResolvedValue({ deal: null }),
    },
    searchContacts: {
      description: "Search contacts",
      inputSchema: z.object({ query: z.string() }),
      execute: vi.fn().mockResolvedValue({ contacts: [] }),
    },
  })),
}));

// Dynamic import AFTER mocks are registered
const { adaptToolsForMcp } = await import("@/lib/mcp/tool-adapter");

// ---------------------------------------------------------------------------
// Mock MCP server — captures registerTool calls
// ---------------------------------------------------------------------------

function makeMockServer() {
  // Mimic McpServer's internal _registeredTools Map so tools/list override works
  const registeredTools = new Map<string, { description: string; inputSchema?: unknown }>();
  const registerTool = vi.fn((name: string, config: { description: string; inputSchema?: unknown }, _handler: unknown) => {
    registeredTools.set(name, { description: config.description, inputSchema: config.inputSchema });
  });
  return {
    registerTool,
    _registeredTools: registeredTools,
    server: { setRequestHandler: vi.fn() },
  };
}

/**
 * Calls adaptToolsForMcp(), registers all tools on a fresh mock server,
 * and returns a map of toolName -> { config, handler }.
 */
async function setupRegisteredTools(userId = "user-123") {
  const mockServer = makeMockServer();
  const registrar = adaptToolsForMcp(userId);
  await registrar(mockServer as never);

  const toolMap: Record<string, { config: unknown; handler: (args: unknown, context: unknown) => Promise<unknown> }> = {};
  for (const call of mockServer.registerTool.mock.calls) {
    const [name, config, handler] = call as [string, unknown, (args: unknown, context: unknown) => Promise<unknown>];
    toolMap[name] = { config, handler };
  }
  return { mockServer, toolMap };
}

/** Standard MCP auth context carrying the userId as clientId.
 * Includes all MCP scopes by default (scope check passes).
 */
function makeAuthContext(userId = "user-123") {
  return {
    authInfo: {
      clientId: userId,
      scopes: ["crm:read", "calendar:read", "gmail:read", "slack:read"],
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("tool-adapter (MCP)", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default: all capabilities enabled, no tools blocked by trust level
    mockGetUserSettings.mockResolvedValue({
      capabilities: { crmRead: true, crmWrite: true, calendar: true, gmail: true, slack: true },
      approvalRequired: { crmWrite: false },
      toolTrust: {},
      schedule: { enabled: false, hours: [], timezone: "UTC" },
    });

    // Default: connection enabled, refresh token present, token exchange succeeds
    mockIsConnectionDisabled.mockResolvedValue(false);
    mockGetScheduleRefreshToken.mockResolvedValue("stored-refresh-token");
    mockExchangeTokenWithRefresh.mockResolvedValue({
      token: "mcp-access-token",
      scope: null,
      expiresIn: 3600,
      connection: "google-oauth2",
      exchangedAt: new Date().toISOString(),
    });

    // Default: CIBA gate approves
    mockCibaGate.mockResolvedValue({ approved: true });
    mockBuildMcpBindingMessage.mockReturnValue("MCP: draft email to test@example.com");

    // Default: write tools require CIBA, read tools do not
    mockShouldRequireCibaMcp.mockImplementation((toolName: string) =>
      ["draftEmail", "createCalendarEvent", "sendSlackMessage"].includes(toolName)
    );

    // Mock fetch for executor API calls
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: "result-123" }),
      text: async () => JSON.stringify({ id: "result-123" }),
    });
  });

  // -------------------------------------------------------------------------
  describe("AC-1: Tool registration — 9 tools total", () => {
    it("AC-1: should register exactly 9 tools on the MCP server", async () => {
      // Arrange
      const { mockServer } = await setupRegisteredTools();

      // Assert
      expect(mockServer.registerTool).toHaveBeenCalledTimes(9);
    });

    it("AC-1: should register all 3 read tools (checkCalendar, searchEmails, listSlackChannels)", async () => {
      // Arrange
      const { toolMap } = await setupRegisteredTools();

      // Assert — read tools present
      expect(toolMap).toHaveProperty("checkCalendar");
      expect(toolMap).toHaveProperty("searchEmails");
      expect(toolMap).toHaveProperty("listSlackChannels");
    });

    it("AC-1: should register all 3 CRM read tools (listDeals, getDealDetails, searchContacts)", async () => {
      // Arrange
      const { toolMap } = await setupRegisteredTools();

      // Assert — CRM tools present
      expect(toolMap).toHaveProperty("listDeals");
      expect(toolMap).toHaveProperty("getDealDetails");
      expect(toolMap).toHaveProperty("searchContacts");
    });

    it("AC-1: should register all 3 write tools (draftEmail, createCalendarEvent, sendSlackMessage)", async () => {
      // Arrange
      const { toolMap } = await setupRegisteredTools();

      // Assert — new write tools present
      expect(toolMap).toHaveProperty("draftEmail");
      expect(toolMap).toHaveProperty("createCalendarEvent");
      expect(toolMap).toHaveProperty("sendSlackMessage");
    });
  });

  // -------------------------------------------------------------------------
  describe("AC-6: Read tools use stored refresh token", () => {
    it("AC-6: should call getScheduleRefreshToken when checkCalendar executes", async () => {
      // Arrange
      const { toolMap } = await setupRegisteredTools("user-abc");
      const { handler } = toolMap["checkCalendar"];

      // Act
      await handler({ date: "2026-04-05" }, makeAuthContext("user-abc"));

      // Assert
      expect(mockGetScheduleRefreshToken).toHaveBeenCalledWith("user-abc");
    });

    it("AC-6: should call exchangeTokenWithRefresh (not exchangeToken) for checkCalendar", async () => {
      // Arrange
      const { toolMap } = await setupRegisteredTools();
      const { handler } = toolMap["checkCalendar"];

      // Act
      await handler({ date: "2026-04-05" }, makeAuthContext());

      // Assert
      expect(mockExchangeTokenWithRefresh).toHaveBeenCalled();
      expect(mockExchangeToken).not.toHaveBeenCalled();
    });

    it("AC-6: should call exchangeTokenWithRefresh for searchEmails", async () => {
      // Arrange
      const { toolMap } = await setupRegisteredTools();
      const { handler } = toolMap["searchEmails"];

      // Act
      await handler({ query: "deal updates" }, makeAuthContext());

      // Assert
      expect(mockExchangeTokenWithRefresh).toHaveBeenCalled();
      expect(mockExchangeToken).not.toHaveBeenCalled();
    });

    it("AC-6: should call exchangeTokenWithRefresh for listSlackChannels", async () => {
      // Arrange
      const { toolMap } = await setupRegisteredTools();
      const { handler } = toolMap["listSlackChannels"];

      // Act
      await handler({}, makeAuthContext());

      // Assert
      expect(mockExchangeTokenWithRefresh).toHaveBeenCalled();
      expect(mockExchangeToken).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  describe("AC-7: Missing refresh token returns helpful error", () => {
    it("AC-7: should return isError:true with setup instructions when no refresh token exists", async () => {
      // Arrange
      mockGetScheduleRefreshToken.mockResolvedValue(null);
      const { toolMap } = await setupRegisteredTools();
      const { handler } = toolMap["checkCalendar"];

      // Act
      const result = await handler({ date: "2026-04-05" }, makeAuthContext()) as { isError: boolean; content: Array<{ text: string }> };

      // Assert
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("No stored refresh token");
      expect(result.content[0].text).toContain("scheduled actions");
    });

    it("AC-7: should return helpful error for write tools when no refresh token exists", async () => {
      // Arrange
      mockGetScheduleRefreshToken.mockResolvedValue(null);
      // CIBA gate approved (token lookup happens after CIBA for write tools)
      mockCibaGate.mockResolvedValue({ approved: true });
      const { toolMap } = await setupRegisteredTools();
      const { handler } = toolMap["draftEmail"];

      // Act
      const result = await handler(
        { to: "john@acme.com", subject: "Test", body: "Hello" },
        makeAuthContext()
      ) as { isError: boolean; content: Array<{ text: string }> };

      // Assert
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("No stored refresh token");
    });

    it("AC-7: should not call exchangeTokenWithRefresh when refresh token is missing", async () => {
      // Arrange
      mockGetScheduleRefreshToken.mockResolvedValue(null);
      const { toolMap } = await setupRegisteredTools();
      const { handler } = toolMap["checkCalendar"];

      // Act
      await handler({ date: "2026-04-05" }, makeAuthContext());

      // Assert
      expect(mockExchangeTokenWithRefresh).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  describe("AC-8: Disabled connection returns error before CIBA", () => {
    it("AC-8: should return connection-disabled error without calling cibaGate for draftEmail", async () => {
      // Arrange
      mockIsConnectionDisabled.mockResolvedValue(true);
      const { toolMap } = await setupRegisteredTools();
      const { handler } = toolMap["draftEmail"];

      // Act
      const result = await handler(
        { to: "john@acme.com", subject: "Test", body: "Hello" },
        makeAuthContext()
      ) as { isError: boolean; content: Array<{ text: string }> };

      // Assert
      expect(result.isError).toBe(true);
      expect(mockCibaGate).not.toHaveBeenCalled();
    });

    it("AC-8: should return connection-disabled error without calling cibaGate for createCalendarEvent", async () => {
      // Arrange
      mockIsConnectionDisabled.mockResolvedValue(true);
      const { toolMap } = await setupRegisteredTools();
      const { handler } = toolMap["createCalendarEvent"];

      // Act
      const result = await handler(
        { summary: "Meeting", startDateTime: "2026-04-05T10:00:00Z", endDateTime: "2026-04-05T11:00:00Z" },
        makeAuthContext()
      ) as { isError: boolean; content: Array<{ text: string }> };

      // Assert
      expect(result.isError).toBe(true);
      expect(mockCibaGate).not.toHaveBeenCalled();
    });

    it("AC-8: should return connection-disabled error for read tools too (no token exchange attempted)", async () => {
      // Arrange
      mockIsConnectionDisabled.mockResolvedValue(true);
      const { toolMap } = await setupRegisteredTools();
      const { handler } = toolMap["checkCalendar"];

      // Act
      const result = await handler({ date: "2026-04-05" }, makeAuthContext()) as { isError: boolean };

      // Assert
      expect(result.isError).toBe(true);
      expect(mockExchangeTokenWithRefresh).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  describe("AC-9: Read tools skip CIBA", () => {
    it("AC-9: should NOT call cibaGate when checkCalendar executes", async () => {
      // Arrange
      const { toolMap } = await setupRegisteredTools();
      const { handler } = toolMap["checkCalendar"];

      // Act
      await handler({ date: "2026-04-05" }, makeAuthContext());

      // Assert
      expect(mockCibaGate).not.toHaveBeenCalled();
    });

    it("AC-9: should NOT call cibaGate when searchEmails executes", async () => {
      // Arrange
      const { toolMap } = await setupRegisteredTools();
      const { handler } = toolMap["searchEmails"];

      // Act
      await handler({ query: "test" }, makeAuthContext());

      // Assert
      expect(mockCibaGate).not.toHaveBeenCalled();
    });

    it("AC-9: should NOT call cibaGate when listSlackChannels executes", async () => {
      // Arrange
      const { toolMap } = await setupRegisteredTools();
      const { handler } = toolMap["listSlackChannels"];

      // Act
      await handler({}, makeAuthContext());

      // Assert
      expect(mockCibaGate).not.toHaveBeenCalled();
    });

    it("AC-9: should call cibaGate when draftEmail executes (write tool requires CIBA)", async () => {
      // Arrange
      const { toolMap } = await setupRegisteredTools();
      const { handler } = toolMap["draftEmail"];

      // Act
      await handler(
        { to: "john@acme.com", subject: "Test", body: "Hello" },
        makeAuthContext()
      );

      // Assert — CIBA was invoked for write tool
      expect(mockCibaGate).toHaveBeenCalledOnce();
    });
  });

  // -------------------------------------------------------------------------
  describe("AC-2/AC-4/AC-5: CIBA gate behaviour for write tools", () => {
    it("AC-4: should return isError:true with denied message when CIBA is denied for draftEmail", async () => {
      // Arrange
      mockCibaGate.mockResolvedValue({
        approved: false,
        error: "User denied approval for draftEmail",
        status: "denied",
      });
      const { toolMap } = await setupRegisteredTools();
      const { handler } = toolMap["draftEmail"];

      // Act
      const result = await handler(
        { to: "john@acme.com", subject: "Test", body: "Hello" },
        makeAuthContext()
      ) as { isError: boolean; content: Array<{ text: string }> };

      // Assert
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("denied");
    });

    it("AC-5: should return isError:true with timeout message when CIBA times out for createCalendarEvent", async () => {
      // Arrange
      mockCibaGate.mockResolvedValue({
        approved: false,
        error: "Approval timed out for createCalendarEvent",
        status: "timeout",
      });
      const { toolMap } = await setupRegisteredTools();
      const { handler } = toolMap["createCalendarEvent"];

      // Act
      const result = await handler(
        { summary: "Meeting", startDateTime: "2026-04-05T10:00:00Z", endDateTime: "2026-04-05T11:00:00Z" },
        makeAuthContext()
      ) as { isError: boolean; content: Array<{ text: string }> };

      // Assert
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("timed out");
    });

    it("should NOT call exchangeTokenWithRefresh when CIBA is denied (execution blocked)", async () => {
      // Arrange
      mockCibaGate.mockResolvedValue({
        approved: false,
        error: "User denied approval for sendSlackMessage",
        status: "denied",
      });
      const { toolMap } = await setupRegisteredTools();
      const { handler } = toolMap["sendSlackMessage"];

      // Act
      await handler(
        { channel: "deals", text: "Pipeline update" },
        makeAuthContext()
      );

      // Assert — token exchange never attempted if CIBA failed
      expect(mockExchangeTokenWithRefresh).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  describe("AC-3: Approved CIBA completes execution for write tools", () => {
    it("AC-3: should call getScheduleRefreshToken after CIBA approval for draftEmail", async () => {
      // Arrange
      mockCibaGate.mockResolvedValue({ approved: true });
      const { toolMap } = await setupRegisteredTools("user-xyz");
      const { handler } = toolMap["draftEmail"];

      // Act
      await handler(
        { to: "john@acme.com", subject: "Test", body: "Hello" },
        makeAuthContext("user-xyz")
      );

      // Assert
      expect(mockGetScheduleRefreshToken).toHaveBeenCalledWith("user-xyz");
    });

    it("AC-3: should call exchangeTokenWithRefresh after CIBA approval for createCalendarEvent", async () => {
      // Arrange
      mockCibaGate.mockResolvedValue({ approved: true });
      const { toolMap } = await setupRegisteredTools();
      const { handler } = toolMap["createCalendarEvent"];

      // Act
      await handler(
        { summary: "Deal Review", startDateTime: "2026-04-05T10:00:00Z", endDateTime: "2026-04-05T11:00:00Z" },
        makeAuthContext()
      );

      // Assert
      expect(mockExchangeTokenWithRefresh).toHaveBeenCalled();
    });

    it("AC-3: should return non-error result when CIBA approved and token exchange succeeds for draftEmail", async () => {
      // Arrange
      mockCibaGate.mockResolvedValue({ approved: true });
      const { toolMap } = await setupRegisteredTools();
      const { handler } = toolMap["draftEmail"];

      // Act
      const result = await handler(
        { to: "john@acme.com", subject: "Test", body: "Hello" },
        makeAuthContext()
      ) as { isError?: boolean };

      // Assert
      expect(result.isError).toBeFalsy();
    });
  });

  // -------------------------------------------------------------------------
  describe("AC-10: Audit logging for all MCP tool executions", () => {
    it("AC-10: should write audit entry with threadId mcp after successful checkCalendar", async () => {
      // Arrange
      const { toolMap } = await setupRegisteredTools("audit-user");
      const { handler } = toolMap["checkCalendar"];

      // Act
      await handler({ date: "2026-04-05" }, makeAuthContext("audit-user"));

      // Assert — writeAuditEntry is called with (userId, entryObject)
      expect(mockWriteAuditEntry).toHaveBeenCalledWith(
        "audit-user",
        expect.objectContaining({
          threadId: "mcp",
          toolName: "checkCalendar",
        })
      );
    });

    it("AC-10: should write audit entry with threadId mcp after successful draftEmail", async () => {
      // Arrange
      const { toolMap } = await setupRegisteredTools("audit-user");
      const { handler } = toolMap["draftEmail"];

      // Act
      await handler(
        { to: "john@acme.com", subject: "Test", body: "Hello" },
        makeAuthContext("audit-user")
      );

      // Assert
      expect(mockWriteAuditEntry).toHaveBeenCalledWith(
        "audit-user",
        expect.objectContaining({
          threadId: "mcp",
          toolName: "draftEmail",
        })
      );
    });

    it("AC-10: should include input params in audit entry", async () => {
      // Arrange
      const params = { date: "2026-04-10" };
      const { toolMap } = await setupRegisteredTools();
      const { handler } = toolMap["checkCalendar"];

      // Act
      await handler(params, makeAuthContext());

      // Assert
      expect(mockWriteAuditEntry).toHaveBeenCalledWith(
        "user-123",
        expect.objectContaining({
          input: expect.objectContaining(params),
        })
      );
    });

    it("AC-10: should write audit entry with result:success on happy path", async () => {
      // Arrange
      const { toolMap } = await setupRegisteredTools();
      const { handler } = toolMap["checkCalendar"];

      // Act
      await handler({ date: "2026-04-05" }, makeAuthContext());

      // Assert
      expect(mockWriteAuditEntry).toHaveBeenCalledWith(
        "user-123",
        expect.objectContaining({
          result: "success",
        })
      );
    });

    it("AC-10: should write audit entry with result:error on failure (missing refresh token)", async () => {
      // Arrange
      mockGetScheduleRefreshToken.mockResolvedValue(null);
      const { toolMap } = await setupRegisteredTools();
      const { handler } = toolMap["searchEmails"];

      // Act
      await handler({ query: "test" }, makeAuthContext());

      // Assert
      expect(mockWriteAuditEntry).toHaveBeenCalledWith(
        "user-123",
        expect.objectContaining({
          result: "error",
          threadId: "mcp",
          toolName: "searchEmails",
        })
      );
    });

    it("AC-10: should include durationMs in audit entry", async () => {
      // Arrange
      const { toolMap } = await setupRegisteredTools();
      const { handler } = toolMap["checkCalendar"];

      // Act
      await handler({ date: "2026-04-05" }, makeAuthContext());

      // Assert
      expect(mockWriteAuditEntry).toHaveBeenCalledWith(
        "user-123",
        expect.objectContaining({
          durationMs: expect.any(Number),
        })
      );
    });

    it("AC-10: should write audit entry even when CIBA is denied (write tool failure path)", async () => {
      // Arrange
      mockCibaGate.mockResolvedValue({
        approved: false,
        error: "User denied approval for draftEmail",
        status: "denied",
      });
      const { toolMap } = await setupRegisteredTools();
      const { handler } = toolMap["draftEmail"];

      // Act
      await handler(
        { to: "john@acme.com", subject: "Test", body: "Hello" },
        makeAuthContext()
      );

      // Assert — audit always fires, even on CIBA denial
      expect(mockWriteAuditEntry).toHaveBeenCalledWith(
        "user-123",
        expect.objectContaining({
          threadId: "mcp",
          toolName: "draftEmail",
        })
      );
    });
  });

  // -------------------------------------------------------------------------
  describe("Capability enforcement", () => {
    it("should return isError:true when tool category is disabled by user", async () => {
      // Arrange — gmail capability disabled
      mockGetUserSettings.mockResolvedValue({
        capabilities: { crmRead: true, crmWrite: true, calendar: true, gmail: false, slack: true },
        approvalRequired: { crmWrite: false },
        toolTrust: {},
        schedule: { enabled: false, hours: [], timezone: "UTC" },
      });
      const { toolMap } = await setupRegisteredTools();
      const { handler } = toolMap["draftEmail"];

      // Act
      const result = await handler(
        { to: "john@acme.com", subject: "Test", body: "Hello" },
        makeAuthContext()
      ) as { isError: boolean; content: Array<{ text: string }> };

      // Assert
      expect(result.isError).toBe(true);
      expect(mockCibaGate).not.toHaveBeenCalled();
      expect(mockGetScheduleRefreshToken).not.toHaveBeenCalled();
    });

    it("should return isError:true when tool trust level is 'never'", async () => {
      // Arrange — draftEmail set to "never" trust
      mockGetUserSettings.mockResolvedValue({
        capabilities: { crmRead: true, crmWrite: true, calendar: true, gmail: true, slack: true },
        approvalRequired: { crmWrite: false },
        toolTrust: { draftEmail: "never" },
        schedule: { enabled: false, hours: [], timezone: "UTC" },
      });
      const { toolMap } = await setupRegisteredTools();
      const { handler } = toolMap["draftEmail"];

      // Act
      const result = await handler(
        { to: "john@acme.com", subject: "Test", body: "Hello" },
        makeAuthContext()
      ) as { isError: boolean };

      // Assert
      expect(result.isError).toBe(true);
      expect(mockCibaGate).not.toHaveBeenCalled();
    });

    it("should allow execution when capability is enabled", async () => {
      // Arrange — all defaults (enabled)
      const { toolMap } = await setupRegisteredTools();
      const { handler } = toolMap["draftEmail"];

      // Act
      const result = await handler(
        { to: "john@acme.com", subject: "Test", body: "Hello" },
        makeAuthContext()
      ) as { isError?: boolean };

      // Assert
      expect(result.isError).toBeFalsy();
    });
  });

  // -------------------------------------------------------------------------
  describe("tools/list filtering (AC-2 through AC-5)", () => {
    /**
     * Helper: set up tools and extract the tools/list handler that was
     * registered via server.server.setRequestHandler.
     */
    async function getToolsListHandler() {
      const mockServer = makeMockServer();
      const registrar = adaptToolsForMcp();
      await registrar(mockServer as never);

      // setRequestHandler should have been called with tools/list schema + handler
      expect(mockServer.server.setRequestHandler).toHaveBeenCalled();
      const [, handler] = mockServer.server.setRequestHandler.mock.calls[0] as [unknown, (req: unknown, extra: unknown) => unknown];
      return handler;
    }

    // AC-2: Auth0 token with subset of scopes
    it("AC-2: should filter tools/list by scope — crm:read + calendar:read returns only CRM + calendar tools", async () => {
      const handler = await getToolsListHandler();
      const result = await handler({}, {
        authInfo: {
          clientId: "user-1",
          scopes: ["crm:read", "calendar:read"],
          extra: { mcpClientId: "default" },
        },
      }) as { tools: Array<{ name: string }> };

      const names = result.tools.map(t => t.name);
      // CRM read tools + calendar tools (read + write since MCP allows write with CIBA)
      expect(names).toContain("listDeals");
      expect(names).toContain("getDealDetails");
      expect(names).toContain("searchContacts");
      expect(names).toContain("checkCalendar");
      expect(names).toContain("createCalendarEvent");
      // Gmail and Slack tools should NOT be present
      expect(names).not.toContain("draftEmail");
      expect(names).not.toContain("searchEmails");
      expect(names).not.toContain("sendSlackMessage");
      expect(names).not.toContain("listSlackChannels");
    });

    // AC-3: API key client with allowedTools
    it("AC-3: should filter tools/list by allowedTools for API key client", async () => {
      const handler = await getToolsListHandler();
      const result = await handler({}, {
        authInfo: {
          clientId: "user-1",
          scopes: ["tools"],
          extra: {
            mcpClientId: "client-abc",
            allowedTools: ["checkCalendar", "listDeals"],
          },
        },
      }) as { tools: Array<{ name: string }> };

      const names = result.tools.map(t => t.name);
      expect(names).toEqual(expect.arrayContaining(["checkCalendar", "listDeals"]));
      expect(names).toHaveLength(2);
    });

    // AC-4: Full scopes return all 9 tools
    it("AC-4: should return all registered tools when full scopes provided", async () => {
      const handler = await getToolsListHandler();
      const result = await handler({}, {
        authInfo: {
          clientId: "user-1",
          scopes: ["crm:read", "calendar:read", "gmail:read", "slack:read"],
          extra: { mcpClientId: "default" },
        },
      }) as { tools: Array<{ name: string }> };

      expect(result.tools).toHaveLength(9);
    });

    // AC-5: No auth info returns empty list (fail-closed)
    it("AC-5: should return empty tools list when no authInfo present (fail-closed)", async () => {
      const handler = await getToolsListHandler();
      const result = await handler({}, {}) as { tools: Array<{ name: string }> };

      expect(result.tools).toHaveLength(0);
    });

    // AC-5: Missing scopes on default client returns empty
    it("AC-5: should return empty tools list when scopes array is empty", async () => {
      const handler = await getToolsListHandler();
      const result = await handler({}, {
        authInfo: {
          clientId: "user-1",
          scopes: [],
          extra: { mcpClientId: "default" },
        },
      }) as { tools: Array<{ name: string }> };

      expect(result.tools).toHaveLength(0);
    });
  });
});
