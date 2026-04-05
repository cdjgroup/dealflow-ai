import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

const {
  mockGetSession,
  mockGetUser,
  mockLimit,
  mockCheckCsrf,
  mockValidateMessages,
  mockStreamText,
  mockStepCountIs,
  mockConvertToModelMessages,
  mockCreateUIMessageStream,
  mockCreateUIMessageStreamResponse,
  mockAttachCircuitBreaker,
} = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockGetUser: vi.fn(),
  mockLimit: vi.fn(),
  mockCheckCsrf: vi.fn(),
  mockValidateMessages: vi.fn(),
  mockStreamText: vi.fn(),
  mockStepCountIs: vi.fn(),
  mockConvertToModelMessages: vi.fn(),
  mockCreateUIMessageStream: vi.fn(),
  mockCreateUIMessageStreamResponse: vi.fn(),
  mockAttachCircuitBreaker: vi.fn(),
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
  validateMessages: (...args: unknown[]) => mockValidateMessages(...args),
}));

vi.mock("ai", () => ({
  streamText: (...args: unknown[]) => mockStreamText(...args),
  stepCountIs: (...args: unknown[]) => mockStepCountIs(...args),
  convertToModelMessages: (...args: unknown[]) =>
    mockConvertToModelMessages(...args),
  createUIMessageStream: (...args: unknown[]) => mockCreateUIMessageStream(...args),
  createUIMessageStreamResponse: (...args: unknown[]) => mockCreateUIMessageStreamResponse(...args),
  tool: (config: unknown) => ({ type: "tool", ...config as Record<string, unknown> }),
}));

vi.mock("@/lib/circuit-breaker", () => ({
  attachCircuitBreaker: (...args: unknown[]) => mockAttachCircuitBreaker(...args),
  RequestToolCounter: class MockRequestToolCounter {
    increment() { return { breached: false, count: 1, limit: 15 }; }
    getCount() { return 0; }
  },
}));

vi.mock("@ai-sdk/anthropic", () => ({
  anthropic: vi.fn(() => "mock-model"),
}));

vi.mock("@/lib/tools/calendar", () => ({
  checkCalendar: { type: "tool", name: "checkCalendar" },
  createCalendarEvent: { type: "tool", name: "createCalendarEvent" },
}));

vi.mock("@/lib/tools/gmail", () => ({
  draftEmail: { type: "tool", name: "draftEmail" },
  searchEmails: { type: "tool", name: "searchEmails" },
}));

vi.mock("@/lib/tools/crm", () => ({
  createCrmTools: vi.fn(() => ({
    getDeals: { type: "tool", name: "getDeals" },
  })),
}));

vi.mock("@/lib/tools/slack", () => ({
  listSlackChannels: { type: "tool", name: "listSlackChannels" },
  sendSlackMessage: { type: "tool", name: "sendSlackMessage" },
}));

vi.mock("@/lib/tools/delegate", () => ({
  createDelegateResearchTool: vi.fn(() => ({ type: "tool", name: "delegateResearch" })),
}));

vi.mock("@/lib/tools/analyze-pipeline", () => ({
  createAnalyzePipelineTool: vi.fn(() => ({ type: "tool", name: "analyzePipeline" })),
}));

vi.mock("@/lib/data/settings", () => ({
  getUserSettings: vi.fn().mockResolvedValue({
    capabilities: { crmRead: true, crmWrite: true, calendar: true, gmail: true, slack: false },
    approvalRequired: { crmWrite: false },
  }),
}));

vi.mock("@/lib/data/audit", () => ({
  writeAuditEntry: vi.fn().mockResolvedValue({}),
}));

vi.mock("@/lib/tools/capability-filter", () => ({
  filterToolsByCapabilities: vi.fn((tools: Record<string, unknown>) => tools),
}));

vi.mock("@/lib/audit-log", () => ({
  logToolExecution: vi.fn(),
}));

vi.mock("@/lib/data/conversations", () => ({
  saveConversation: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/tools/approval-logic", () => ({
  createApprovalCheck: vi.fn(() => undefined),
}));

vi.mock("@/lib/tools/scope-map", () => ({
  TOOL_SCOPE_CONFIG: {},
}));

vi.mock("@/lib/ciba/should-require", () => ({
  shouldRequireCiba: vi.fn(() => false),
}));

vi.mock("@/lib/ciba/authorize", () => ({
  initiateCiba: vi.fn(),
}));

vi.mock("@/lib/ciba/poll", () => ({
  pollCiba: vi.fn(),
}));

vi.mock("@/lib/ciba/session", () => ({
  getCibaSession: vi.fn(),
  storeCibaSession: vi.fn(),
  deleteCibaSession: vi.fn(),
  updateCibaSessionStatus: vi.fn(),
}));

import { POST } from "@/app/api/chat/route";

function makeRequest(body?: object, headers?: Record<string, string>) {
  return new Request("http://localhost/api/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Requested-With": "XMLHttpRequest",
      ...headers,
    },
    body: body ? JSON.stringify(body) : "invalid json{{{",
  });
}

