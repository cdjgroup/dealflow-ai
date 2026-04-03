import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockGetSession,
  mockGetUser,
  mockCheckCsrf,
  mockScan,
  mockPipeline,
  mockPipelineExec,
  mockPipelineDel,
} = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockGetUser: vi.fn(),
  mockCheckCsrf: vi.fn(),
  mockScan: vi.fn(),
  mockPipeline: vi.fn(),
  mockPipelineExec: vi.fn(),
  mockPipelineDel: vi.fn(),
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
    scan: mockScan,
    pipeline: () => ({
      del: mockPipelineDel,
      exec: mockPipelineExec,
    }),
  }),
}));

import { DELETE } from "@/app/api/connections/[connection]/route";

function makeRequest() {
  return new Request("http://localhost/api/connections/google-oauth2", {
    method: "DELETE",
    headers: { "X-Requested-With": "XMLHttpRequest" },
  });
}

describe("DELETE /api/connections/[connection]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn());

    // Default happy path mocks
    mockCheckCsrf.mockReturnValue(null);
    mockGetSession.mockResolvedValue({ tokenSet: { refreshToken: "rt_test" } });
    mockGetUser.mockResolvedValue({ sub: "auth0|user123" });
    mockScan.mockResolvedValue([0, []]);

    process.env.AUTH0_DOMAIN = "test.auth0.com";
    process.env.AUTH0_CLIENT_ID = "client123";
    process.env.AUTH0_CLIENT_SECRET = "secret456";
  });

  it("returns 403 when CSRF check fails", async () => {
    const { NextResponse } = await import("next/server");
    mockCheckCsrf.mockReturnValue(
      NextResponse.json({ error: "Forbidden" }, { status: 403 })
    );

    const res = await DELETE(makeRequest(), {
      params: Promise.resolve({ connection: "google-oauth2" }),
    });

    expect(res.status).toBe(403);
  });

  it("returns 401 when no session", async () => {
    mockGetSession.mockResolvedValue(null);

    const res = await DELETE(makeRequest(), {
      params: Promise.resolve({ connection: "google-oauth2" }),
    });

    expect(res.status).toBe(401);
  });

  it("returns 404 for unknown connection", async () => {
    const res = await DELETE(makeRequest(), {
      params: Promise.resolve({ connection: "facebook" }),
    });

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Unknown connection");
  });

  it("returns 502 when Management API token request fails", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 401,
    } as Response);

    const res = await DELETE(makeRequest(), {
      params: Promise.resolve({ connection: "google-oauth2" }),
    });

    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toContain("could not reach Auth0");
  });

  it("returns 502 when federated connection delete fails", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: "mgmt_token" }),
      } as Response)
      .mockResolvedValueOnce({
        ok: false,
        status: 403,
        text: async () => "Insufficient scope",
      } as Response);

    const res = await DELETE(makeRequest(), {
      params: Promise.resolve({ connection: "google-oauth2" }),
    });

    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toContain("Auth0 rejected");
  });

  it("treats 404 from Auth0 as success (already disconnected)", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: "mgmt_token" }),
      } as Response)
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: async () => "Not found",
      } as Response);

    const res = await DELETE(makeRequest(), {
      params: Promise.resolve({ connection: "google-oauth2" }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it("calls Auth0 Management API with correct endpoint", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: "mgmt_token" }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 204,
      } as Response);

    await DELETE(makeRequest(), {
      params: Promise.resolve({ connection: "google-oauth2" }),
    });

    // First call: get management token
    const tokenCall = vi.mocked(fetch).mock.calls[0];
    expect(tokenCall[0]).toBe("https://test.auth0.com/oauth/token");
    expect(JSON.parse(tokenCall[1]!.body as string)).toMatchObject({
      grant_type: "client_credentials",
      audience: "https://test.auth0.com/api/v2/",
    });

    // Second call: delete federated connection
    const deleteCall = vi.mocked(fetch).mock.calls[1];
    expect(deleteCall[0]).toBe(
      "https://test.auth0.com/api/v2/users/auth0%7Cuser123/federated-connections/google-oauth2"
    );
    expect(deleteCall[1]!.method).toBe("DELETE");
    expect(deleteCall[1]!.headers).toMatchObject({
      Authorization: "Bearer mgmt_token",
    });
  });

  it("clears Redis cache after Auth0 disconnect", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: "mgmt_token" }),
      } as Response)
      .mockResolvedValueOnce({ ok: true, status: 204 } as Response);

    mockScan.mockResolvedValue([0, ["auth0|user123:token:google-oauth2"]]);

    const res = await DELETE(makeRequest(), {
      params: Promise.resolve({ connection: "google-oauth2" }),
    });

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.keysCleared).toBe(1);
    expect(mockPipelineDel).toHaveBeenCalledWith("auth0|user123:token:google-oauth2");
    expect(mockPipelineExec).toHaveBeenCalled();
  });

  it("works for sign-in-with-slack connection", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: "mgmt_token" }),
      } as Response)
      .mockResolvedValueOnce({ ok: true, status: 204 } as Response);

    const res = await DELETE(
      new Request("http://localhost/api/connections/sign-in-with-slack", {
        method: "DELETE",
        headers: { "X-Requested-With": "XMLHttpRequest" },
      }),
      { params: Promise.resolve({ connection: "sign-in-with-slack" }) }
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.connection).toBe("sign-in-with-slack");
  });
});
