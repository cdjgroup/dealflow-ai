import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

const {
  mockGetSession,
  mockGetUser,
  mockLimit,
  mockCheckCsrf,
  mockSeedDemoData,
} = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockGetUser: vi.fn(),
  mockLimit: vi.fn(),
  mockCheckCsrf: vi.fn(),
  mockSeedDemoData: vi.fn(),
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

vi.mock("@/lib/data/crm", () => ({
  seedDemoData: (...args: unknown[]) => mockSeedDemoData(...args),
}));

import { POST } from "@/app/api/seed/route";

function makeRequest() {
  return new Request("http://localhost/api/seed", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Requested-With": "XMLHttpRequest",
    },
  });
}

describe("POST /api/seed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCheckCsrf.mockReturnValue(null);
    mockGetSession.mockResolvedValue({ user: {} });
    mockGetUser.mockResolvedValue({ sub: "auth0|user1" });
    mockLimit.mockResolvedValue({ success: true });
  });

  it("should return 403 when CSRF check fails", async () => {
    const csrfResponse = NextResponse.json(
      { error: "Forbidden" },
      { status: 403 }
    );
    mockCheckCsrf.mockReturnValue(csrfResponse);

    const res = await POST(makeRequest());

    expect(res.status).toBe(403);
    expect(mockGetSession).not.toHaveBeenCalled();
  });

  it("should return 401 when no session", async () => {
    mockGetSession.mockResolvedValue(null);

    const res = await POST(makeRequest());

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("should return 401 when no user sub", async () => {
    mockGetUser.mockResolvedValue({ sub: undefined });

    const res = await POST(makeRequest());

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toContain("missing user ID");
  });

  it("should return 429 when rate limited", async () => {
    mockLimit.mockResolvedValue({ success: false });

    const res = await POST(makeRequest());

    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toContain("Rate limit");
  });

  it("should return success with seed counts", async () => {
    mockSeedDemoData.mockResolvedValue({
      deals: 4,
      contacts: 4,
      activities: 5,
    });

    const res = await POST(makeRequest());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.deals).toBe(4);
    expect(body.contacts).toBe(4);
    expect(body.activities).toBe(5);
    expect(mockSeedDemoData).toHaveBeenCalledWith("auth0|user1");
  });

  it("should return 500 when seedDemoData throws without leaking error details", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockSeedDemoData.mockRejectedValue(
      new Error("Redis connection refused")
    );

    const res = await POST(makeRequest());

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Failed to seed data");
    // Verify internal error details are NOT leaked to the client
    expect(JSON.stringify(body)).not.toContain("Redis");
    expect(JSON.stringify(body)).not.toContain("connection refused");
  });
});
