import { describe, it, expect } from "vitest";
import {
  categoryToScope,
  scopeToCategory,
  getReadToolNamesForScopes,
  deriveMcpScopes,
  SURFACE_POLICIES,
} from "@/lib/surface-policy";
import type { UserSettings } from "@/lib/types/settings";
import { DEFAULT_SETTINGS } from "@/lib/types/settings";

// DEFAULT_SETTINGS has slack: false. Tests that need all scopes use this.
const ALL_ENABLED: UserSettings = {
  ...DEFAULT_SETTINGS,
  capabilities: { ...DEFAULT_SETTINGS.capabilities, slack: true },
};

describe("surface-policy scopes", () => {
  describe("categoryToScope / scopeToCategory", () => {
    it("should map crmRead to 'crm:read'", () => {
      expect(categoryToScope("crmRead")).toBe("crm:read");
    });

    it("should map calendar to 'calendar:read'", () => {
      expect(categoryToScope("calendar")).toBe("calendar:read");
    });

    it("should reverse-map 'crm:read' to crmRead", () => {
      expect(scopeToCategory("crm:read")).toBe("crmRead");
    });

    it("should return undefined for unknown scope", () => {
      expect(scopeToCategory("unknown:scope")).toBeUndefined();
    });
  });

  describe("getReadToolNamesForScopes (AC-3)", () => {
    it("AC-3: scopes ['crm:read'] should return only CRM read tools", () => {
      const tools = getReadToolNamesForScopes(["crm:read"]);
      expect(tools).toContain("listDeals");
      expect(tools).toContain("getDealDetails");
      expect(tools).toContain("searchContacts");
      // calendar/gmail/slack excluded
      expect(tools).not.toContain("checkCalendar");
      expect(tools).not.toContain("searchEmails");
      expect(tools).not.toContain("listSlackChannels");
    });

    it("AC-3: scopes ['crm:read', 'calendar:read'] should return CRM + calendar read tools", () => {
      const tools = getReadToolNamesForScopes(["crm:read", "calendar:read"]);
      expect(tools).toContain("listDeals");
      expect(tools).toContain("checkCalendar");
      expect(tools).not.toContain("createCalendarEvent"); // write tool
      expect(tools).not.toContain("searchEmails");
    });

    it("AC-3: empty scopes should return no tools", () => {
      const tools = getReadToolNamesForScopes([]);
      expect(tools).toHaveLength(0);
    });
  });

  describe("deriveMcpScopes (AC-4, AC-7, AC-8)", () => {
    it("AC-7: all-enabled settings should derive all MCP policy scopes", () => {
      const scopes = deriveMcpScopes(ALL_ENABLED);
      expect(scopes).toContain("crm:read");
      expect(scopes).toContain("calendar:read");
      expect(scopes).toContain("gmail:read");
      expect(scopes).toContain("slack:read");
      expect(scopes).not.toContain("crm:write");
    });

    it("AC-7: default settings (slack disabled) should exclude slack:read", () => {
      const scopes = deriveMcpScopes(DEFAULT_SETTINGS);
      expect(scopes).toContain("crm:read");
      expect(scopes).not.toContain("slack:read"); // slack is false in DEFAULT_SETTINGS
      expect(scopes).not.toContain("tools"); // old hardcoded value
    });

    it("AC-8: no mcpClients means default MCP policy applies", () => {
      const settings: UserSettings = { ...ALL_ENABLED, mcpClients: undefined };
      const scopes = deriveMcpScopes(settings, "any-client");
      // Should match default MCP scopes
      const defaultScopes = SURFACE_POLICIES.mcp.allowedCategories.map(
        (c) => categoryToScope(c)
      );
      expect(scopes.sort()).toEqual(defaultScopes.sort());
    });

    it("AC-4: per-client policy should override default MCP categories", () => {
      const settings: UserSettings = {
        ...DEFAULT_SETTINGS,
        mcpClients: {
          "client-123": {
            allowedCategories: ["crmRead", "calendar"],
            label: "Cursor",
          },
        },
      };
      const scopes = deriveMcpScopes(settings, "client-123");
      expect(scopes).toContain("crm:read");
      expect(scopes).toContain("calendar:read");
      // gmail and slack excluded for this client
      expect(scopes).not.toContain("gmail:read");
      expect(scopes).not.toContain("slack:read");
    });

    it("AC-4: per-client categories must be subset of MCP policy", () => {
      // Even if client specifies crmWrite, MCP policy doesn't allow it
      const settings: UserSettings = {
        ...DEFAULT_SETTINGS,
        mcpClients: {
          "client-x": {
            allowedCategories: ["crmRead", "crmWrite"],
            label: "Rogue Client",
          },
        },
      };
      const scopes = deriveMcpScopes(settings, "client-x");
      expect(scopes).toContain("crm:read");
      // crmWrite is NOT in MCP policy, so it should be excluded
      expect(scopes).not.toContain("crm:write");
    });

    it("AC-7: respects user capability toggles — disabled categories excluded from scopes", () => {
      const settings: UserSettings = {
        ...DEFAULT_SETTINGS,
        capabilities: { ...DEFAULT_SETTINGS.capabilities, calendar: false },
      };
      const scopes = deriveMcpScopes(settings);
      expect(scopes).toContain("crm:read");
      expect(scopes).toContain("gmail:read");
      // calendar disabled → excluded from MCP scopes
      expect(scopes).not.toContain("calendar:read");
    });

    it("AC-8: unknown clientId falls back to default MCP policy", () => {
      const settings: UserSettings = {
        ...ALL_ENABLED,
        mcpClients: {
          "known-client": { allowedCategories: ["crmRead"], label: "Known" },
        },
      };
      const scopes = deriveMcpScopes(settings, "unknown-client");
      // Should get full default MCP scopes, not the known-client's restricted set
      expect(scopes).toContain("crm:read");
      expect(scopes).toContain("calendar:read");
      expect(scopes).toContain("gmail:read");
      expect(scopes).toContain("slack:read");
    });
  });
});
