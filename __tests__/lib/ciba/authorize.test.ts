import { describe, it, expect, vi, beforeEach } from "vitest";
import { initiateCiba } from "@/lib/ciba/authorize";

// Mock fetch for Auth0 /bc-authorize endpoint
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("initiateCiba", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.AUTH0_DOMAIN = "test.auth0.com";
    process.env.AUTH0_CLIENT_ID = "test-client-id";
    process.env.AUTH0_CLIENT_SECRET = "test-client-secret";
  });

  // AC-1: Successful CIBA initiation
  it("AC-1: calls Auth0 /bc-authorize and returns authReqId on success", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        auth_req_id: "ciba-req-123",
        expires_in: 300,
        interval: 5,
      }),
    });

    const result = await initiateCiba(
      "auth0|user123",
      "Approve creating $75,000 deal: Acme Enterprise"
    );

    expect(result).toEqual({
      authReqId: "ciba-req-123",
      expiresIn: 300,
      interval: 5,
      bindingMessage: "Approve creating 75,000 deal: Acme Enterprise",
    });

    // Verify the fetch call
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe("https://test.auth0.com/bc-authorize");
    expect(options.method).toBe("POST");
    expect(options.headers["Content-Type"]).toBe("application/x-www-form-urlencoded");

    const body = new URLSearchParams(options.body);
    expect(body.get("client_id")).toBe("test-client-id");
    expect(body.get("client_secret")).toBe("test-client-secret");
    // $ is stripped by Auth0 CIBA binding_message sanitization (only alphanumerics, whitespace, +-_.,:#)
    expect(body.get("binding_message")).toBe("Approve creating 75,000 deal: Acme Enterprise");
    expect(body.get("login_hint")).toContain("auth0|user123");
    expect(body.get("scope")).toBe("openid");
  });

  // AC-5: Auth0 returns error (e.g., user not enrolled in Guardian)
  it("AC-5: throws on Auth0 error (no Guardian enrollment)", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({
        error: "invalid_request",
        error_description: "User is not enrolled in push notifications",
      }),
    });

    await expect(
      initiateCiba("auth0|user-no-guardian", "Approve deal")
    ).rejects.toThrow("User is not enrolled in push notifications");
  });

  // AC-5: Network error
  it("AC-5: throws on network failure", async () => {
    mockFetch.mockRejectedValue(new Error("fetch failed"));

    await expect(
      initiateCiba("auth0|user123", "Approve deal")
    ).rejects.toThrow("fetch failed");
  });
});
