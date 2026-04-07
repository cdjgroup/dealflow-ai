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

    it("requires approval for stage change to closed-lost", async () => {
      const check = createApprovalCheck(TEST_USER, "updateDeal");
      const result = await check({
        dealId: "d1",
        stage: "closed-lost",
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

  describe("createApprovalCheck for external action tools (S3)", () => {
    it("requires approval for draftEmail (T1 'ask' from DEFAULT_TOOL_TRUST)", async () => {
      const check = createApprovalCheck(TEST_USER, "draftEmail");
      const result = await check({
        to: "sarah@example.com",
        subject: "Follow up",
        body: "Hello",
      });
      expect(result).toBe(true);
    });

    it("requires approval for sendSlackMessage (T1 'ask' from DEFAULT_TOOL_TRUST)", async () => {
      const check = createApprovalCheck(TEST_USER, "sendSlackMessage");
      const result = await check({
        channel: "general",
        text: "Hello team",
      });
      expect(result).toBe(true);
    });

    it("requires approval for createCalendarEvent (T1 'ask' from DEFAULT_TOOL_TRUST)", async () => {
      const check = createApprovalCheck(TEST_USER, "createCalendarEvent");
      const result = await check({
        title: "Meeting",
        date: "2026-04-10",
      });
      expect(result).toBe(true);
    });

    it("skips approval when trust is 'always'", async () => {
      mockGetUserSettings.mockResolvedValue({
        ...DEFAULT_SETTINGS,
        toolTrust: { ...DEFAULT_SETTINGS.toolTrust, draftEmail: "always" },
      });
      const check = createApprovalCheck(TEST_USER, "draftEmail");
      const result = await check({ to: "a@example.com", subject: "Hi", body: "Hello" });
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

    it("never requires approval for searchEmails", async () => {
      const check = createApprovalCheck(TEST_USER, "searchEmails");
      const result = await check({ query: "from:test@example.com" });
      expect(result).toBe(false);
    });

    it("never requires approval for listSlackChannels", async () => {
      const check = createApprovalCheck(TEST_USER, "listSlackChannels");
      const result = await check({});
      expect(result).toBe(false);
    });
  });

  // AC-5: T1 trust layer — toolTrust controls override S3/S1/U2 logic
  describe("createApprovalCheck — T1 trust layer (AC-5)", () => {
    it('T1 "always" overrides S3: draftEmail skips approval', async () => {
      mockGetUserSettings.mockResolvedValue({
        ...DEFAULT_SETTINGS,
        toolTrust: { ...DEFAULT_SETTINGS.toolTrust, draftEmail: "always" },
      });
      const check = createApprovalCheck(TEST_USER, "draftEmail");
      const result = await check({ to: "a@example.com", subject: "Hi", body: "Hello" });
      expect(result).toBe(false);
    });

    it('T1 "ask" requires approval for checkCalendar (step-up from default "always")', async () => {
      mockGetUserSettings.mockResolvedValue({
        ...DEFAULT_SETTINGS,
        toolTrust: { ...DEFAULT_SETTINGS.toolTrust, checkCalendar: "ask" },
      });
      const check = createApprovalCheck(TEST_USER, "checkCalendar");
      const result = await check({ date: "2026-04-02" });
      expect(result).toBe(true);
    });

    it('T1 "never" blocks checkCalendar', async () => {
      mockGetUserSettings.mockResolvedValue({
        ...DEFAULT_SETTINGS,
        toolTrust: { ...DEFAULT_SETTINGS.toolTrust, checkCalendar: "never" },
      });
      const check = createApprovalCheck(TEST_USER, "checkCalendar");
      const result = await check({ date: "2026-04-02" });
      expect(result).toBe(true);
    });

    it("empty toolTrust ({}) — draftEmail requires approval (S3 fallthrough)", async () => {
      mockGetUserSettings.mockResolvedValue({
        ...DEFAULT_SETTINGS,
        toolTrust: {},
      });
      const check = createApprovalCheck(TEST_USER, "draftEmail");
      const result = await check({ to: "a@example.com", subject: "Hi", body: "Hello" });
      expect(result).toBe(true);
    });

    it("empty toolTrust ({}) — checkCalendar does not require approval", async () => {
      mockGetUserSettings.mockResolvedValue({
        ...DEFAULT_SETTINGS,
        toolTrust: {},
      });
      const check = createApprovalCheck(TEST_USER, "checkCalendar");
      const result = await check({ date: "2026-04-02" });
      expect(result).toBe(false);
    });

    it("empty toolTrust ({}) — createDeal >$50K still requires approval (S1)", async () => {
      mockGetUserSettings.mockResolvedValue({
        ...DEFAULT_SETTINGS,
        toolTrust: {},
      });
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
  });
});
