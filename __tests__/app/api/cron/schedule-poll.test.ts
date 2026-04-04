import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ScheduledCibaSession } from "@/lib/types/scheduled-ciba";

const mockGetAllActiveScheduledSessions = vi.fn();
const mockRemoveScheduledCibaSession = vi.fn();
const mockPollCiba = vi.fn();
const mockGetAction = vi.fn();
const mockUpdateAction = vi.fn();
const mockBatchUpdateStatus = vi.fn();
const mockGetScheduleRefreshToken = vi.fn();
const mockExchangeTokenWithRefresh = vi.fn();
const mockExecuteActionWithToken = vi.fn();
const mockWriteAuditEntry = vi.fn();

vi.mock("@/lib/data/scheduled-ciba", () => ({
  getAllActiveScheduledSessions: () => mockGetAllActiveScheduledSessions(),
  removeScheduledCibaSession: (...args: unknown[]) =>
    mockRemoveScheduledCibaSession(...args),
}));
vi.mock("@/lib/ciba/poll", () => ({
  pollCiba: (...args: unknown[]) => mockPollCiba(...args),
}));
vi.mock("@/lib/data/actions", () => ({
  getAction: (...args: unknown[]) => mockGetAction(...args),
  updateAction: (...args: unknown[]) => mockUpdateAction(...args),
  batchUpdateStatus: (...args: unknown[]) => mockBatchUpdateStatus(...args),
}));
vi.mock("@/lib/data/schedule-tokens", () => ({
  getScheduleRefreshToken: (...args: unknown[]) =>
    mockGetScheduleRefreshToken(...args),
}));
vi.mock("@/lib/token-exchange", () => ({
  exchangeTokenWithRefresh: (...args: unknown[]) =>
    mockExchangeTokenWithRefresh(...args),
}));
vi.mock("@/lib/actions/executor", () => ({
  executeActionWithToken: (...args: unknown[]) =>
    mockExecuteActionWithToken(...args),
}));
vi.mock("@/lib/data/audit", () => ({
  writeAuditEntry: (...args: unknown[]) => mockWriteAuditEntry(...args),
}));

const { GET } = await import("@/app/api/cron/schedule-poll/route");

function makeRequest(cronSecret?: string): Request {
  const headers: Record<string, string> = {};
  if (cronSecret) headers["authorization"] = `Bearer ${cronSecret}`;
  return new Request("https://app.com/api/cron/schedule-poll", { headers });
}

const TEST_SESSION: ScheduledCibaSession = {
  batchId: "2026-04-04T08:00:00.000Z",
  userId: "auth0|user1",
  authReqId: "ciba-req-abc",
  actionIds: ["act1", "act2", "act3"],
  bindingMessage: "Execute 3 pending actions?",
  expiresAt: "2026-04-04T08:10:00.000Z",
  interval: 5,
  createdAt: "2026-04-04T08:00:00.000Z",
};

