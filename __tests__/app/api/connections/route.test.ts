import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockGetSession,
  mockGetUser,
  mockCheckCsrf,
  mockSadd,
  mockSrem,
} = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockGetUser: vi.fn(),
  mockCheckCsrf: vi.fn(),
  mockSadd: vi.fn(),
  mockSrem: vi.fn(),
}));

vi.mock("@/lib/auth0", () => ({
  auth0: { getSession: mockGetSession },
  getUser: mockGetUser,
}));

vi.mock("@/lib/api-guard", () => ({
  checkCsrf: (...args: unknown[]) => mockCheckCsrf(...args),
}));

vi.mock("@/lib/redis", () => ({
  getRedis: () => ({
    sadd: mockSadd,
    srem: mockSrem,
    sismember: vi.fn().mockResolvedValue(0),
    smembers: vi.fn().mockResolvedValue([]),
  }),
}));

vi.mock("@/lib/rate-limit", () => ({
  getSensitiveLimiter: () => ({ limit: vi.fn().mockResolvedValue({ success: true }) }),
}));

import { DELETE, POST } from "@/app/api/connections/[connection]/route";

function makeDeleteRequest() {
  return new Request("http://localhost/api/connections/google-oauth2", {
    method: "DELETE",
    headers: { "X-Requested-With": "XMLHttpRequest" },
  });
}

function makePostRequest(connection: string) {
  return new Request(`http://localhost/api/connections/${connection}`, {
    method: "POST",
    headers: { "X-Requested-With": "XMLHttpRequest" },
  });
}

// Helper: mock fetch for management token + tokenset list + delete flow
function mockManagementFlow(
  tokensets: { tokenset_id: string; connection: string }[],
  deleteStatus = 204
) {
  vi.mocked(fetch)
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: "mgmt_token" }),
    } as Response)
    .mockResolvedValueOnce({
      ok: true,
      json: async () => tokensets,
    } as Response);

  for (const _ts of tokensets.filter((t) => t.connection === "google-oauth2")) {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: deleteStatus < 300,
      status: deleteStatus,
      text: async () => "",
    } as Response);
  }
}

describe("DELETE /api/connections/[connection]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn());
    mockSadd.mockResolvedValue(1);
    mockSrem.mockResolvedValue(1);

    mockCheckCsrf.mockReturnValue(null);
    mockGetSession.mockResolvedValue({ tokenSet: { refreshToken: "rt_test" } });
    mockGetUser.mockResolvedValue({ sub: "auth0|user123" });

    process.env.AUTH0_DOMAIN = "test.auth0.com";
    process.env.AUTH0_CLIENT_ID = "client123";
    process.env.AUTH0_CLIENT_SECRET = "secret456";
  });

  it("returns 403 when CSRF check fails", async () => {
    const { NextResponse } = await import("next/server");
    mockCheckCsrf.mockReturnValue(
      NextResponse.json({ error: "Forbidden" }, { status: 403 })
    );

    const res = await DELETE(makeDeleteRequest(), {
      params: Promise.resolve({ connection: "google-oauth2" }),
    });

    expect(res.status).toBe(403);
  });

  it("returns 401 when no session", async () => {
    mockGetSession.mockResolvedValue(null);

    const res = await DELETE(makeDeleteRequest(), {
      params: Promise.resolve({ connection: "google-oauth2" }),
    });

    expect(res.status).toBe(401);
  });

  it("returns 404 for unknown connection", async () => {
    const res = await DELETE(makeDeleteRequest(), {
      params: Promise.resolve({ connection: "facebook" }),
    });

    expect(res.status).toBe(404);
  });

  it("sets disabled flag in Redis", async () => {
    mockManagementFlow([]);

    const res = await DELETE(makeDeleteRequest(), {
      params: Promise.resolve({ connection: "google-oauth2" }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.connection).toBe("google-oauth2");
    expect(mockSadd).toHaveBeenCalledWith(
      "auth0|user123:disabled-connections",
      "google-oauth2"
    );
  });

  it("attempts tokenset cleanup via Management API", async () => {
    mockManagementFlow([
      { tokenset_id: "ts_abc", connection: "google-oauth2" },
    ]);

    await DELETE(makeDeleteRequest(), {
      params: Promise.resolve({ connection: "google-oauth2" }),
    });

    const deleteCall = vi.mocked(fetch).mock.calls[2];
    expect(deleteCall[0]).toBe(
      "https://test.auth0.com/api/v2/users/auth0%7Cuser123/federated-connections-tokensets/ts_abc"
    );
    expect(deleteCall[1]!.method).toBe("DELETE");
  });

  it("succeeds even if tokenset cleanup fails", async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error("network error"));

    const res = await DELETE(makeDeleteRequest(), {
      params: Promise.resolve({ connection: "google-oauth2" }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it("works for sign-in-with-slack connection", async () => {
    mockManagementFlow([]);

    const res = await DELETE(
      new Request("http://localhost/api/connections/sign-in-with-slack", {
        method: "DELETE",
        headers: { "X-Requested-With": "XMLHttpRequest" },
      }),
      { params: Promise.resolve({ connection: "sign-in-with-slack" }) }
    );

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(mockSadd).toHaveBeenCalledWith(
      "auth0|user123:disabled-connections",
      "sign-in-with-slack"
    );
  });
});

describe("POST /api/connections/[connection]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCheckCsrf.mockReturnValue(null);
    mockGetSession.mockResolvedValue({ tokenSet: { refreshToken: "rt_test" } });
    mockGetUser.mockResolvedValue({ sub: "auth0|user123" });
    mockSrem.mockResolvedValue(1);
  });

  it("clears disabled flag in Redis", async () => {
    const res = await POST(makePostRequest("google-oauth2"), {
      params: Promise.resolve({ connection: "google-oauth2" }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(mockSrem).toHaveBeenCalledWith(
      "auth0|user123:disabled-connections",
      "google-oauth2"
    );
  });

  it("returns 404 for unknown connection", async () => {
    const res = await POST(makePostRequest("facebook"), {
      params: Promise.resolve({ connection: "facebook" }),
    });

    expect(res.status).toBe(404);
  });

  it("returns 401 when no session", async () => {
    mockGetSession.mockResolvedValue(null);

    const res = await POST(makePostRequest("google-oauth2"), {
      params: Promise.resolve({ connection: "google-oauth2" }),
    });

    expect(res.status).toBe(401);
  });
});
