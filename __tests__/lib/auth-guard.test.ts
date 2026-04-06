import { describe, it, expect, vi, beforeEach } from "vitest";
import { requireAuth } from "@/lib/auth-guard";

const mockGetSession = vi.fn();
const mockGetUser = vi.fn();

vi.mock("@/lib/auth0", () => ({
  auth0: { getSession: () => mockGetSession() },
  getUser: () => mockGetUser(),
}));

describe("requireAuth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns userId when session and user are valid", async () => {
    mockGetSession.mockResolvedValue({ tokenSet: { refreshToken: "rt" } });
    mockGetUser.mockResolvedValue({ sub: "auth0|user123" });

    const result = await requireAuth();

    expect(result.userId).toBe("auth0|user123");
    expect(result.error).toBeUndefined();
  });

  it("returns 401 when no session exists", async () => {
    mockGetSession.mockResolvedValue(null);

    const result = await requireAuth();

    expect(result.userId).toBeUndefined();
    expect(result.error).toBeDefined();
    expect(result.error!.status).toBe(401);
  });

  it("returns 401 when user has no sub claim", async () => {
    mockGetSession.mockResolvedValue({ tokenSet: {} });
    mockGetUser.mockResolvedValue({ email: "test@example.com" });

    const result = await requireAuth();

    expect(result.userId).toBeUndefined();
    expect(result.error!.status).toBe(401);
  });

  it("returns 401 when getUser returns null", async () => {
    mockGetSession.mockResolvedValue({ tokenSet: {} });
    mockGetUser.mockResolvedValue(null);

    const result = await requireAuth();

    expect(result.error!.status).toBe(401);
  });
});
