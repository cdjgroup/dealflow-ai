import { describe, it, expect, vi, beforeEach } from "vitest";
import { adaptToolsForMcp } from "@/lib/mcp/tool-adapter";
import { getToolNamesForSurface } from "@/lib/surface-policy";

const mockCheckToolRateLimit = vi.hoisted(() => vi.fn());

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

vi.mock("@/lib/circuit-breaker", () => ({
  checkToolRateLimit: (...args: unknown[]) => mockCheckToolRateLimit(...args),
}));

describe("MCP tool adapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: rate limit allows all calls
    mockCheckToolRateLimit.mockResolvedValue({ allowed: true, toolName: "checkCalendar", tier: "read", remaining: 9 });
  });

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

      // Call with scopes that don't include calendar:read
      const result = await capturedHandler!({}, {
        authInfo: {
          clientId: "user-123",
          scopes: ["crm:read"], // no calendar:read
        },
      });

      expect(result).toMatchObject({
        isError: true,
      });
      // Verify the error message mentions scope/authorization
      const text = (result as { content: Array<{ text: string }> }).content[0].text;
      expect(text).toMatch(/not authorized|scope/i);
    });

    it("blocks tool call when per-tool rate limit is exceeded", async () => {
      mockCheckToolRateLimit.mockResolvedValue({
        allowed: false,
        toolName: "checkCalendar",
        tier: "read",
        remaining: 0,
        resetMs: 45000,
      });

      let capturedHandler: ((args: unknown, extra: unknown) => Promise<unknown>) | null = null;
      const mockServer = {
        registerTool: (name: string, _config: unknown, handler: (args: unknown, extra: unknown) => Promise<unknown>) => {
          if (name === "checkCalendar") capturedHandler = handler;
        },
      };

      const registerFn = adaptToolsForMcp();
      await registerFn(mockServer as never);

      const result = await capturedHandler!({}, {
        authInfo: {
          clientId: "user-123",
          scopes: ["calendar:read"],
          extra: {},
        },
      });

      expect(result).toMatchObject({ isError: true });
      const text = (result as { content: Array<{ text: string }> }).content[0].text;
      expect(text).toMatch(/rate limit/i);
      expect(text).toContain("checkCalendar");
      expect(mockCheckToolRateLimit).toHaveBeenCalledWith("user-123", "checkCalendar");
    });

    it("allows tool call when per-tool rate limit is not exceeded", async () => {
      mockCheckToolRateLimit.mockResolvedValue({
        allowed: true,
        toolName: "listDeals",
        tier: "crm-read",
        remaining: 19,
      });

      let capturedHandler: ((args: unknown, extra: unknown) => Promise<unknown>) | null = null;
      const mockServer = {
        registerTool: (name: string, _config: unknown, handler: (args: unknown, extra: unknown) => Promise<unknown>) => {
          if (name === "listDeals") capturedHandler = handler;
        },
      };

      const registerFn = adaptToolsForMcp();
      await registerFn(mockServer as never);

      // listDeals is a CRM tool — it will try to execute and may error on the mock,
      // but the important thing is it gets PAST the rate limit check
      const result = await capturedHandler!({}, {
        authInfo: {
          clientId: "user-123",
          scopes: ["crm:read"],
          extra: {},
        },
      });

      // Should NOT be a rate limit error (it may fail on execution, but that's fine)
      const text = (result as { content: Array<{ text: string }> }).content[0].text;
      expect(text).not.toMatch(/rate limit/i);
    });

    it("per-tool rate limit applies to Auth0 bearer token users (not just API key)", async () => {
      mockCheckToolRateLimit.mockResolvedValue({
        allowed: false,
        toolName: "searchEmails",
        tier: "read",
        remaining: 0,
        resetMs: 30000,
      });

      let capturedHandler: ((args: unknown, extra: unknown) => Promise<unknown>) | null = null;
      const mockServer = {
        registerTool: (name: string, _config: unknown, handler: (args: unknown, extra: unknown) => Promise<unknown>) => {
          if (name === "searchEmails") capturedHandler = handler;
        },
      };

      const registerFn = adaptToolsForMcp();
      await registerFn(mockServer as never);

      // Auth0 bearer token user (no mcpClientId, default scopes)
      const result = await capturedHandler!({ query: "test" }, {
        authInfo: {
          clientId: "auth0|user456",
          scopes: ["gmail:read"],
          // no extra.mcpClientId — this is the Auth0 bearer token path
        },
      });

      expect(result).toMatchObject({ isError: true });
      const text = (result as { content: Array<{ text: string }> }).content[0].text;
      expect(text).toMatch(/rate limit/i);
      expect(mockCheckToolRateLimit).toHaveBeenCalledWith("auth0|user456", "searchEmails");
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
