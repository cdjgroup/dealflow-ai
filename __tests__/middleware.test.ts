import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const { mockMiddleware, mockGetSession } = vi.hoisted(() => ({
  mockMiddleware: vi.fn(),
  mockGetSession: vi.fn(),
}));

vi.mock("@/lib/auth0", () => ({
  auth0: {
    middleware: mockMiddleware,
    getSession: mockGetSession,
  },
}));

import { middleware } from "@/middleware";

function createMockRequest(path: string): NextRequest {
  return new NextRequest(new URL(path, "http://localhost:3000"));
}

describe("middleware", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMiddleware.mockResolvedValue(NextResponse.next());
    mockGetSession.mockResolvedValue(null);
  });

  it("should return auth response for /auth paths", async () => {
    const authResponse = NextResponse.json({ ok: true });
    mockMiddleware.mockResolvedValue(authResponse);

    const request = createMockRequest("/auth/login");
    const result = await middleware(request);

    expect(mockMiddleware).toHaveBeenCalledWith(request);
    expect(result).toBe(authResponse);
    // getSession should not be called for /auth paths
    expect(mockGetSession).not.toHaveBeenCalled();
  });

  it("should redirect to login when accessing /dashboard without session", async () => {
    mockGetSession.mockResolvedValue(null);

    const request = createMockRequest("/dashboard");
    const result = await middleware(request);

    expect(mockGetSession).toHaveBeenCalledWith(request);
    expect(result.status).toBe(307);
    expect(result.headers.get("location")).toBe(
      "http://localhost:3000/auth/login?returnTo=/dashboard"
    );
  });

  it("should return auth response when accessing /dashboard with valid session", async () => {
    const authResponse = NextResponse.next();
    mockMiddleware.mockResolvedValue(authResponse);
    mockGetSession.mockResolvedValue({ user: { sub: "user1" } });

    const request = createMockRequest("/dashboard");
    const result = await middleware(request);

    expect(mockGetSession).toHaveBeenCalledWith(request);
    expect(result).toBe(authResponse);
  });

  it("should clear corrupted session cookies on JWE errors and redirect to /", async () => {
    mockMiddleware.mockRejectedValue(
      new Error("Failed to decrypt JWE token")
    );

    const request = createMockRequest("/dashboard");
    // Mock cookies.getAll to return session cookies
    const originalGetAll = request.cookies.getAll.bind(request.cookies);
    vi.spyOn(request.cookies, "getAll").mockReturnValue([
      { name: "appSession", value: "corrupted" },
      { name: "__session.0", value: "corrupted" },
      { name: "other", value: "keep" },
    ]);

    const result = await middleware(request);

    expect(result.status).toBe(307);
    expect(result.headers.get("location")).toBe("http://localhost:3000/");

    // Verify session cookies are cleared via Set-Cookie headers
    const setCookieHeader = result.headers.get("set-cookie") ?? "";
    expect(setCookieHeader).toContain("appSession");
    expect(setCookieHeader).toContain("__session");
  });

  it("should re-throw non-JWE errors", async () => {
    mockMiddleware.mockRejectedValue(new Error("Network failure"));

    const request = createMockRequest("/dashboard");

    await expect(middleware(request)).rejects.toThrow("Network failure");
  });
});
