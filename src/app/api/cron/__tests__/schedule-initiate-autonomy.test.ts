import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// --- Mocks ---
const mockGetUsersForScheduleHour = vi.fn();
const mockGetUserSettings = vi.fn();
const mockGetActions = vi.fn();
const mockBatchUpdateStatus = vi.fn();
const mockInitiateCiba = vi.fn();
const mockStoreScheduledCibaSession = vi.fn();
const mockGetScheduledCibaSession = vi.fn();
const mockVerifyCronSecret = vi.fn();
const mockGetDeal = vi.fn();
const mockGetScheduleRefreshToken = vi.fn();
const mockExchangeTokenWithRefresh = vi.fn();
const mockExecuteActionWithToken = vi.fn();
const mockWriteAuditEntry = vi.fn();
const mockGetRedis = vi.fn();

vi.mock("@/lib/data/settings", () => ({
  getUsersForScheduleHour: (...args: unknown[]) => mockGetUsersForScheduleHour(...args),
  getUserSettings: (...args: unknown[]) => mockGetUserSettings(...args),
}));

vi.mock("@/lib/data/actions", () => ({
  getActions: (...args: unknown[]) => mockGetActions(...args),
  batchUpdateStatus: (...args: unknown[]) => mockBatchUpdateStatus(...args),
  getAction: vi.fn(),
  updateAction: vi.fn().mockResolvedValue({}),
}));

vi.mock("@/lib/ciba/authorize", () => ({
  initiateCiba: (...args: unknown[]) => mockInitiateCiba(...args),
}));

vi.mock("@/lib/data/scheduled-ciba", () => ({
  storeScheduledCibaSession: (...args: unknown[]) => mockStoreScheduledCibaSession(...args),
  getScheduledCibaSession: (...args: unknown[]) => mockGetScheduledCibaSession(...args),
}));

vi.mock("@/lib/cron-auth", () => ({
  verifyCronSecret: (...args: unknown[]) => mockVerifyCronSecret(...args),
}));

vi.mock("@/lib/data/crm", () => ({
  getDeal: (...args: unknown[]) => mockGetDeal(...args),
}));

vi.mock("@/lib/data/connections", () => ({
  isConnectionDisabled: vi.fn().mockResolvedValue(false),
}));

vi.mock("@/lib/data/schedule-tokens", () => ({
  getScheduleRefreshToken: (...args: unknown[]) => mockGetScheduleRefreshToken(...args),
}));

vi.mock("@/lib/token-exchange", () => ({
  exchangeTokenWithRefresh: (...args: unknown[]) => mockExchangeTokenWithRefresh(...args),
}));

vi.mock("@/lib/actions/executor", () => ({
  executeActionWithToken: (...args: unknown[]) => mockExecuteActionWithToken(...args),
}));

vi.mock("@/lib/data/audit", () => ({
  writeAuditEntry: (...args: unknown[]) => mockWriteAuditEntry(...args),
}));

vi.mock("@/lib/redis", () => ({
  getRedis: () => ({
    set: vi.fn().mockResolvedValue("OK"),
  }),
}));

const { GET } = await import("@/app/api/cron/schedule-initiate/route");

// --- Helpers ---
function makeRequest() {
  return new Request("http://localhost/api/cron/schedule-initiate", {
    method: "GET",
    headers: { Authorization: "Bearer test-secret" },
  });
}

const baseSettings = {
  capabilities: { crmRead: true, crmWrite: true, calendar: true, gmail: true, slack: false },
  approvalRequired: { crmWrite: false },
  toolTrust: {},
  schedule: { enabled: true, hours: [8], timezone: "America/New_York" },
  autonomyLevel: 1 as 1 | 2 | 3,
};

const makeAction = (id: string, priority: "high" | "medium" | "low", status: "pending" | "approved", dealId = "deal-1") => ({
  id, userId: "user-1", type: "email" as const, status, priority,
  dealId, dealName: "Test Deal", contactName: "Alice",
  justification: "Test", draft: { to: "a@b.com", subject: "Hi", body: "Hello" },
  createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
});

