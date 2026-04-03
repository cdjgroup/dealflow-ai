import { describe, it, expect, vi } from "vitest";
import { adaptToolsForMcp } from "@/lib/mcp/tool-adapter";

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
