import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies
const mockGetUsersForScheduleHour = vi.fn();
const mockGetUserSettings = vi.fn();
const mockGetActions = vi.fn();
const mockBatchUpdateStatus = vi.fn();
const mockInitiateCiba = vi.fn();
const mockStoreScheduledCibaSession = vi.fn();
const mockGetScheduledCibaSession = vi.fn();

vi.mock("@/lib/data/settings", () => ({
  getUsersForScheduleHour: (...args: unknown[]) =>
    mockGetUsersForScheduleHour(...args),
  getUserSettings: (...args: unknown[]) => mockGetUserSettings(...args),
}));
vi.mock("@/lib/data/actions", () => ({
  getActions: (...args: unknown[]) => mockGetActions(...args),
  batchUpdateStatus: (...args: unknown[]) => mockBatchUpdateStatus(...args),
}));
vi.mock("@/lib/ciba/authorize", () => ({
  initiateCiba: (...args: unknown[]) => mockInitiateCiba(...args),
}));
vi.mock("@/lib/data/scheduled-ciba", () => ({
  storeScheduledCibaSession: (...args: unknown[]) =>
    mockStoreScheduledCibaSession(...args),
  getScheduledCibaSession: (...args: unknown[]) =>
    mockGetScheduledCibaSession(...args),
}));
vi.mock("@/lib/cron-auth", () => ({
  verifyCronSecret: (req: Request) =>
    req.headers.get("authorization") === `Bearer ${process.env.CRON_SECRET}`,
}));

const { GET } = await import(
  "@/app/api/cron/schedule-initiate/route"
);

function makeRequest(cronSecret?: string): Request {
  const headers: Record<string, string> = {};
  if (cronSecret) headers["authorization"] = `Bearer ${cronSecret}`;
  return new Request("https://app.com/api/cron/schedule-initiate", { headers });
}

describe("GET /api/cron/schedule-initiate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = "test-cron-secret";
  });

  it("AC-9: returns 401 without valid CRON_SECRET", async () => {
    const res = await GET(makeRequest("wrong-secret"));
    expect(res.status).toBe(401);
  });

  it("AC-9: returns 401 with no auth header", async () => {
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it("AC-4: skips users with no pending actions", async () => {
    mockGetUsersForScheduleHour.mockResolvedValue(["auth0|user1"]);
    mockGetUserSettings.mockResolvedValue({
      schedule: { enabled: true, hours: [8], timezone: "UTC" },
    });
    mockGetActions.mockResolvedValue([]);

    // Mock Date to be 08:00 UTC
    vi.setSystemTime(new Date("2026-04-04T08:00:00Z"));

    const res = await GET(makeRequest("test-cron-secret"));
    const body = await res.json();

    expect(body.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ userId: "auth0|user1", status: "skipped-no-actions" }),
      ])
    );
    expect(mockInitiateCiba).not.toHaveBeenCalled();

    vi.useRealTimers();
  });

  it("AC-3: initiates CIBA for user at matching hour", async () => {
    vi.setSystemTime(new Date("2026-04-04T12:00:00Z")); // 12 UTC = 8 AM ET

    mockGetUsersForScheduleHour.mockResolvedValue(["auth0|user1"]);
    mockGetUserSettings.mockResolvedValue({
      schedule: { enabled: true, hours: [8], timezone: "America/New_York" },
    });
    mockGetActions.mockResolvedValue([
      { id: "act1", status: "pending" },
      { id: "act2", status: "pending" },
    ]);
    mockGetScheduledCibaSession.mockResolvedValue(null);
    mockInitiateCiba.mockResolvedValue({
      authReqId: "ciba-123",
      expiresIn: 300,
      interval: 5,
      bindingMessage: "Execute 2 pending actions?",
    });
    mockStoreScheduledCibaSession.mockResolvedValue(undefined);
    mockBatchUpdateStatus.mockResolvedValue([]);

    const res = await GET(makeRequest("test-cron-secret"));
    const body = await res.json();

    expect(mockInitiateCiba).toHaveBeenCalledWith(
      "auth0|user1",
      expect.stringContaining("2 pending actions")
    );
    expect(mockStoreScheduledCibaSession).toHaveBeenCalled();
    expect(mockBatchUpdateStatus).toHaveBeenCalledWith(
      "auth0|user1",
      ["act1", "act2"],
      "ciba-pending"
    );
    expect(body.results[0].status).toBe("initiated");
    expect(body.results[0].actionCount).toBe(2);

    vi.useRealTimers();
  });

  it("AC-3: skips user when timezone doesn't match", async () => {
    vi.setSystemTime(new Date("2026-04-04T12:00:00Z")); // 12 UTC = 1 PM London

    mockGetUsersForScheduleHour.mockResolvedValue(["auth0|london-user"]);
    mockGetUserSettings.mockResolvedValue({
      schedule: { enabled: true, hours: [8], timezone: "Europe/London" },
    });

    const res = await GET(makeRequest("test-cron-secret"));
    const body = await res.json();

    // London is BST (UTC+1) in April, so 12 UTC = 1 PM London, not 8 AM
    expect(mockInitiateCiba).not.toHaveBeenCalled();
    expect(body.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ status: "skipped-wrong-hour" }),
      ])
    );

    vi.useRealTimers();
  });

  it("AC-13: skips user who already has pending CIBA session", async () => {
    vi.setSystemTime(new Date("2026-04-04T08:00:00Z"));

    mockGetUsersForScheduleHour.mockResolvedValue(["auth0|user1"]);
    mockGetUserSettings.mockResolvedValue({
      schedule: { enabled: true, hours: [8], timezone: "UTC" },
    });
    mockGetActions.mockResolvedValue([{ id: "act1", status: "pending" }]);
    mockGetScheduledCibaSession.mockResolvedValue({
      batchId: "existing",
      userId: "auth0|user1",
      authReqId: "old-ciba",
      actionIds: ["act1"],
    });

    const res = await GET(makeRequest("test-cron-secret"));
    const body = await res.json();

    expect(mockInitiateCiba).not.toHaveBeenCalled();
    expect(body.results[0].status).toBe("skipped-existing-session");

    vi.useRealTimers();
  });
});