describe("POST /api/chat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCheckCsrf.mockReturnValue(null);
    mockValidateMessages.mockReturnValue(null);
    mockGetSession.mockResolvedValue({ user: {} });
    mockGetUser.mockResolvedValue({ sub: "auth0|user1" });
    mockLimit.mockResolvedValue({ success: true });
    mockConvertToModelMessages.mockResolvedValue([]);
    mockStepCountIs.mockReturnValue(() => false);
    // Circuit breaker passes tools through unchanged by default
    mockAttachCircuitBreaker.mockImplementation((tools: unknown) => tools);
    // createUIMessageStream: capture the execute callback and run it
    mockCreateUIMessageStream.mockImplementation(({ execute }: { execute: (opts: { writer: unknown }) => Promise<void> | void }) => {
      const mockWriter = {
        write: vi.fn(),
        merge: vi.fn(),
      };
      // Store for inspection; await to let streamText get called
      const executePromise = Promise.resolve(execute({ writer: mockWriter })).catch(() => {});
      (mockCreateUIMessageStream as ReturnType<typeof vi.fn>)._executePromise = executePromise;
      (mockCreateUIMessageStream as ReturnType<typeof vi.fn>)._writer = mockWriter;
      return new ReadableStream();
    });
    // createUIMessageStreamResponse: return a 200 Response
    mockCreateUIMessageStreamResponse.mockReturnValue(new Response("stream", { status: 200 }));
    // streamText returns object with toUIMessageStream
    mockStreamText.mockReturnValue({
      toUIMessageStream: vi.fn(() => new ReadableStream()),
    });
  });

  it("should return 403 when CSRF check fails", async () => {
    const csrfResponse = NextResponse.json(
      { error: "Forbidden" },
      { status: 403 }
    );
    mockCheckCsrf.mockReturnValue(csrfResponse);

    const res = await POST(makeRequest({ messages: [], id: "c1" }));

    expect(res.status).toBe(403);
    expect(mockGetSession).not.toHaveBeenCalled();
  });

  it("should return 401 when no session", async () => {
    mockGetSession.mockResolvedValue(null);

    const res = await POST(makeRequest({ messages: [], id: "c1" }));

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("should return 401 when user has no sub", async () => {
    mockGetUser.mockResolvedValue({ sub: undefined });

    const res = await POST(makeRequest({ messages: [], id: "c1" }));

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("should return 429 when rate limited", async () => {
    mockLimit.mockResolvedValue({ success: false });

    const res = await POST(makeRequest({ messages: [], id: "c1" }));

    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toContain("Rate limit");
  });

  it("should return 400 for invalid JSON body", async () => {
    const req = new Request("http://localhost/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Requested-With": "XMLHttpRequest",
      },
      body: "not valid json{{{",
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Invalid request body");
  });

  it("should return 400 when messages is not an array", async () => {
    const res = await POST(
      makeRequest({ messages: "not-array", id: "c1" })
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("messages must be an array");
  });

  it("should return 400 when messages exceed validation limits", async () => {
    const validationResponse = NextResponse.json(
      { error: "Too many messages (max 100)" },
      { status: 400 }
    );
    mockValidateMessages.mockReturnValue(validationResponse);

    const res = await POST(makeRequest({ messages: [], id: "c1" }));

    expect(res.status).toBe(400);
  });

  it("should return stream response on success", async () => {
    const res = await POST(
      makeRequest({
        messages: [{ role: "user", content: "hello" }],
        id: "chat-1",
      })
    );
    // Wait for the async execute callback to complete
    await (mockCreateUIMessageStream as any)._executePromise;

    expect(res.status).toBe(200);
    expect(mockCreateUIMessageStream).toHaveBeenCalledOnce();
    expect(mockCreateUIMessageStreamResponse).toHaveBeenCalledOnce();
    expect(mockStreamText).toHaveBeenCalledOnce();
  });

  it("should pass abortSignal to streamText", async () => {
    await POST(
      makeRequest({
        messages: [{ role: "user", content: "hello" }],
        id: "chat-1",
      })
    );
    await (mockCreateUIMessageStream as any)._executePromise;

    const streamTextCall = mockStreamText.mock.calls[0][0];
    expect(streamTextCall).toHaveProperty("abortSignal");
    expect(streamTextCall.abortSignal).toBeInstanceOf(AbortSignal);
  });

  it("AC-7: should wire circuit breaker into tool pipeline", async () => {
    await POST(
      makeRequest({
        messages: [{ role: "user", content: "hello" }],
        id: "chat-1",
      })
    );

    // attachCircuitBreaker is called synchronously before the stream starts
    expect(mockAttachCircuitBreaker).toHaveBeenCalledOnce();
    expect(mockAttachCircuitBreaker.mock.calls[0][1]).toBe("auth0|user1");
    expect(typeof mockAttachCircuitBreaker.mock.calls[0][2]).toBe("function");
  });

  it("should return 500 when streamText throws", async () => {
    mockCreateUIMessageStream.mockImplementation(() => {
      throw new Error("AI provider error");
    });

    const res = await POST(
      makeRequest({
        messages: [{ role: "user", content: "hello" }],
        id: "chat-1",
      })
    );

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Failed to process chat request");
  });
});
