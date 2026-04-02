import { describe, it, expect, vi, beforeEach } from "vitest";
import { createApprovalCheck } from "@/lib/tools/approval-logic";
import { DEFAULT_SETTINGS } from "@/lib/types/settings";

// Mock settings data layer
const mockGetUserSettings = vi.fn();
vi.mock("@/lib/data/settings", () => ({
  getUserSettings: (...args: unknown[]) => mockGetUserSettings(...args),
}));

const TEST_USER = "auth0|test123";

describe("approval-logic", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUserSettings.mockResolvedValue(DEFAULT_SETTINGS);
  });

  describe("createApprovalCheck for createDeal", () => {
    it("requires approval for deals over $50K (S1 value-based)", async () => {
      const check = createApprovalCheck(TEST_USER, "createDeal");
      const result = await check({
        name: "Big Deal",
        company: "Acme",
        value: 75000,
        stage: "proposal",
        contactId: "c1",
      });
      expect(result).toBe(true);
    });

    it("does not require approval for deals under $50K", async () => {
      const check = createApprovalCheck(TEST_USER, "createDeal");
      const result = await check({
        name: "Small Deal",
        company: "Acme",
        value: 10000,
        stage: "lead",
        contactId: "c1",
      });
      expect(result).toBe(false);
    });

    it("requires approval when user settings demand it (U2 settings-based)", async () => {
      mockGetUserSettings.mockResolvedValue({
        ...DEFAULT_SETTINGS,
        approvalRequired: { crmWrite: true },
      });

      const check = createApprovalCheck(TEST_USER, "createDeal");
      const result = await check({
        name: "Small Deal",
        company: "Acme",
        value: 5000,
        stage: "lead",
        contactId: "c1",
      });
      expect(result).toBe(true); // settings override, even for small deals
    });
  });

  describe("createApprovalCheck for updateDeal", () => {
    it("requires approval for stage change to closed-won", async () => {
      const check = createApprovalCheck(TEST_USER, "updateDeal");
      const result = await check({
        dealId: "d1",
        stage: "closed-won",
      });
      expect(result).toBe(true);
    });

    it("does not require approval for other stage changes", async () => {
      const check = createApprovalCheck(TEST_USER, "updateDeal");
      const result = await check({
        dealId: "d1",
        stage: "qualified",
      });
      expect(result).toBe(false);
    });
  });

  describe("createApprovalCheck for logActivity", () => {
    it("requires approval when user settings demand it", async () => {
      mockGetUserSettings.mockResolvedValue({
        ...DEFAULT_SETTINGS,
        approvalRequired: { crmWrite: true },
      });

      const check = createApprovalCheck(TEST_USER, "logActivity");
      const result = await check({
        dealId: "d1",
        contactId: "c1",
        type: "note",
        summary: "Test",
      });
      expect(result).toBe(true);
    });

    it("does not require approval by default", async () => {
      const check = createApprovalCheck(TEST_USER, "logActivity");
      const result = await check({
        dealId: "d1",
        contactId: "c1",
        type: "note",
        summary: "Test",
      });
      expect(result).toBe(false);
    });
  });

  describe("createApprovalCheck for read-only tools", () => {
    it("never requires approval for listDeals", async () => {
      const check = createApprovalCheck(TEST_USER, "listDeals");
      const result = await check({});
      expect(result).toBe(false);
    });

    it("never requires approval for checkCalendar", async () => {
      const check = createApprovalCheck(TEST_USER, "checkCalendar");
      const result = await check({ date: "2026-04-02" });
      expect(result).toBe(false);
    });
  });
});