describe("GET /api/cron/schedule-poll", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = "test-cron-secret";
  });

  it("AC-9: returns 401 without valid CRON_SECRET", async () => {
    const res = await GET(makeRequest("wrong"));
    expect(res.status).toBe(401);
  });

  it("returns 200 with empty results when no active sessions", async () => {
    mockGetAllActiveScheduledSessions.mockResolvedValue([]);
    const res = await GET(makeRequest("test-cron-secret"));
    const body = await res.json();
    expect(body.processed).toBe(0);
    expect(body.results).toEqual([]);
  });

  it("AC-5: executes all actions on CIBA approval", async () => {
    mockGetAllActiveScheduledSessions.mockResolvedValue([TEST_SESSION]);
    mockPollCiba.mockResolvedValue({ status: "approved" });
    mockGetScheduleRefreshToken.mockResolvedValue("stored-refresh-token");
    mockExchangeTokenWithRefresh.mockResolvedValue({
      token: "google-access-token",
      scope: "gmail calendar",
      expiresIn: 3600,
      connection: "google-oauth2",
      exchangedAt: "2026-04-04T08:01:00Z",
    });

    const mockAction = {
      id: "act1",
      type: "email",
      userId: "auth0|user1",
      draft: { to: "test@test.com", subject: "Test", body: "Hello" },
    };
    mockGetAction.mockResolvedValue(mockAction);
    mockUpdateAction.mockResolvedValue({ ...mockAction, status: "sent" });
    mockExecuteActionWithToken.mockResolvedValue({
      success: true,
      message: "Draft created",
    });
    mockWriteAuditEntry.mockResolvedValue({});

    const res = await GET(makeRequest("test-cron-secret"));
    const body = await res.json();

    expect(body.results[0].status).toBe("executed");
    // Should exchange token once per connection type, then execute each action
    expect(mockGetScheduleRefreshToken).toHaveBeenCalledWith("auth0|user1");
    expect(mockExecuteActionWithToken).toHaveBeenCalledTimes(3);
    expect(mockRemoveScheduledCibaSession).toHaveBeenCalledWith(
      "auth0|user1",
      "2026-04-04T08:00:00.000Z"
    );
  });

  it("AC-7: reverts actions to pending on CIBA denial", async () => {
    mockGetAllActiveScheduledSessions.mockResolvedValue([TEST_SESSION]);
    mockPollCiba.mockResolvedValue({
      status: "denied",
      error: "User denied",
    });
    mockBatchUpdateStatus.mockResolvedValue([]);

    const res = await GET(makeRequest("test-cron-secret"));
    const body = await res.json();

    expect(body.results[0].status).toBe("denied");
    expect(mockBatchUpdateStatus).toHaveBeenCalledWith(
      "auth0|user1",
      ["act1", "act2", "act3"],
      "pending"
    );
    expect(mockRemoveScheduledCibaSession).toHaveBeenCalled();
  });

  it("AC-8: reverts actions to pending on CIBA expiry by time", async () => {
    const expiredSession = {
      ...TEST_SESSION,
      expiresAt: "2026-04-04T07:50:00.000Z", // Already expired
    };
    mockGetAllActiveScheduledSessions.mockResolvedValue([expiredSession]);
    mockPollCiba.mockResolvedValue({ status: "pending" });
    mockBatchUpdateStatus.mockResolvedValue([]);

    vi.setSystemTime(new Date("2026-04-04T08:05:00Z"));

    const res = await GET(makeRequest("test-cron-secret"));
    const body = await res.json();

    expect(body.results[0].status).toBe("expired-by-time");
    expect(mockBatchUpdateStatus).toHaveBeenCalledWith(
      "auth0|user1",
      ["act1", "act2", "act3"],
      "pending"
    );

    vi.useRealTimers();
  });

  it("AC-10: marks actions failed when no refresh token stored", async () => {
    mockGetAllActiveScheduledSessions.mockResolvedValue([TEST_SESSION]);
    mockPollCiba.mockResolvedValue({ status: "approved" });
    mockGetScheduleRefreshToken.mockResolvedValue(null);
    mockBatchUpdateStatus.mockResolvedValue([]);

    const res = await GET(makeRequest("test-cron-secret"));
    const body = await res.json();

    expect(body.results[0].status).toBe("error-no-token");
    expect(mockBatchUpdateStatus).toHaveBeenCalledWith(
      "auth0|user1",
      ["act1", "act2", "act3"],
      "failed"
    );
  });

  it("AC-6: handles partial execution failure", async () => {
    const session = { ...TEST_SESSION, actionIds: ["act1", "act2"] };
    mockGetAllActiveScheduledSessions.mockResolvedValue([session]);
    mockPollCiba.mockResolvedValue({ status: "approved" });
    mockGetScheduleRefreshToken.mockResolvedValue("token");
    mockExchangeTokenWithRefresh.mockResolvedValue({
      token: "access-token",
      scope: "gmail",
      expiresIn: 3600,
      connection: "google-oauth2",
      exchangedAt: "2026-04-04T00:00:00Z",
    });

    const act1 = { id: "act1", type: "email", userId: "auth0|user1" };
    const act2 = { id: "act2", type: "email", userId: "auth0|user1" };
    mockGetAction.mockResolvedValueOnce(act1).mockResolvedValueOnce(act2);
    mockUpdateAction.mockResolvedValue({});

    // act1 succeeds, act2 fails
    mockExecuteActionWithToken
      .mockResolvedValueOnce({ success: true, message: "OK" })
      .mockRejectedValueOnce(new Error("Slack API error"));

    mockWriteAuditEntry.mockResolvedValue({});

    const res = await GET(makeRequest("test-cron-secret"));
    const body = await res.json();

    expect(body.results[0].status).toBe("executed");
    // act1 → sent
    expect(mockUpdateAction).toHaveBeenCalledWith(
      "auth0|user1",
      "act1",
      expect.objectContaining({ status: "sent" })
    );
    // act2 → failed
    expect(mockUpdateAction).toHaveBeenCalledWith(
      "auth0|user1",
      "act2",
      expect.objectContaining({
        status: "failed",
        errorMessage: "Slack API error",
      })
    );
  });

  it("still-pending: leaves session for next poll cycle", async () => {
    vi.setSystemTime(new Date("2026-04-04T08:02:00Z")); // Before expiry

    mockGetAllActiveScheduledSessions.mockResolvedValue([TEST_SESSION]);
    mockPollCiba.mockResolvedValue({ status: "pending" });

    const res = await GET(makeRequest("test-cron-secret"));
    const body = await res.json();

    expect(body.results[0].status).toBe("still-pending");
    expect(mockRemoveScheduledCibaSession).not.toHaveBeenCalled();

    vi.useRealTimers();
  });
});
