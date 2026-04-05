import { describe, it, expect } from "vitest";
import { shouldRequireCiba, shouldRequireCibaMcp } from "@/lib/ciba/should-require";

describe("shouldRequireCiba", () => {
  // AC-1: High-value createDeal triggers CIBA
  it("AC-1: returns true for createDeal with value > $50K", () => {
    expect(shouldRequireCiba("createDeal", { value: 75000 })).toBe(true);
  });

  it("AC-1: returns true for createDeal at exactly $50,001", () => {
    expect(shouldRequireCiba("createDeal", { value: 50001 })).toBe(true);
  });

  // AC-3: Low-value createDeal does NOT trigger CIBA
  it("AC-3: returns false for createDeal with value <= $50K", () => {
    expect(shouldRequireCiba("createDeal", { value: 50000 })).toBe(false);
    expect(shouldRequireCiba("createDeal", { value: 10000 })).toBe(false);
  });

  // AC-1: Terminal stage updateDeal triggers CIBA
  it("AC-1: returns true for updateDeal to closed-won", () => {
    expect(shouldRequireCiba("updateDeal", { stage: "closed-won" })).toBe(true);
  });

  it("AC-1: returns true for updateDeal to closed-lost", () => {
    expect(shouldRequireCiba("updateDeal", { stage: "closed-lost" })).toBe(true);
  });

  // AC-3: Non-terminal updateDeal does NOT trigger CIBA
  it("AC-3: returns false for updateDeal to non-terminal stage", () => {
    expect(shouldRequireCiba("updateDeal", { stage: "negotiation" })).toBe(false);
    expect(shouldRequireCiba("updateDeal", { stage: "proposal" })).toBe(false);
  });

  // AC-3: External action tools do NOT trigger CIBA (they use inline approval only)
  it("AC-3: returns false for sendSlackMessage", () => {
    expect(shouldRequireCiba("sendSlackMessage", { channel: "general", message: "hi" })).toBe(false);
  });

  it("AC-3: returns false for draftEmail", () => {
    expect(shouldRequireCiba("draftEmail", { to: "a@b.com", subject: "hi" })).toBe(false);
  });

  // AC-3: Read-only tools never trigger CIBA
  it("AC-3: returns false for checkCalendar", () => {
    expect(shouldRequireCiba("checkCalendar", { date: "2026-04-05" })).toBe(false);
  });

  it("AC-3: returns false for searchEmails", () => {
    expect(shouldRequireCiba("searchEmails", { query: "hello" })).toBe(false);
  });

  // Edge case: missing or non-numeric value
  it("returns false for createDeal with missing value", () => {
    expect(shouldRequireCiba("createDeal", {})).toBe(false);
  });

  it("returns false for createDeal with non-numeric value", () => {
    expect(shouldRequireCiba("createDeal", { value: "a lot" })).toBe(false);
  });
});

describe("shouldRequireCibaMcp", () => {
  // AC-2: CIBA gate triggers for MCP write tools

  it("AC-2: returns true for draftEmail", () => {
    // Arrange
    const toolName = "draftEmail";
    // Act
    const result = shouldRequireCibaMcp(toolName);
    // Assert
    expect(result).toBe(true);
  });

  it("AC-2: returns true for createCalendarEvent", () => {
    // Arrange
    const toolName = "createCalendarEvent";
    // Act
    const result = shouldRequireCibaMcp(toolName);
    // Assert
    expect(result).toBe(true);
  });

  it("AC-2: returns true for sendSlackMessage", () => {
    // Arrange
    const toolName = "sendSlackMessage";
    // Act
    const result = shouldRequireCibaMcp(toolName);
    // Assert
    expect(result).toBe(true);
  });

  // AC-9: Read tools skip CIBA

  it("AC-9: returns false for checkCalendar", () => {
    expect(shouldRequireCibaMcp("checkCalendar")).toBe(false);
  });

  it("AC-9: returns false for searchEmails", () => {
    expect(shouldRequireCibaMcp("searchEmails")).toBe(false);
  });

  it("AC-9: returns false for listSlackChannels", () => {
    expect(shouldRequireCibaMcp("listSlackChannels")).toBe(false);
  });

  // AC-9: CRM tools skip CIBA

  it("AC-9: returns false for listDeals", () => {
    expect(shouldRequireCibaMcp("listDeals")).toBe(false);
  });

  it("AC-9: returns false for getDealDetails", () => {
    expect(shouldRequireCibaMcp("getDealDetails")).toBe(false);
  });

  it("AC-9: returns false for searchContacts", () => {
    expect(shouldRequireCibaMcp("searchContacts")).toBe(false);
  });

  it("AC-9: returns false for createDeal", () => {
    expect(shouldRequireCibaMcp("createDeal")).toBe(false);
  });

  it("AC-9: returns false for updateDeal", () => {
    expect(shouldRequireCibaMcp("updateDeal")).toBe(false);
  });

  // Edge case: unknown tool name

  it("returns false for an unknown tool name", () => {
    expect(shouldRequireCibaMcp("unknownTool")).toBe(false);
  });
});
