import { describe, it, expect, vi } from "vitest";
import { adaptToolsForMcp } from "@/lib/mcp/tool-adapter";
import { getToolNamesForSurface } from "@/lib/surface-policy";
import { getUserSettings } from "@/lib/data/settings";
import { DEFAULT_SETTINGS } from "@/lib/types/settings";

// Mock all tool imports so tests don't need real Auth0/Redis
vi.mock("@/lib/auth0", () => ({
  auth0: { getSession: vi.fn().mockResolvedValue(null) },
}));

vi.mock("@/lib/token-exchange", () => ({
  exchangeToken: vi.fn().mockResolvedValue({ error: "mocked" }),
  exchangeTokenWithRefresh: vi.fn().mockResolvedValue({ token: "mocked-token" }),
  sanitizeApiError: vi.fn(() => "mocked error"),
  buildTokenMeta: vi.fn(() => ({})),
}));

vi.mock("@/lib/tools/scope-map", () => ({
  TOOL_SCOPE_CONFIG: {
    checkCalendar: { connection: "google-oauth2" },
    searchEmails: { connection: "google-oauth2" },
    listSlackChannels: { connection: "sign-in-with-slack" },
    draftEmail: { connection: "google-oauth2" },
    createCalendarEvent: { connection: "google-oauth2" },
    sendSlackMessage: { connection: "sign-in-with-slack" },
  },
  TOOL_SCOPES: { checkCalendar: [], searchEmails: [], listSlackChannels: [] },
  scopeProvider: () => null,
}));

vi.mock("@/lib/data/schedule-tokens", () => ({
  getScheduleRefreshToken: vi.fn().mockResolvedValue("mocked-refresh-token"),
}));

vi.mock("@/lib/data/connections", () => ({
  isConnectionDisabled: vi.fn().mockResolvedValue(false),
}));

vi.mock("@/lib/mcp/ciba-gate", () => ({
  cibaGate: vi.fn().mockResolvedValue({ approved: true }),
  buildMcpBindingMessage: vi.fn().mockReturnValue("MCP: test"),
}));

vi.mock("@/lib/ciba/should-require", () => ({
  shouldRequireCiba: vi.fn(() => false),
  shouldRequireCibaMcp: vi.fn(() => false),
}));

vi.mock("@/lib/api-utils", () => ({
  buildRawEmail: vi.fn(() => "base64-encoded-email"),
  resolveSlackChannelId: vi.fn().mockResolvedValue({ id: "C123" }),
}));

vi.mock("@/lib/redis", () => ({
  getRedis: () => ({
    get: vi.fn(),
    set: vi.fn(),
    lpush: vi.fn(),
    expire: vi.fn(),
    lrange: vi.fn().mockResolvedValue([]),
  }),
}));

vi.mock("@/lib/data/audit", () => ({
  writeAuditEntry: vi.fn(),
}));

vi.mock("@/lib/data/settings", () => ({
  getUserSettings: vi.fn().mockResolvedValue({
    capabilities: { crmRead: true, crmWrite: true, calendar: true, gmail: true, slack: true },
    approvalRequired: { crmWrite: false },
    toolTrust: {},
    schedule: { enabled: false, hours: [], timezone: "UTC" },
  }),
}));

vi.mock("@/lib/rate-limit", () => ({
  getMcpClientLimiter: vi.fn().mockReturnValue({
    limit: vi.fn().mockResolvedValue({ success: true }),
  }),
}));

vi.mock("@/lib/data/mcp-analytics", () => ({
  recordMcpCall: vi.fn().mockResolvedValue(undefined),
}));

describe("MCP tool adapter", () => {
  describe("adaptToolsForMcp", () => {
    it("AC-10: returns a registration function", () => {
      const registerFn = adaptToolsForMcp();
      expect(typeof registerFn).toBe("function");
    });

    it("AC-1: registers read, write (CIBA-gated), and CRM tools", async () => {
      const registered: string[] = [];
      const mockServer = {
        registerTool: (name: string, _config: unknown, _handler: unknown) => {
          registered.push(name);
        },
      };

      const registerFn = adaptToolsForMcp();
      await registerFn(mockServer as never);

      // Read-only Token Vault tools
      expect(registered).toContain("checkCalendar");
      expect(registered).toContain("searchEmails");
      expect(registered).toContain("listSlackChannels");

      // Write tools (CIBA-gated)
      expect(registered).toContain("draftEmail");
      expect(registered).toContain("createCalendarEvent");
      expect(registered).toContain("sendSlackMessage");

      // CRM read tools
      expect(registered).toContain("listDeals");
      expect(registered).toContain("getDealDetails");
      expect(registered).toContain("searchContacts");

      // CRM write tools should NOT be registered
      expect(registered).not.toContain("createDeal");
      expect(registered).not.toContain("updateDeal");

      // Delegation tool should NOT be registered
      expect(registered).not.toContain("delegateResearch");
    });

    it("AC-5: registered tools match surface policy for 'mcp'", async () => {
      const registered: string[] = [];
      const mockServer = {
        registerTool: (name: string, _config: unknown, _handler: unknown) => {
          registered.push(name);
        },
      };

      const registerFn = adaptToolsForMcp();
      await registerFn(mockServer as never);

      const policyTools = getToolNamesForSurface("mcp");
      expect(registered.sort()).toEqual(policyTools.sort());
    });

    it("AC-6: handler denies tool call when scope doesn't match", async () => {
      // Mock getUserSettings to return settings with calendar disabled
      // so fresh scope derivation excludes calendar:read
      vi.mocked(getUserSettings).mockResolvedValue({
        ...DEFAULT_SETTINGS,
        capabilities: { ...DEFAULT_SETTINGS.capabilities, calendar: false },
      });

      let capturedHandler: ((args: unknown, extra: unknown) => Promise<unknown>) | null = null;
      const mockServer = {
        registerTool: (name: string, _config: unknown, handler: (args: unknown, extra: unknown) => Promise<unknown>) => {
          if (name === "checkCalendar") {
            capturedHandler = handler;
          }
        },
      };

      const registerFn = adaptToolsForMcp();
      await registerFn(mockServer as never);

      expect(capturedHandler).not.toBeNull();

      // Capability toggles are enforced at Step 0 in the tool handler,
      // so even with valid scopes, a disabled category is denied
      const result = await capturedHandler!({}, {
        authInfo: {
          clientId: "user-123",
          scopes: ["crm:read", "calendar:read"],
        },
      });

      expect(result).toMatchObject({
        isError: true,
      });
      // Verify the error message mentions disabled/scope/authorization
      const text = (result as { content: Array<{ text: string }> }).content[0].text;
      expect(text).toMatch(/disabled|not authorized|scope/i);
    });

    it("AC-10: each registered tool has a description and inputSchema", async () => {
      const tools: Array<{ name: string; config: Record<string, unknown> }> = [];
      const mockServer = {
        registerTool: (name: string, config: Record<string, unknown>, _handler: unknown) => {
          tools.push({ name, config });
        },
      };

      const registerFn = adaptToolsForMcp();
      await registerFn(mockServer as never);

      for (const tool of tools) {
        expect(tool.config.description, `${tool.name} should have description`).toBeDefined();
        expect(typeof tool.config.description).toBe("string");
        expect(tool.config.inputSchema, `${tool.name} should have inputSchema`).toBeDefined();
      }
    });
  });
});
