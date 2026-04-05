import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockGenerateText,
  mockGetDeals,
  mockGetContacts,
  mockGetActivities,
  mockGetActions,
  mockCreateAction,
} = vi.hoisted(() => ({
  mockGenerateText: vi.fn(),
  mockGetDeals: vi.fn(),
  mockGetContacts: vi.fn(),
  mockGetActivities: vi.fn(),
  mockGetActions: vi.fn(),
  mockCreateAction: vi.fn(),
}));

vi.mock("ai", () => ({
  generateText: (...args: unknown[]) => mockGenerateText(...args),
  tool: (config: unknown) => ({ type: "tool", ...(config as Record<string, unknown>) }),
}));

vi.mock("@ai-sdk/anthropic", () => ({
  anthropic: vi.fn(() => "mock-model"),
}));

vi.mock("@/lib/data/crm", () => ({
  getDeals: (...args: unknown[]) => mockGetDeals(...args),
  getContacts: (...args: unknown[]) => mockGetContacts(...args),
  getActivities: (...args: unknown[]) => mockGetActivities(...args),
}));

vi.mock("@/lib/data/actions", () => ({
  getActions: (...args: unknown[]) => mockGetActions(...args),
  createAction: (...args: unknown[]) => mockCreateAction(...args),
}));

vi.mock("@/lib/data/settings", () => ({
  getUserSettings: vi.fn().mockResolvedValue({
    capabilities: { crmRead: true, crmWrite: true, calendar: true, gmail: true, slack: false },
    approvalRequired: { crmWrite: false },
    toolTrust: {},
    schedule: { enabled: false, hours: [], timezone: "UTC" },
    autonomyLevel: 1,
  }),
}));

const { createAnalyzePipelineTool } = await import("@/lib/tools/analyze-pipeline");

const TEST_USER = "auth0|testuser123";

const sampleDeal = {
  id: "d1",
  name: "Acme Platform Deal",
  company: "Acme",
  value: 75000,
  stage: "proposal",
  contactId: "c1",
  createdAt: "2026-04-01T00:00:00Z",
  updatedAt: "2026-04-01T00:00:00Z",
};

const sampleContact = {
  id: "c1",
  name: "Jane Doe",
  email: "jane@acme.com",
  company: "Acme",
  role: "VP Sales",
  createdAt: "2026-04-01T00:00:00Z",
};

const sampleActivity = {
  id: "act1",
  dealId: "d1",
  contactId: "c1",
  type: "email",
  summary: "Sent initial proposal",
  createdAt: "2026-04-01T00:00:00Z",
};

