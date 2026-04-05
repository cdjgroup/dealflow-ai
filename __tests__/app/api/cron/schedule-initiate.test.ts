import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies
const mockGetUsersForScheduleHour = vi.fn();
const mockGetUserSettings = vi.fn();
const mockGetActions = vi.fn();
const mockUpdateAction = vi.fn();
const mockInitiateCiba = vi.fn();
const mockStoreScheduledCibaSession = vi.fn();

vi.mock("@/lib/data/settings", () => ({
  getUsersForScheduleHour: (...args: unknown[]) =>
    mockGetUsersForScheduleHour(...args),
  getUserSettings: (...args: unknown[]) => mockGetUserSettings(...args),
}));
vi.mock("@/lib/data/actions", () => ({
  getActions: (...args: unknown[]) => mockGetActions(...args),
  updateAction: (...args: unknown[]) => mockUpdateAction(...args),
}));
vi.mock("@/lib/ciba/authorize", () => ({
  initiateCiba: (...args: unknown[]) => mockInitiateCiba(...args),
}));
vi.mock("@/lib/data/scheduled-ciba", () => ({
  storeScheduledCibaSession: (...args: unknown[]) =>
    mockStoreScheduledCibaSession(...args),
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

  it("returns 401 without valid CRON_SECRET", async () => {
    const res = await GET(makeRequest("wrong-secret"));
    expect(res.status).toBe(401);
  });

  it("returns 401 with no auth header", async () => {
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it("skips users with no pending actions", async () => {
    mockGetUsersForScheduleHour.mockResolvedValue(["auth0|user1"]);
    mockGetUserSettings.mockResolvedValue({
      schedule: { enabled: true, hours: [8], timezone: "UTC" },
    });
    mockGetActions.mockResolvedValue([]);

    vi.setSystemTime(new Date("2026-04-04T08:00:00Z"));

    const res = await GET(makeRequest("test-cron-secret"));
    const body = await res.json();

    expect(body.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ userId: "auth0|user1", status: "skipped-no-eligible-actions" }),
      ])
    );
    expect(mockInitiateCiba).not.toHaveBeenCalled();

    vi.useRealTimers();
  });

  it("filters to high/medium priority and sends per-action CIBA", async () => {
    vi.setSystemTime(new Date("2026-04-04T12:00:00Z")); // 12 UTC = 8 AM ET

    mockGetUsersForScheduleHour.mockResolvedValue(["auth0|user1"]);
    mockGetUserSettings.mockResolvedValue({
      schedule: { enabled: true, hours: [8], timezone: "America/New_York" },
    });
    mockGetActions.mockResolvedValue([
      { id: "act1", status: "pending", priority: "high", type: "email", draft: { to: "j@co.com", subject: "Follow up" }, dealName: "Acme" },
      { id: "act2", status: "pending", priority: "medium", type: "slack", draft: { channel: "sales", message: "Update" }, dealName: "Beta" },
      { id: "act3", status: "pending", priority: "low", type: "email", draft: { to: "x@co.com", subject: "FYI" }, dealName: "Gamma" },
    ]);
    mockInitiateCiba.mockResolvedValue({
      authReqId: "ciba-123",
      expiresIn: 300,
      interval: 5,
      bindingMessage: "test",
    });
    mockStoreScheduledCibaSession.mockResolvedValue(undefined);
    mockUpdateAction.mockResolvedValue(undefined);

    const res = await GET(makeRequest("test-cron-secret"));
    const body = await res.json();

    // Called twice (high + medium), not for the low-priority action
    expect(mockInitiateCiba).toHaveBeenCalledTimes(2);
    // First call should include priority and action detail
    expect(mockInitiateCiba).toHaveBeenCalledWith(
      "auth0|user1",
      expect.stringContaining("HIGH")
    );
    // Per-action status update, not batch
    expect(mockUpdateAction).toHaveBeenCalledWith(
      "auth0|user1",
      "act1",
      { status: "ciba-pending" }
    );
    expect(mockUpdateAction).toHaveBeenCalledWith(
      "auth0|user1",
      "act2",
      { status: "ciba-pending" }
    );
    expect(body.results[0].status).toBe("initiated");
    expect(body.results[0].actionCount).toBe(2);

    vi.useRealTimers();
  });

  it("skips user when timezone doesn't match", async () => {
    vi.setSystemTime(new Date("2026-04-04T12:00:00Z")); // 12 UTC = 1 PM London

    mockGetUsersForScheduleHour.mockResolvedValue(["auth0|london-user"]);
    mockGetUserSettings.mockResolvedValue({
      schedule: { enabled: true, hours: [8], timezone: "Europe/London" },
    });

    const res = await GET(makeRequest("test-cron-secret"));
    const body = await res.json();

    expect(mockInitiateCiba).not.toHaveBeenCalled();
    expect(body.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ status: "skipped-wrong-hour" }),
      ])
    );

    vi.useRealTimers();
  });

  it("skips low-priority-only actions", async () => {
    vi.setSystemTime(new Date("2026-04-04T08:00:00Z"));

    mockGetUsersForScheduleHour.mockResolvedValue(["auth0|user1"]);
    mockGetUserSettings.mockResolvedValue({
      schedule: { enabled: true, hours: [8], timezone: "UTC" },
    });
    mockGetActions.mockResolvedValue([
      { id: "act1", status: "pending", priority: "low", type: "email", draft: { to: "x@co.com", subject: "FYI" }, dealName: "Gamma" },
    ]);

    const res = await GET(makeRequest("test-cron-secret"));
    const body = await res.json();

    expect(mockInitiateCiba).not.toHaveBeenCalled();
    expect(body.results[0].status).toBe("skipped-no-eligible-actions");

    vi.useRealTimers();
  });
});
