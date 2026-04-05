import { describe, it, expect } from "vitest";
import { filterToolsByCapabilities } from "@/lib/tools/capability-filter";
import { DEFAULT_SETTINGS, type UserSettings } from "@/lib/types/settings";
import type { Tool } from "ai";

// Minimal mock tools — just need names to test filtering
const mockTool = { description: "test" } as unknown as Tool;

const ALL_TOOLS: Record<string, Tool> = {
  listDeals: mockTool,
  getDealDetails: mockTool,
  searchContacts: mockTool,
  createDeal: mockTool,
  updateDeal: mockTool,
  createContact: mockTool,
  logActivity: mockTool,
  checkCalendar: mockTool,
  createCalendarEvent: mockTool,
  draftEmail: mockTool,
  searchEmails: mockTool,
  listSlackChannels: mockTool,
  sendSlackMessage: mockTool,
};

describe("filterToolsByCapabilities", () => {
  it("returns all tools when all capabilities enabled", () => {
    const settings: UserSettings = {
      ...DEFAULT_SETTINGS,
      capabilities: {
        crmRead: true,
        crmWrite: true,
        calendar: true,
        gmail: true,
        slack: true,
      },
    };
    const result = filterToolsByCapabilities(ALL_TOOLS, settings);
    expect(Object.keys(result)).toHaveLength(13);
  });

  it("removes Gmail tools when gmail disabled", () => {
    const settings: UserSettings = {
      ...DEFAULT_SETTINGS,
      capabilities: { ...DEFAULT_SETTINGS.capabilities, gmail: false },
    };
    const result = filterToolsByCapabilities(ALL_TOOLS, settings);
    expect(result).not.toHaveProperty("draftEmail");
    expect(result).not.toHaveProperty("searchEmails");
    expect(result).toHaveProperty("checkCalendar");
  });

  it("removes calendar tools when calendar disabled", () => {
    const settings: UserSettings = {
      ...DEFAULT_SETTINGS,
      capabilities: { ...DEFAULT_SETTINGS.capabilities, calendar: false },
    };
    const result = filterToolsByCapabilities(ALL_TOOLS, settings);
    expect(result).not.toHaveProperty("checkCalendar");
    expect(result).not.toHaveProperty("createCalendarEvent");
    expect(result).toHaveProperty("draftEmail");
  });

  it("removes only CRM write tools when crmWrite disabled", () => {
    const settings: UserSettings = {
      ...DEFAULT_SETTINGS,
      capabilities: { ...DEFAULT_SETTINGS.capabilities, crmWrite: false },
    };
    const result = filterToolsByCapabilities(ALL_TOOLS, settings);
    // Read tools stay
    expect(result).toHaveProperty("listDeals");
    expect(result).toHaveProperty("getDealDetails");
    expect(result).toHaveProperty("searchContacts");
    // Write tools removed
    expect(result).not.toHaveProperty("createDeal");
    expect(result).not.toHaveProperty("updateDeal");
    expect(result).not.toHaveProperty("createContact");
    expect(result).not.toHaveProperty("logActivity");
  });

  it("removes Slack tools when slack disabled", () => {
    const result = filterToolsByCapabilities(ALL_TOOLS, DEFAULT_SETTINGS);
    // Slack is false by default
    expect(result).not.toHaveProperty("listSlackChannels");
    expect(result).not.toHaveProperty("sendSlackMessage");
  });

  it("removes all CRM tools when both crmRead and crmWrite disabled", () => {
    const settings: UserSettings = {
      ...DEFAULT_SETTINGS,
      capabilities: {
        ...DEFAULT_SETTINGS.capabilities,
        crmRead: false,
        crmWrite: false,
      },
    };
    const result = filterToolsByCapabilities(ALL_TOOLS, settings);
    expect(result).not.toHaveProperty("listDeals");
    expect(result).not.toHaveProperty("createDeal");
    expect(result).toHaveProperty("checkCalendar");
  });
});
