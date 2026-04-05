import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockGetSession,
  mockGetUser,
  mockCheckCsrf,
  mockListMcpClients,
  mockCreateMcpClient,
} = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockGetUser: vi.fn(),
  mockCheckCsrf: vi.fn(),
  mockListMcpClients: vi.fn(),
  mockCreateMcpClient: vi.fn(),
}));

vi.mock("@/lib/auth0", () => ({
  auth0: { getSession: mockGetSession },
  getUser: mockGetUser,
}));

vi.mock("@/lib/api-guard", () => ({
  checkCsrf: (...args: unknown[]) => mockCheckCsrf(...args),
}));

vi.mock("@/lib/data/mcp-clients", () => ({
  listMcpClients: (...args: unknown[]) => mockListMcpClients(...args),
  createMcpClient: (...args: unknown[]) => mockCreateMcpClient(...args),
  toClientResponse: (client: Record<string, unknown>) => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { apiKeyHash, ...safe } = client;
    return safe;
  },
}));

import { GET, POST } from "@/app/api/mcp/clients/route";

function makeRequest(method: string, body?: unknown) {
  const init: RequestInit = {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-Requested-With": "XMLHttpRequest",
    },
  };
  if (body) init.body = JSON.stringify(body);
  return new Request("http://localhost/api/mcp/clients", init);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/mcp/clients", () => {
  it("AC-19: returns 401 when unauthenticated", async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns list of clients when authenticated", async () => {
    mockGetSession.mockResolvedValue({ user: {} });
    mockGetUser.mockResolvedValue({ sub: "user-123" });
    mockListMcpClients.mockResolvedValue([
      { id: "c1", name: "Bot-A", allowedTools: ["listDeals"] },
    ]);

    const res = await GET();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveLength(1);
    expect(data[0].name).toBe("Bot-A");
  });
});

describe("POST /api/mcp/clients", () => {
  it("AC-20: returns 403 without CSRF header", async () => {
    mockCheckCsrf.mockReturnValue(
      new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 })
    );

    const req = new Request("http://localhost/api/mcp/clients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Test" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(403);
  });

  it("AC-19: returns 401 when unauthenticated", async () => {
    mockCheckCsrf.mockReturnValue(null);
    mockGetSession.mockResolvedValue(null);

    const res = await POST(makeRequest("POST", { name: "Test" }));
    expect(res.status).toBe(401);
  });

  it("AC-21: returns 201 with client and rawApiKey on success", async () => {
    mockCheckCsrf.mockReturnValue(null);
    mockGetSession.mockResolvedValue({ user: {} });
    mockGetUser.mockResolvedValue({ sub: "user-123" });
    mockCreateMcpClient.mockResolvedValue({
      client: { id: "c1", name: "Bot-A", allowedTools: ["listDeals"] },
      rawApiKey: "dfk_secretkey123",
    });

    const res = await POST(makeRequest("POST", { name: "Bot-A" }));
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.client.name).toBe("Bot-A");
    expect(data.rawApiKey).toBe("dfk_secretkey123");
  });

  it("returns 400 for invalid input", async () => {
    mockCheckCsrf.mockReturnValue(null);
    mockGetSession.mockResolvedValue({ user: {} });
    mockGetUser.mockResolvedValue({ sub: "user-123" });

    const res = await POST(makeRequest("POST", { name: "" }));
    expect(res.status).toBe(400);
  });
});
