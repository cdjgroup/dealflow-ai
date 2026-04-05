import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted mocks — must be declared before any imports that trigger module
// evaluation, so vi.hoisted() is used to create the function references first.
// ---------------------------------------------------------------------------
const {
  mockGenerateText,
  mockOutputObject,
  mockGetDeals,
  mockGetContacts,
  mockGetActivities,
  mockGetActions,
  mockCreateAction,
} = vi.hoisted(() => ({
  mockGenerateText: vi.fn(),
  mockOutputObject: vi.fn(),
  mockGetDeals: vi.fn(),
  mockGetContacts: vi.fn(),
  mockGetActivities: vi.fn(),
  mockGetActions: vi.fn(),
  mockCreateAction: vi.fn(),
}));

vi.mock("ai", () => ({
  generateText: (...args: unknown[]) => mockGenerateText(...args),
  Output: { object: (...args: unknown[]) => mockOutputObject(...args) },
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

// Import after mocks are registered
const { createAnalyzePipelineTool } = await import(
  "@/lib/tools/analyze-pipeline"
);

// ---------------------------------------------------------------------------
// Shared test fixtures
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Helper — invoke the tool's execute method with default context args
// ---------------------------------------------------------------------------
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function execTool(tool: { execute?: (...args: any[]) => any }, input: Record<string, unknown> = {}) {
  return tool.execute!(input, {
    toolCallId: "test-call",
    messages: [],
    abortSignal: undefined as unknown as AbortSignal,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("createAnalyzePipelineTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: no pre-existing actions
    mockGetActions.mockResolvedValue([]);
    // Default: createAction resolves with the passed object (no-op)
    mockCreateAction.mockResolvedValue(undefined);
    // Default: one deal, contact, and activity in pipeline
    mockGetDeals.mockResolvedValue([sampleDeal]);
    mockGetContacts.mockResolvedValue([sampleContact]);
    mockGetActivities.mockResolvedValue([sampleActivity]);
  });

  describe("LLM-powered suggestion generation", () => {
    it("AC-1: should call generateText with deal context and store suggestions that include confidence scores", async () => {
      // Arrange — LLM returns one email suggestion with confidence
      mockGenerateText.mockResolvedValue({
        output: {
          suggestions: [
            {
              type: "email",
              priority: "high",
              dealId: "d1",
              dealName: "Acme Platform Deal",
              contactName: "Jane Doe",
              confidence: 0.92,
              justification: "Deal stalled in proposal stage for 14 days; follow-up email is the highest-impact next step.",
              draft: {
                to: "jane@acme.com",
                subject: "Following up on Acme Platform Deal",
                body: "Hi Jane, I wanted to check in on the proposal we sent...",
              },
            },
          ],
        },
      });

      const tool = createAnalyzePipelineTool(TEST_USER);

      // Act
      await execTool(tool);

      // Assert — generateText must have been called (proves LLM path was taken)
      expect(mockGenerateText).toHaveBeenCalledTimes(1);

      // Assert — createAction must have been called with the suggestion including confidence
      expect(mockCreateAction).toHaveBeenCalledWith(
        TEST_USER,
        expect.objectContaining({
          type: "email",
          priority: "high",
          dealId: "d1",
          confidence: 0.92,
          justification: expect.stringContaining("proposal stage"),
        })
      );
    });

    it("AC-1: should pass deal context (dealId, stage, contact name, activity summary) in the LLM prompt", async () => {
      // Arrange
      mockGenerateText.mockResolvedValue({
        output: { suggestions: [] },
      });

      const tool = createAnalyzePipelineTool(TEST_USER);

      // Act
      await execTool(tool);

      // Assert — the prompt argument passed to generateText must contain deal context
      const callArgs = mockGenerateText.mock.calls[0][0] as Record<string, unknown>;
      const promptStr = JSON.stringify(callArgs.prompt ?? callArgs);
      expect(promptStr).toContain("Acme Platform Deal");
    });

    it("AC-2: should map email suggestion to createAction with EmailDraft shape", async () => {
      // Arrange
      mockGenerateText.mockResolvedValue({
        output: {
          suggestions: [
            {
              type: "email",
              priority: "high",
              dealId: "d1",
              dealName: "Acme Platform Deal",
              contactName: "Jane Doe",
              confidence: 0.85,
              justification: "No activity in 10 days",
              draft: {
                to: "jane@acme.com",
                subject: "Check-in on proposal",
                body: "Hi Jane...",
              },
            },
          ],
        },
      });

      const tool = createAnalyzePipelineTool(TEST_USER);

      // Act
      await execTool(tool);

      // Assert — createAction draft matches EmailDraft schema (to/subject/body)
      expect(mockCreateAction).toHaveBeenCalledWith(
        TEST_USER,
        expect.objectContaining({
          type: "email",
          draft: expect.objectContaining({
            to: "jane@acme.com",
            subject: expect.any(String),
            body: expect.any(String),
          }),
        })
      );
    });

    it("AC-2: should map calendar suggestion to createAction with CalendarDraft shape", async () => {
      // Arrange
      mockGenerateText.mockResolvedValue({
        output: {
          suggestions: [
            {
              type: "calendar",
              priority: "medium",
              dealId: "d1",
              dealName: "Acme Platform Deal",
              contactName: "Jane Doe",
              confidence: 0.72,
              justification: "Demo not yet scheduled",
              draft: {
                title: "Product Demo with Jane",
                date: "2026-04-10",
                time: "14:00",
                duration: 60,
                attendees: ["jane@acme.com"],
              },
            },
          ],
        },
      });

      const tool = createAnalyzePipelineTool(TEST_USER);

      // Act
      await execTool(tool);

      // Assert — draft matches CalendarDraft schema
      expect(mockCreateAction).toHaveBeenCalledWith(
        TEST_USER,
        expect.objectContaining({
          type: "calendar",
          draft: expect.objectContaining({
            title: expect.any(String),
            date: expect.any(String),
            time: expect.any(String),
            duration: expect.any(Number),
            attendees: expect.arrayContaining(["jane@acme.com"]),
          }),
        })
      );
    });

    it("AC-2: should map slack suggestion to createAction with SlackDraft shape", async () => {
      // Arrange
      mockGenerateText.mockResolvedValue({
        output: {
          suggestions: [
            {
              type: "slack",
              priority: "low",
              dealId: "d1",
              dealName: "Acme Platform Deal",
              contactName: "Jane Doe",
              confidence: 0.60,
              justification: "Quick channel update needed",
              draft: {
                channel: "sales-team",
                message: "Acme deal update: proposal sent, awaiting response.",
              },
            },
          ],
        },
      });

      const tool = createAnalyzePipelineTool(TEST_USER);

      // Act
      await execTool(tool);

      // Assert — draft matches SlackDraft schema
      expect(mockCreateAction).toHaveBeenCalledWith(
        TEST_USER,
        expect.objectContaining({
          type: "slack",
          draft: expect.objectContaining({
            channel: expect.any(String),
            message: expect.any(String),
          }),
        })
      );
    });
  });

  describe("Heuristic fallback", () => {
    it("AC-3: should fall back to heuristic suggestions when generateText throws a network error", async () => {
      // Arrange — LLM call fails with a network error
      mockGenerateText.mockRejectedValue(new Error("fetch failed: connection refused"));

      const tool = createAnalyzePipelineTool(TEST_USER);

      // Act
      const result = await execTool(tool);

      // Assert — createAction is still called (heuristic logic ran)
      expect(mockCreateAction).toHaveBeenCalled();

      // Assert — no error is surfaced in the return value
      expect(result).not.toHaveProperty("error");
      expect(JSON.stringify(result)).not.toContain("connection refused");
    });

    it("AC-3: should fall back when generateText returns malformed JSON that fails Zod parsing", async () => {
      // Arrange — LLM returns invalid structure (missing required fields)
      mockGenerateText.mockResolvedValue({
        output: null, // malformed — Zod parse would fail
      });

      const tool = createAnalyzePipelineTool(TEST_USER);

      // Act — should not throw
      const result = await execTool(tool);

      // Assert — heuristic path ran and created at least one action, or returned a safe message
      // (Either createAction was called OR result.message describes what happened — but no error thrown)
      const resultStr = JSON.stringify(result);
      expect(resultStr).not.toContain("ZodError");
      expect(resultStr).not.toContain("Cannot read properties of null");
    });

    it("AC-3: should fall back when generateText times out (AbortError)", async () => {
      // Arrange
      const abortError = new Error("The operation was aborted");
      abortError.name = "AbortError";
      mockGenerateText.mockRejectedValue(abortError);

      const tool = createAnalyzePipelineTool(TEST_USER);

      // Act
      const result = await execTool(tool);

      // Assert — no error exposed, heuristic suggestions created
      expect(mockCreateAction).toHaveBeenCalled();
      expect(result).not.toHaveProperty("error");
    });
  });

  describe("Empty pipeline guard", () => {
    it("should NOT call generateText when there are no deals", async () => {
      // Arrange — empty pipeline
      mockGetDeals.mockResolvedValue([]);

      const tool = createAnalyzePipelineTool(TEST_USER);

      // Act
      const result = await execTool(tool);

      // Assert — no LLM call, no actions created
      expect(mockGenerateText).not.toHaveBeenCalled();
      expect(mockCreateAction).not.toHaveBeenCalled();

      // Assert — response message indicates the empty state
      const resultStr = JSON.stringify(result).toLowerCase();
      expect(resultStr).toMatch(/no deals|empty pipeline|no active deals/);
    });
  });

  describe("Deduplication", () => {
    it("should NOT suggest an action for a deal+type combo that already has a pending action", async () => {
      // Arrange — d1 already has a pending email action
      mockGetActions.mockResolvedValue([
        {
          id: "existing1",
          userId: TEST_USER,
          type: "email",
          status: "pending",
          priority: "high",
          dealId: "d1",
          dealName: "Acme Platform Deal",
          contactName: "Jane Doe",
          justification: "Earlier suggestion",
          draft: { to: "jane@acme.com", subject: "Old subject", body: "Old body" },
          createdAt: "2026-04-01T08:00:00Z",
          updatedAt: "2026-04-01T08:00:00Z",
        },
      ]);

      // LLM tries to suggest an email for the same deal
      mockGenerateText.mockResolvedValue({
        output: {
          suggestions: [
            {
              type: "email",
              priority: "high",
              dealId: "d1",
              dealName: "Acme Platform Deal",
              contactName: "Jane Doe",
              confidence: 0.88,
              justification: "Duplicate suggestion",
              draft: {
                to: "jane@acme.com",
                subject: "Duplicate follow-up",
                body: "Hi again...",
              },
            },
          ],
        },
      });

      const tool = createAnalyzePipelineTool(TEST_USER);

      // Act
      await execTool(tool);

      // Assert — createAction must NOT have been called for the duplicate combo
      const calls = mockCreateAction.mock.calls;
      const duplicateCall = calls.find(
        (args) =>
          args[1]?.dealId === "d1" && args[1]?.type === "email"
      );
      expect(duplicateCall).toBeUndefined();
    });
  });

  describe("AC-12: confidence field is optional", () => {
    it("should call createAction with confidence when LLM provides it", async () => {
      // Arrange — LLM includes confidence
      mockGenerateText.mockResolvedValue({
        output: {
          suggestions: [
            {
              type: "email",
              priority: "medium",
              dealId: "d1",
              dealName: "Acme Platform Deal",
              contactName: "Jane Doe",
              confidence: 0.77,
              justification: "Scheduled touch-point",
              draft: { to: "jane@acme.com", subject: "Check-in", body: "Hi" },
            },
          ],
        },
      });

      const tool = createAnalyzePipelineTool(TEST_USER);

      // Act
      await execTool(tool);

      // Assert — confidence is passed through to createAction
      expect(mockCreateAction).toHaveBeenCalledWith(
        TEST_USER,
        expect.objectContaining({ confidence: 0.77 })
      );
    });

    it("should accept createAction being called without a confidence field (heuristic path)", async () => {
      // Arrange — LLM fails so heuristic runs; heuristic does NOT set confidence
      mockGenerateText.mockRejectedValue(new Error("LLM unavailable"));

      const tool = createAnalyzePipelineTool(TEST_USER);

      // Act
      await execTool(tool);

      // Assert — createAction was called, and the calls that lack confidence do not cause errors
      // (i.e., confidence is optional — undefined is acceptable)
      const calls = mockCreateAction.mock.calls;
      expect(calls.length).toBeGreaterThan(0);
      calls.forEach((args) => {
        // confidence may be undefined — that is fine; just must not be NaN or out of range
        const action = args[1];
        if (action?.confidence !== undefined) {
          expect(action.confidence).toBeGreaterThanOrEqual(0);
          expect(action.confidence).toBeLessThanOrEqual(1);
        }
      });
    });
  });
});
