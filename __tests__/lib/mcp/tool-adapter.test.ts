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
  sanitizeApiError: vi.fn(() => "mocked error"),
  buildTokenMeta: vi.fn(() => ({})),
}));

vi.mock("@/lib/tools/scope-map", () => ({
  TOOL_SCOPE_CONFIG: {},
  TOOL_SCOPES: { checkCalendar: [], searchEmails: [], listSlackChannels: [] },
  scopeProvider: () => null,
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
  getUserSettings: vi.fn(),
}));

vi.mock("@/lib/rate-limit", () => ({
  getMcpClientLimiter: vi.fn(),
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

    it("AC-10: registers only read-only tools (excludes approval-required)", async () => {
      const registered: string[] = [];
      const mockServer = {
        registerTool: (name: string, _config: unknown, _handler: unknown) => {
          registered.push(name);
        },
      };

      const registerFn = adaptToolsForMcp();
      await registerFn(mockServer as never);

      // Read-only Token Vault tools should be registered
      expect(registered).toContain("checkCalendar");
      expect(registered).toContain("searchEmails");
      expect(registered).toContain("listSlackChannels");

      // Approval-required tools should NOT be registered
      expect(registered).not.toContain("draftEmail");
      expect(registered).not.toContain("sendSlackMessage");
      expect(registered).not.toContain("delegateResearch");

      // CRM write tools should NOT be registered
      expect(registered).not.toContain("createDeal");
      expect(registered).not.toContain("updateDeal");
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

      // Scopes are now re-derived at execution time from fresh user settings,
      // so the authInfo.scopes value doesn't matter — capability toggles do
      const result = await capturedHandler!({}, {
        authInfo: {
          clientId: "user-123",
          scopes: ["crm:read"],
        },
      });

      expect(result).toMatchObject({
        isError: true,
      });
      // Verify the error message mentions scope/authorization
      const text = (result as { content: Array<{ text: string }> }).content[0].text;
      expect(text).toMatch(/not authorized|scope/i);
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
