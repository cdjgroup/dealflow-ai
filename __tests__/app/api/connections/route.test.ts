import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockGetSession,
  mockGetUser,
  mockCheckCsrf,
  mockScan,
  mockPipelineExec,
  mockPipelineDel,
} = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockGetUser: vi.fn(),
  mockCheckCsrf: vi.fn(),
  mockScan: vi.fn(),
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

// Helper: mock fetch for the management token + tokenset list + delete flow
function mockManagementFlow(
  tokensets: { tokenset_id: string; connection: string }[],
  deleteStatus = 204
) {
  vi.mocked(fetch)
    // 1st call: get management token
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: "mgmt_token" }),
    } as Response)
    // 2nd call: list tokensets
    .mockResolvedValueOnce({
      ok: true,
      json: async () => tokensets,
    } as Response);

  // 3rd+ calls: delete each matching tokenset
  for (const _ts of tokensets) {
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

    expect(res.status).toBe(500);
  });

  it("returns 502 when tokenset list fails", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: "mgmt_token" }),
      } as Response)
      .mockResolvedValueOnce({
        ok: false,
        status: 403,
      } as Response);

    const res = await DELETE(makeRequest(), {
      params: Promise.resolve({ connection: "google-oauth2" }),
    });

    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toContain("could not list tokensets");
  });

  it("lists tokensets and deletes matching ones", async () => {
    mockManagementFlow([
      { tokenset_id: "ts_abc", connection: "google-oauth2" },
    ]);

    const res = await DELETE(makeRequest(), {
      params: Promise.resolve({ connection: "google-oauth2" }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.tokensetsDeleted).toBe(1);

    // Verify the delete call
    const deleteCall = vi.mocked(fetch).mock.calls[2];
    expect(deleteCall[0]).toBe(
      "https://test.auth0.com/api/v2/users/auth0%7Cuser123/federated-connections-tokensets/ts_abc"
    );
    expect(deleteCall[1]!.method).toBe("DELETE");
  });

  it("succeeds with 0 tokensets deleted when none match", async () => {
    mockManagementFlow([
      { tokenset_id: "ts_xyz", connection: "sign-in-with-slack" },
    ]);

    const res = await DELETE(makeRequest(), {
      params: Promise.resolve({ connection: "google-oauth2" }),
    });

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.tokensetsDeleted).toBe(0);
    // Only 2 fetch calls (token + list), no delete calls
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("handles multiple tokensets for same connection", async () => {
    mockManagementFlow([
      { tokenset_id: "ts_1", connection: "google-oauth2" },
      { tokenset_id: "ts_2", connection: "google-oauth2" },
    ]);

    const res = await DELETE(makeRequest(), {
      params: Promise.resolve({ connection: "google-oauth2" }),
    });

    const body = await res.json();
    expect(body.tokensetsDeleted).toBe(2);
    // token + list + 2 deletes
    expect(fetch).toHaveBeenCalledTimes(4);
  });

  it("clears Redis cache after tokenset deletion", async () => {
    mockManagementFlow([]);
    mockScan.mockResolvedValue([0, ["auth0|user123:token:google-oauth2"]]);

    const res = await DELETE(makeRequest(), {
      params: Promise.resolve({ connection: "google-oauth2" }),
    });

    const body = await res.json();
    expect(body.keysCleared).toBe(1);
    expect(mockPipelineDel).toHaveBeenCalledWith("auth0|user123:token:google-oauth2");
    expect(mockPipelineExec).toHaveBeenCalled();
  });

  it("works for sign-in-with-slack connection", async () => {
    mockManagementFlow([
      { tokenset_id: "ts_slack", connection: "sign-in-with-slack" },
    ]);

    const res = await DELETE(
      new Request("http://localhost/api/connections/sign-in-with-slack", {
        method: "DELETE",
        headers: { "X-Requested-With": "XMLHttpRequest" },
      }),
      { params: Promise.resolve({ connection: "sign-in-with-slack" }) }
    );

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.connection).toBe("sign-in-with-slack");
  });

  it("requests management token with correct credentials", async () => {
    mockManagementFlow([]);

    await DELETE(makeRequest(), {
      params: Promise.resolve({ connection: "google-oauth2" }),
    });

    const tokenCall = vi.mocked(fetch).mock.calls[0];
    expect(tokenCall[0]).toBe("https://test.auth0.com/oauth/token");
    expect(JSON.parse(tokenCall[1]!.body as string)).toMatchObject({
      grant_type: "client_credentials",
      audience: "https://test.auth0.com/api/v2/",
      client_id: "client123",
      client_secret: "secret456",
    });
  });
});
