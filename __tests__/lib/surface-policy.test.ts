import { describe, it, expect } from "vitest";
import {
  SURFACE_POLICIES,
  getToolNamesForSurface,
} from "@/lib/surface-policy";

// MCP tools expected from AC-2 — includes read tools plus CIBA-gated write tools
const MCP_EXPECTED_TOOLS = [
  "listDeals",
  "getDealDetails",
  "searchContacts",
  "checkCalendar",
  "searchEmails",
  "listSlackChannels",
  "createCalendarEvent",
  "draftEmail",
  "sendSlackMessage",
];

// CRM write tools that must NOT appear for mcp surface (crmWrite category excluded)
const CRM_WRITE_TOOLS = [
  "createDeal",
  "updateDeal",
  "createContact",
  "logActivity",
];

describe("surface-policy", () => {
  describe("SURFACE_POLICIES registry", () => {
    it("AC-1: should export SURFACE_POLICIES as a non-null record", () => {
      expect(SURFACE_POLICIES).toBeDefined();
      expect(typeof SURFACE_POLICIES).toBe("object");
      expect(SURFACE_POLICIES).not.toBeNull();
    });

    it("AC-1: should have entries for all three surfaces", () => {
      expect(SURFACE_POLICIES).toHaveProperty("chat");
      expect(SURFACE_POLICIES).toHaveProperty("actionCenter");
      expect(SURFACE_POLICIES).toHaveProperty("mcp");
    });

    it("AC-1: mcp policy should only allow read-level categories", () => {
      const policy = SURFACE_POLICIES["mcp"];
      expect(policy.allowedCategories).toContain("crmRead");
      expect(policy.allowedCategories).toContain("calendar");
      expect(policy.allowedCategories).toContain("gmail");
      expect(policy.allowedCategories).toContain("slack");
      // crmWrite must NOT be present for mcp
      expect(policy.allowedCategories).not.toContain("crmWrite");
    });

    it("AC-1: mcp policy should include a non-empty security rationale string", () => {
      const policy = SURFACE_POLICIES["mcp"];
      expect(typeof policy.rationale).toBe("string");
      expect(policy.rationale.length).toBeGreaterThan(0);
    });

    it("AC-1: mcp policy accessLevel should be 'write' (CIBA-gated writes enabled)", () => {
      expect(SURFACE_POLICIES["mcp"].accessLevel).toBe("write");
    });
  });

  describe("getToolNamesForSurface — mcp (AC-2)", () => {
    it("AC-2: should return a non-empty array for mcp surface", () => {
      const tools = getToolNamesForSurface("mcp");
      expect(Array.isArray(tools)).toBe(true);
      expect(tools.length).toBeGreaterThan(0);
    });

    it("AC-2: should include all expected read-level tools for mcp", () => {
      const tools = getToolNamesForSurface("mcp");
      for (const name of MCP_EXPECTED_TOOLS) {
        expect(tools, `mcp should include read tool: ${name}`).toContain(name);
      }
    });

    it("AC-2: should NOT include any CRM write tools for mcp surface", () => {
      const tools = getToolNamesForSurface("mcp");
      for (const name of CRM_WRITE_TOOLS) {
        expect(tools, `mcp must not include CRM write tool: ${name}`).not.toContain(name);
      }
    });

    it("AC-2: should include CIBA-gated write tools for mcp surface", () => {
      const tools = getToolNamesForSurface("mcp");
      expect(tools).toContain("draftEmail");
      expect(tools).toContain("createCalendarEvent");
      expect(tools).toContain("sendSlackMessage");
    });

    it("AC-2: mcp tool list should match exactly the nine expected tools", () => {
      const tools = getToolNamesForSurface("mcp");
      expect(tools).toHaveLength(MCP_EXPECTED_TOOLS.length);
      expect(tools.sort()).toEqual([...MCP_EXPECTED_TOOLS].sort());
    });
  });

  describe("chat and actionCenter surface policies (AC-9)", () => {
    it("AC-9: chat policy should allow all five capability categories", () => {
      const policy = SURFACE_POLICIES["chat"];
      const expected: string[] = ["crmRead", "crmWrite", "calendar", "gmail", "slack"];
      for (const category of expected) {
        expect(
          policy.allowedCategories,
          `chat should allow category: ${category}`
        ).toContain(category);
      }
    });

    it("AC-9: chat policy should have accessLevel 'full'", () => {
      expect(SURFACE_POLICIES["chat"].accessLevel).toBe("full");
    });

    it("AC-9: actionCenter policy should allow gmail, calendar, and slack", () => {
      const policy = SURFACE_POLICIES["actionCenter"];
      expect(policy.allowedCategories).toContain("gmail");
      expect(policy.allowedCategories).toContain("calendar");
      expect(policy.allowedCategories).toContain("slack");
    });

    it("AC-9: actionCenter policy should NOT allow crmRead or crmWrite", () => {
      const policy = SURFACE_POLICIES["actionCenter"];
      expect(policy.allowedCategories).not.toContain("crmRead");
      expect(policy.allowedCategories).not.toContain("crmWrite");
    });

    it("AC-9: actionCenter policy should have a non-empty rationale string", () => {
      const policy = SURFACE_POLICIES["actionCenter"];
      expect(typeof policy.rationale).toBe("string");
      expect(policy.rationale.length).toBeGreaterThan(0);
    });

    it("AC-9: getToolNamesForSurface('chat') should include both read and write tools", () => {
      const tools = getToolNamesForSurface("chat");
      // should include read tools
      expect(tools).toContain("listDeals");
      expect(tools).toContain("checkCalendar");
      // should include write tools
      expect(tools).toContain("createDeal");
      expect(tools).toContain("draftEmail");
      expect(tools).toContain("sendSlackMessage");
    });

    it("AC-9: getToolNamesForSurface('actionCenter') should include execution tools only", () => {
      const tools = getToolNamesForSurface("actionCenter");
      // gmail, calendar, slack tools expected
      expect(tools).toContain("draftEmail");
      expect(tools).toContain("createCalendarEvent");
      expect(tools).toContain("sendSlackMessage");
      // CRM tools must NOT be present
      expect(tools).not.toContain("listDeals");
      expect(tools).not.toContain("createDeal");
    });
  });

  describe("SurfacePolicy shape invariants", () => {
    const SURFACES = ["chat", "actionCenter", "mcp"] as const;

    it("every policy should have a name matching its registry key", () => {
      for (const surface of SURFACES) {
        expect(SURFACE_POLICIES[surface].name).toBe(surface);
      }
    });

    it("every policy should have a boolean requiresApproval field", () => {
      for (const surface of SURFACES) {
        expect(typeof SURFACE_POLICIES[surface].requiresApproval).toBe("boolean");
      }
    });

    it("every policy should have a boolean requiresSession field", () => {
      for (const surface of SURFACES) {
        expect(typeof SURFACE_POLICIES[surface].requiresSession).toBe("boolean");
      }
    });

    it("every policy should have a non-empty allowedCategories array", () => {
      for (const surface of SURFACES) {
        const { allowedCategories } = SURFACE_POLICIES[surface];
        expect(Array.isArray(allowedCategories)).toBe(true);
        expect(allowedCategories.length).toBeGreaterThan(0);
      }
    });
  });
});
