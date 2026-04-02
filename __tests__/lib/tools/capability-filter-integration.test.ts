import { describe, it, expect } from "vitest";
import { filterToolsByCapabilities } from "@/lib/tools/capability-filter";
import { DEFAULT_SETTINGS, type UserSettings } from "@/lib/types/settings";
import { createApprovalCheck } from "@/lib/tools/approval-logic";
import { TOOL_SCOPES, scopeProvider } from "@/lib/tools/scope-map";

/**
 * Integration tests verifying that capability filter, approval logic,
 * and scope map work together correctly for multi-turn tool chaining
 * scenarios and progressive consent patterns.
 */

describe("multi-turn tool chaining (AC-13)", () => {
  it("allows a calendar → email chain when both are enabled", () => {
    const tools = {
      checkCalendar: {} as any,
      draftEmail: {} as any,
      searchContacts: {} as any,
    };
    const settings: UserSettings = {
      ...DEFAULT_SETTINGS,
      capabilities: { ...DEFAULT_SETTINGS.capabilities },
    };
    const filtered = filterToolsByCapabilities(tools, settings);
    expect(Object.keys(filtered)).toContain("checkCalendar");
    expect(Object.keys(filtered)).toContain("draftEmail");
    expect(Object.keys(filtered)).toContain("searchContacts");
  });

  it("breaks the chain when gmail is disabled mid-flow", () => {
    const tools = {
      checkCalendar: {} as any,
      draftEmail: {} as any,
      searchContacts: {} as any,
    };
    const settings: UserSettings = {
      ...DEFAULT_SETTINGS,
      capabilities: { ...DEFAULT_SETTINGS.capabilities, gmail: false },
    };
    const filtered = filterToolsByCapabilities(tools, settings);
    expect(Object.keys(filtered)).toContain("checkCalendar");
    expect(Object.keys(filtered)).not.toContain("draftEmail");
  });

  it("allows deal → slack chain for team updates", () => {
    const tools = {
      getDealDetails: {} as any,
      sendSlackMessage: {} as any,
    };
    const settings: UserSettings = {
      ...DEFAULT_SETTINGS,
      capabilities: { ...DEFAULT_SETTINGS.capabilities, slack: true },
    };
    const filtered = filterToolsByCapabilities(tools, settings);
    expect(Object.keys(filtered)).toHaveLength(2);
  });
});

describe("progressive consent scope mapping (AC-3)", () => {
  it("calendar and gmail have separate scope sets", () => {
    const calScopes = TOOL_SCOPES.checkCalendar;
    const gmailReadScopes = TOOL_SCOPES.searchEmails;
    const gmailWriteScopes = TOOL_SCOPES.draftEmail;

    // Calendar only needs calendar scopes
    expect(calScopes).toEqual(["calendar.readonly"]);
    // Search only needs read
    expect(gmailReadScopes).toEqual(["gmail.readonly"]);
    // Draft needs both
    expect(gmailWriteScopes).toEqual(["gmail.compose", "gmail.readonly"]);

    // No overlap between calendar and gmail
    const calSet = new Set(calScopes);
    const gmailSet = new Set([...gmailReadScopes, ...gmailWriteScopes]);
    const intersection = [...calSet].filter((s) => gmailSet.has(s));
    expect(intersection).toHaveLength(0);
  });

  it("scope provider correctly identifies Google vs Slack", () => {
    expect(scopeProvider(["calendar.readonly"])).toBe("Google");
    expect(scopeProvider(["gmail.compose"])).toBe("Google");
    expect(scopeProvider(["channels:read"])).toBe("Slack");
    expect(scopeProvider(["chat:write"])).toBe("Slack");
    expect(scopeProvider([])).toBeNull();
  });

  it("CRM tools have no external scopes", () => {
    const crmTools = [
      "listDeals",
      "getDealDetails",
      "searchContacts",
      "createDeal",
      "updateDeal",
      "createContact",
      "logActivity",
    ];
    for (const tool of crmTools) {
      expect(TOOL_SCOPES[tool]).toEqual([]);
    }
  });
});

describe("approval + capability filter interaction", () => {
  it("disabled tools never reach approval check", () => {
    const tools = { createDeal: {} as any };
    const settings: UserSettings = {
      ...DEFAULT_SETTINGS,
      capabilities: { ...DEFAULT_SETTINGS.capabilities, crmWrite: false },
    };
    const filtered = filterToolsByCapabilities(tools, settings);
    // createDeal is filtered out — approval check is irrelevant
    expect(Object.keys(filtered)).not.toContain("createDeal");
  });
});
