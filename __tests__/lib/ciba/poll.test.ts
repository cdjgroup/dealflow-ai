import { describe, it, expect, vi, beforeEach } from "vitest";
import { pollCiba } from "@/lib/ciba/poll";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("pollCiba", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.AUTH0_DOMAIN = "test.auth0.com";
    process.env.AUTH0_CLIENT_ID = "test-client-id";
    process.env.AUTH0_CLIENT_SECRET = "test-client-secret";
  });

  // AC-1: Successful approval returns access token
  it("AC-1: returns approved status with access token on success", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        access_token: "ciba-access-token-xyz",
        token_type: "Bearer",
        expires_in: 3600,
      }),
    });

    const result = await pollCiba("ciba-req-123");

    expect(result).toEqual({
      status: "approved",
      accessToken: "ciba-access-token-xyz",
    });

    // Verify the fetch call uses CIBA grant type with form-urlencoded
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe("https://test.auth0.com/oauth/token");
    expect(options.method).toBe("POST");
    expect(options.headers["Content-Type"]).toBe("application/x-www-form-urlencoded");

    const body = new URLSearchParams(options.body);
    expect(body.get("grant_type")).toBe("urn:openid:params:grant-type:ciba");
    expect(body.get("auth_req_id")).toBe("ciba-req-123");
    expect(body.get("client_id")).toBe("test-client-id");
    expect(body.get("client_secret")).toBe("test-client-secret");
  });

  // AC-1: Authorization pending (user hasn't responded yet)
  it("AC-1: returns pending status when authorization_pending", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({
        error: "authorization_pending",
        error_description: "The end-user authorization is pending",
      }),
    });

    const result = await pollCiba("ciba-req-123");
    expect(result).toEqual({ status: "pending" });
  });

  // AC-2: User denied on phone
  it("AC-2: returns denied status on access_denied", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({
        error: "access_denied",
        error_description: "The end-user denied the authorization request",
      }),
    });

    const result = await pollCiba("ciba-req-123");
    expect(result).toEqual({
      status: "denied",
      error: "The end-user denied the authorization request",
    });
  });

  // AC-6: Request expired
  it("AC-6: returns expired status on expired_token", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({
        error: "expired_token",
        error_description: "The auth_req_id has expired",
      }),
    });

    const result = await pollCiba("ciba-req-123");
    expect(result).toEqual({
      status: "expired",
      error: "The auth_req_id has expired",
    });
  });

  // Slow down response (back off)
  it("returns pending status on slow_down", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({
        error: "slow_down",
        error_description: "Slow down",
      }),
    });

    const result = await pollCiba("ciba-req-123");
    expect(result).toEqual({ status: "pending" });
  });

  // Unknown error
  it("returns error status on unexpected Auth0 error", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({
        error: "server_error",
        error_description: "Internal server error",
      }),
    });

    const result = await pollCiba("ciba-req-123");
    expect(result).toEqual({
      status: "error",
      error: "Internal server error",
    });
  });
});