function llmResponse(suggestions: unknown[]) {
  return { text: JSON.stringify({ suggestions }) };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function execTool(tool: { execute?: (...args: any[]) => any }, input: Record<string, unknown> = {}) {
  return tool.execute!(input, {
    toolCallId: "test-call",
    messages: [],
    abortSignal: undefined as unknown as AbortSignal,
  });
}

describe("createAnalyzePipelineTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetActions.mockResolvedValue([]);
    mockCreateAction.mockResolvedValue(undefined);
    mockGetDeals.mockResolvedValue([sampleDeal]);
    mockGetContacts.mockResolvedValue([sampleContact]);
    mockGetActivities.mockResolvedValue([sampleActivity]);
  });

  describe("LLM-powered suggestion generation", () => {
    it("AC-1: should call generateText and store suggestions with confidence scores", async () => {
      mockGenerateText.mockResolvedValue(llmResponse([{
        type: "email", priority: "high", dealId: "d1", dealName: "Acme Platform Deal",
        contactName: "Jane Doe", confidence: 0.92,
        justification: "Deal stalled in proposal stage for 14 days.",
        draft: { to: "jane@acme.com", subject: "Following up on Acme Platform Deal", body: "Hi Jane, I wanted to check in..." },
      }]));

      const tool = createAnalyzePipelineTool(TEST_USER);
      await execTool(tool);

      expect(mockGenerateText).toHaveBeenCalledTimes(1);
      expect(mockCreateAction).toHaveBeenCalledWith(TEST_USER, expect.objectContaining({
        type: "email", priority: "high", dealId: "d1", confidence: 0.92,
        justification: expect.stringContaining("proposal stage"),
      }));
    });

    it("AC-1: should pass deal context in the LLM prompt", async () => {
      mockGenerateText.mockResolvedValue(llmResponse([]));
      const tool = createAnalyzePipelineTool(TEST_USER);
      await execTool(tool);

      const callArgs = mockGenerateText.mock.calls[0][0] as Record<string, unknown>;
      const promptStr = JSON.stringify(callArgs.prompt ?? callArgs);
      expect(promptStr).toContain("Acme Platform Deal");
    });

    it("AC-2: should map email suggestion with EmailDraft shape", async () => {
      mockGenerateText.mockResolvedValue(llmResponse([{
        type: "email", priority: "high", dealId: "d1", dealName: "Acme Platform Deal",
        contactName: "Jane Doe", confidence: 0.85, justification: "No activity in 10 days",
        draft: { to: "jane@acme.com", subject: "Check-in on proposal", body: "Hi Jane..." },
      }]));

      const tool = createAnalyzePipelineTool(TEST_USER);
      await execTool(tool);

      expect(mockCreateAction).toHaveBeenCalledWith(TEST_USER, expect.objectContaining({
        type: "email",
        draft: expect.objectContaining({ to: "jane@acme.com", subject: expect.any(String), body: expect.any(String) }),
      }));
    });

    it("AC-2: should map calendar suggestion with CalendarDraft shape", async () => {
      mockGenerateText.mockResolvedValue(llmResponse([{
        type: "calendar", priority: "medium", dealId: "d1", dealName: "Acme Platform Deal",
        contactName: "Jane Doe", confidence: 0.72, justification: "Demo not yet scheduled",
        draft: { title: "Product Demo with Jane", date: "2026-04-10", time: "14:00", duration: 60, attendees: ["jane@acme.com"] },
      }]));

      const tool = createAnalyzePipelineTool(TEST_USER);
      await execTool(tool);

      expect(mockCreateAction).toHaveBeenCalledWith(TEST_USER, expect.objectContaining({
        type: "calendar",
        draft: expect.objectContaining({ title: expect.any(String), date: expect.any(String), duration: expect.any(Number) }),
      }));
    });

    it("AC-2: should map slack suggestion with SlackDraft shape", async () => {
      mockGenerateText.mockResolvedValue(llmResponse([{
        type: "slack", priority: "low", dealId: "d1", dealName: "Acme Platform Deal",
        contactName: "Jane Doe", confidence: 0.60, justification: "Quick channel update needed",
        draft: { channel: "#sales-team", message: "Acme deal update: proposal sent." },
      }]));

      const tool = createAnalyzePipelineTool(TEST_USER);
      await execTool(tool);

      expect(mockCreateAction).toHaveBeenCalledWith(TEST_USER, expect.objectContaining({
        type: "slack",
        draft: expect.objectContaining({ channel: expect.any(String), message: expect.any(String) }),
      }));
    });
  });

  describe("Heuristic fallback", () => {
    it("AC-3: should fall back when generateText throws", async () => {
      mockGenerateText.mockRejectedValue(new Error("fetch failed"));
      const tool = createAnalyzePipelineTool(TEST_USER);
      const result = await execTool(tool);

      expect(mockCreateAction).toHaveBeenCalled();
      expect(result).not.toHaveProperty("error");
    });

    it("AC-3: should fall back when generateText returns malformed text", async () => {
      mockGenerateText.mockResolvedValue({ text: "not valid json at all" });
      const tool = createAnalyzePipelineTool(TEST_USER);
      const result = await execTool(tool);

      expect(JSON.stringify(result)).not.toContain("Unexpected token");
    });

    it("AC-3: should fall back on AbortError", async () => {
      const err = new Error("aborted");
      err.name = "AbortError";
      mockGenerateText.mockRejectedValue(err);

      const tool = createAnalyzePipelineTool(TEST_USER);
      const result = await execTool(tool);

      expect(mockCreateAction).toHaveBeenCalled();
      expect(result).not.toHaveProperty("error");
    });
  });

  describe("Empty pipeline", () => {
    it("should NOT call generateText when no deals", async () => {
      mockGetDeals.mockResolvedValue([]);
      const tool = createAnalyzePipelineTool(TEST_USER);
      const result = await execTool(tool);

      expect(mockGenerateText).not.toHaveBeenCalled();
      expect(mockCreateAction).not.toHaveBeenCalled();
      expect(JSON.stringify(result).toLowerCase()).toMatch(/no deals/);
    });
  });

  describe("Deduplication", () => {
    it("should skip actions for existing deal+type combos", async () => {
      mockGetActions.mockResolvedValue([{
        id: "existing1", userId: TEST_USER, type: "email", status: "pending", priority: "high",
        dealId: "d1", dealName: "Acme Platform Deal", contactName: "Jane Doe",
        justification: "Earlier", draft: { to: "jane@acme.com", subject: "Old", body: "Old" },
        createdAt: "2026-04-01T08:00:00Z", updatedAt: "2026-04-01T08:00:00Z",
      }]);

      mockGenerateText.mockResolvedValue(llmResponse([{
        type: "email", priority: "high", dealId: "d1", dealName: "Acme Platform Deal",
        contactName: "Jane Doe", confidence: 0.88, justification: "Duplicate",
        draft: { to: "jane@acme.com", subject: "Dup", body: "Hi" },
      }]));

      const tool = createAnalyzePipelineTool(TEST_USER);
      await execTool(tool);

      const dup = mockCreateAction.mock.calls.find((a) => a[1]?.dealId === "d1" && a[1]?.type === "email");
      expect(dup).toBeUndefined();
    });
  });

  describe("Confidence", () => {
    it("should pass confidence from LLM to createAction", async () => {
      mockGenerateText.mockResolvedValue(llmResponse([{
        type: "email", priority: "medium", dealId: "d1", dealName: "Acme Platform Deal",
        contactName: "Jane Doe", confidence: 0.77, justification: "Touch-point",
        draft: { to: "jane@acme.com", subject: "Check-in", body: "Hi" },
      }]));

      const tool = createAnalyzePipelineTool(TEST_USER);
      await execTool(tool);

      expect(mockCreateAction).toHaveBeenCalledWith(TEST_USER, expect.objectContaining({ confidence: 0.77 }));
    });

    it("should work without confidence (heuristic path)", async () => {
      mockGenerateText.mockRejectedValue(new Error("LLM unavailable"));
      const tool = createAnalyzePipelineTool(TEST_USER);
      await execTool(tool);

      expect(mockCreateAction.mock.calls.length).toBeGreaterThan(0);
    });
  });
});