describe("schedule-initiate autonomy branching", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Fix time to 12:00 UTC = 8:00 AM Eastern (America/New_York)
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-05T12:00:00Z"));

    mockVerifyCronSecret.mockReturnValue(true);
    mockGetScheduledCibaSession.mockResolvedValue(null);
    mockBatchUpdateStatus.mockResolvedValue([]);
    mockStoreScheduledCibaSession.mockResolvedValue(undefined);
    mockInitiateCiba.mockResolvedValue({
      authReqId: "ciba-req-1",
      expiresIn: 300,
      interval: 5,
      bindingMessage: "test",
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("AC-3: level 2 still initiates CIBA for approved actions", async () => {
    // Arrange — level 2 actions are "approved" (auto-approved at creation)
    mockGetUsersForScheduleHour.mockResolvedValue(["user-1"]);
    mockGetUserSettings.mockResolvedValue({ ...baseSettings, autonomyLevel: 2 });
    // Level 2 actions are already "approved" from creation gate
    mockGetActions.mockResolvedValue([
      makeAction("a1", "high", "approved"),
      makeAction("a2", "medium", "approved"),
    ]);

    // Act
    const res = await GET(makeRequest());
    const data = await res.json();

    // Assert — fetches "approved" actions (level 2 auto-approved at creation)
    expect(mockGetActions).toHaveBeenCalledWith("user-1", { status: "approved" });
    // CIBA should still be initiated (level 2 requires device consent)
    expect(mockInitiateCiba).toHaveBeenCalledOnce();
    const result = data.results.find((r: { userId: string }) => r.userId === "user-1");
    expect(result.status).toBe("initiated");
  });

  it("AC-4: level 3 directly executes routine actions (<$50K) without CIBA", async () => {
    // Arrange — level 3, actions linked to deals under $50K
    mockGetUsersForScheduleHour.mockResolvedValue(["user-1"]);
    mockGetUserSettings.mockResolvedValue({ ...baseSettings, autonomyLevel: 3 });
    mockGetActions.mockResolvedValue([
      makeAction("a1", "high", "approved", "deal-small"),
      makeAction("a2", "medium", "approved", "deal-small"),
    ]);
    mockGetDeal.mockResolvedValue({ id: "deal-small", value: 25000 });
    mockGetScheduleRefreshToken.mockResolvedValue("refresh-token-123");
    mockExchangeTokenWithRefresh.mockResolvedValue({ token: "access-token-123" });
    mockExecuteActionWithToken.mockResolvedValue({ success: true, message: "sent" });
    mockWriteAuditEntry.mockResolvedValue(undefined);

    // Act
    const res = await GET(makeRequest());
    const data = await res.json();

    // Assert — NO CIBA initiated, actions executed directly
    expect(mockInitiateCiba).not.toHaveBeenCalled();
    const result = data.results.find((r: { userId: string }) => r.userId === "user-1");
    expect(result.status).toBe("auto-executed");
  });

  it("AC-5: level 3 initiates CIBA for high-value actions (>$50K)", async () => {
    // Arrange — level 3, action linked to >$50K deal
    mockGetUsersForScheduleHour.mockResolvedValue(["user-1"]);
    mockGetUserSettings.mockResolvedValue({ ...baseSettings, autonomyLevel: 3 });
    mockGetActions.mockResolvedValue([
      makeAction("a1", "high", "approved", "deal-big"),
    ]);
    mockGetDeal.mockResolvedValue({ id: "deal-big", value: 80000 });

    // Act
    const res = await GET(makeRequest());
    const data = await res.json();

    // Assert — CIBA initiated for this high-value action
    expect(mockInitiateCiba).toHaveBeenCalledOnce();
  });

  it("AC-4+AC-5: level 3 partitions actions — routine auto-executes, high-value gets CIBA", async () => {
    // Arrange — mix of routine and high-value actions
    mockGetUsersForScheduleHour.mockResolvedValue(["user-1"]);
    mockGetUserSettings.mockResolvedValue({ ...baseSettings, autonomyLevel: 3 });
    mockGetActions.mockResolvedValue([
      makeAction("a1", "high", "approved", "deal-small"),
      makeAction("a2", "medium", "approved", "deal-big"),
    ]);
    mockGetDeal.mockImplementation((_uid: string, dealId: string) => {
      if (dealId === "deal-small") return Promise.resolve({ id: "deal-small", value: 10000 });
      if (dealId === "deal-big") return Promise.resolve({ id: "deal-big", value: 75000 });
      return Promise.resolve(null);
    });
    mockGetScheduleRefreshToken.mockResolvedValue("refresh-token-123");
    mockExchangeTokenWithRefresh.mockResolvedValue({ token: "access-token-123" });
    mockExecuteActionWithToken.mockResolvedValue({ success: true, message: "sent" });
    mockWriteAuditEntry.mockResolvedValue(undefined);

    // Act
    const res = await GET(makeRequest());
    const data = await res.json();

    // Assert — routine action auto-executed, high-value gets CIBA
    expect(mockExecuteActionWithToken).toHaveBeenCalledOnce(); // only the routine one
    expect(mockInitiateCiba).toHaveBeenCalledOnce(); // only the high-value one
  });

  it("AC-1: level 1 behavior unchanged — fetches pending actions and initiates CIBA", async () => {
    // Arrange
    mockGetUsersForScheduleHour.mockResolvedValue(["user-1"]);
    mockGetUserSettings.mockResolvedValue({ ...baseSettings, autonomyLevel: 1 });
    mockGetActions.mockResolvedValue([
      makeAction("a1", "high", "pending"),
    ]);

    // Act
    const res = await GET(makeRequest());
    const data = await res.json();

    // Assert — standard CIBA flow
    expect(mockInitiateCiba).toHaveBeenCalledOnce();
    expect(mockGetActions).toHaveBeenCalledWith("user-1", { status: "pending" });
  });

  it("AC-4 (confidence): low-confidence actions excluded from batch execution", async () => {
    // Arrange — two actions: one high confidence, one below requireReview threshold
    mockGetUsersForScheduleHour.mockResolvedValue(["user-1"]);
    mockGetUserSettings.mockResolvedValue({
      ...baseSettings,
      autonomyLevel: 1,
      confidenceThresholds: { autoApprove: 0.85, requireReview: 0.5 },
    });
    const highConfAction = { ...makeAction("a1", "high", "pending"), confidence: 0.92 };
    const lowConfAction = { ...makeAction("a2", "high", "pending"), confidence: 0.35 };
    mockGetActions.mockResolvedValue([highConfAction, lowConfAction]);

    // Act
    const res = await GET(makeRequest());
    const data = await res.json();

    // Assert — only the high-confidence action triggers CIBA
    expect(mockInitiateCiba).toHaveBeenCalledOnce();
    // The batch should include only 1 action (a1), not the low-confidence a2
    expect(mockBatchUpdateStatus).toHaveBeenCalledWith(
      "user-1",
      ["a1"],
      "ciba-pending"
    );
  });

  it("AC-4 (confidence): actions without confidence are not filtered out", async () => {
    // Arrange — actions without confidence (heuristic fallback) should pass through
    mockGetUsersForScheduleHour.mockResolvedValue(["user-1"]);
    mockGetUserSettings.mockResolvedValue({
      ...baseSettings,
      autonomyLevel: 1,
      confidenceThresholds: { autoApprove: 0.85, requireReview: 0.5 },
    });
    const noConfAction = makeAction("a1", "high", "pending"); // no confidence field
    mockGetActions.mockResolvedValue([noConfAction]);

    // Act
    const res = await GET(makeRequest());
    const data = await res.json();

    // Assert — action without confidence is eligible
    expect(mockInitiateCiba).toHaveBeenCalledOnce();
    expect(mockBatchUpdateStatus).toHaveBeenCalledWith(
      "user-1",
      ["a1"],
      "ciba-pending"
    );
  });
});
