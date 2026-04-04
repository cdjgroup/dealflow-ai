import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

// AC-7: PUT /api/settings accepts toolTrust with zod validation

const {
  mockGetSession,
  mockGetUser,
  mockLimit,
  mockCheckCsrf,
  mockUpdateUserSettings,
  mockGetUserSettings,
  mockUpdateScheduleIndex,
  mockStoreScheduleRefreshToken,
  mockDeleteScheduleRefreshToken,
} = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockGetUser: vi.fn(),
  mockLimit: vi.fn(),
  mockCheckCsrf: vi.fn(),
  mockUpdateUserSettings: vi.fn(),
  mockGetUserSettings: vi.fn(),
  mockUpdateScheduleIndex: vi.fn(),
  mockStoreScheduleRefreshToken: vi.fn(),
  mockDeleteScheduleRefreshToken: vi.fn(),
}));

vi.mock("@/lib/auth0", () => ({
  auth0: { getSession: mockGetSession },
  getUser: mockGetUser,
}));

vi.mock("@/lib/rate-limit", () => ({
  getRateLimiter: () => ({ limit: mockLimit }),
}));

vi.mock("@/lib/api-guard", () => ({
  checkCsrf: (...args: unknown[]) => mockCheckCsrf(...args),
}));

vi.mock("@/lib/data/settings", () => ({
  updateUserSettings: (...args: unknown[]) => mockUpdateUserSettings(...args),
  getUserSettings: (...args: unknown[]) => mockGetUserSettings(...args),
  updateScheduleIndex: (...args: unknown[]) => mockUpdateScheduleIndex(...args),
}));

vi.mock("@/lib/data/schedule-tokens", () => ({
  storeScheduleRefreshToken: (...args: unknown[]) =>
    mockStoreScheduleRefreshToken(...args),
  deleteScheduleRefreshToken: (...args: unknown[]) =>
    mockDeleteScheduleRefreshToken(...args),
}));

import { PUT } from "@/app/api/settings/route";

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/settings", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "X-Requested-With": "XMLHttpRequest",
    },
    body: JSON.stringify(body),
  });
}

describe("PUT /api/settings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCheckCsrf.mockReturnValue(null);
    mockGetSession.mockResolvedValue({ user: {}, tokenSet: {} });
    mockGetUser.mockResolvedValue({ sub: "auth0|user1" });
    mockLimit.mockResolvedValue({ success: true });
    mockGetUserSettings.mockResolvedValue({
      capabilities: {
        crmRead: true, crmWrite: true, calendar: true, gmail: true, slack: false,
      },
      approvalRequired: { crmWrite: false },
      toolTrust: {},
      schedule: { enabled: false, hours: [], timezone: "UTC" },
    });
    mockUpdateScheduleIndex.mockResolvedValue(undefined);
    mockStoreScheduleRefreshToken.mockResolvedValue(undefined);
    mockDeleteScheduleRefreshToken.mockResolvedValue(undefined);
    mockUpdateUserSettings.mockResolvedValue({
      capabilities: {
        crmRead: true,
        crmWrite: true,
        calendar: true,
        gmail: true,
        slack: false,
      },
      approvalRequired: { crmWrite: false },
      toolTrust: {},
    });
  });

  // AC-7: valid toolTrust values are accepted
  describe("toolTrust validation (AC-7)", () => {
    it('should accept toolTrust with valid "always" trust level', async () => {
      const req = makeRequest({ toolTrust: { draftEmail: "always" } });
      const response = await PUT(req);
      expect(response.status).toBe(200);
    });

    it('should accept toolTrust with valid "ask" trust level', async () => {
      const req = makeRequest({ toolTrust: { checkCalendar: "ask" } });
      const response = await PUT(req);
      expect(response.status).toBe(200);
    });

    it('should accept toolTrust with valid "never" trust level', async () => {
      const req = makeRequest({ toolTrust: { sendSlackMessage: "never" } });
      const response = await PUT(req);
      expect(response.status).toBe(200);
    });

    it("should accept toolTrust with multiple tool entries", async () => {
      const req = makeRequest({
        toolTrust: {
          draftEmail: "always",
          checkCalendar: "ask",
          sendSlackMessage: "never",
        },
      });
      const response = await PUT(req);
      expect(response.status).toBe(200);
    });

    it('should reject toolTrust with invalid trust level value "sometimes"', async () => {
      const req = makeRequest({ toolTrust: { draftEmail: "sometimes" } });
      const response = await PUT(req);
      expect(response.status).toBe(400);
    });

    it("should reject toolTrust with numeric trust level value", async () => {
      const req = makeRequest({ toolTrust: { draftEmail: 1 } });
      const response = await PUT(req);
      expect(response.status).toBe(400);
    });

    it("should accept an empty toolTrust object", async () => {
      const req = makeRequest({ toolTrust: {} });
      const response = await PUT(req);
      expect(response.status).toBe(200);
    });
  });
});
