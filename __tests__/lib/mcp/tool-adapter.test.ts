import { describe, it, expect } from "vitest";
import { adaptToolsForMcp } from "@/lib/mcp/tool-adapter";

describe("MCP tool adapter", () => {
  describe("adaptToolsForMcp", () => {
    it("AC-10: returns a registration function that can be called with an MCP server", () => {
      const registerFn = adaptToolsForMcp("test-user");
      expect(typeof registerFn).toBe("function");
    });

    it("AC-10: registration function accepts a server-like object with registerTool", async () => {
      const registered: string[] = [];
      const mockServer = {
        registerTool: (name: string, _config: unknown, _handler: unknown) => {
          registered.push(name);
        },
      };

      const registerFn = adaptToolsForMcp("test-user");
      await registerFn(mockServer as never);

      // Should register the 5 Token Vault tools + 7 CRM tools = 12 total
      expect(registered.length).toBeGreaterThanOrEqual(5);
      expect(registered).toContain("checkCalendar");
      expect(registered).toContain("draftEmail");
      expect(registered).toContain("searchEmails");
      expect(registered).toContain("listSlackChannels");
      expect(registered).toContain("sendSlackMessage");
    });

    it("AC-10: each registered tool has a description and inputSchema", async () => {
      const tools: Array<{ name: string; config: Record<string, unknown> }> = [];
      const mockServer = {
        registerTool: (name: string, config: Record<string, unknown>, _handler: unknown) => {
          tools.push({ name, config });
        },
      };

      const registerFn = adaptToolsForMcp("test-user");
      await registerFn(mockServer as never);

      for (const tool of tools) {
        expect(tool.config.description, `${tool.name} should have description`).toBeDefined();
        expect(typeof tool.config.description).toBe("string");
        expect(tool.config.inputSchema, `${tool.name} should have inputSchema`).toBeDefined();
      }
    });
  });
});
