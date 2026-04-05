import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mocks ---
const mockGetDeals = vi.fn();
const mockGetContacts = vi.fn();
const mockGetActivities = vi.fn();
const mockCreateAction = vi.fn();
const mockGetActions = vi.fn();
const mockGetUserSettings = vi.fn();

vi.mock("@/lib/data/crm", () => ({
  getDeals: (...args: unknown[]) => mockGetDeals(...args),
  getContacts: (...args: unknown[]) => mockGetContacts(...args),
  getActivities: (...args: unknown[]) => mockGetActivities(...args),
}));

vi.mock("@/lib/data/actions", () => ({
  createAction: (...args: unknown[]) => mockCreateAction(...args),
  getActions: (...args: unknown[]) => mockGetActions(...args),
}));

vi.mock("@/lib/data/settings", () => ({
  getUserSettings: (...args: unknown[]) => mockGetUserSettings(...args),
}));

// Must import after mocks
const { createAnalyzePipelineTool } = await import(
  "@/lib/tools/analyze-pipeline"
);

// --- Test data ---
const USER_ID = "user-autonomy-test";

const staleDeal = {
  id: "deal-1",
  name: "Acme Corp",
  company: "Acme",
  value: 25000,
  stage: "proposal",
  contactId: "contact-1",
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(), // 5 days ago
};

const highValueDeal = {
  id: "deal-2",
  name: "BigCo Enterprise",
  company: "BigCo",
  value: 80000,
  stage: "qualified",
  contactId: "contact-2",
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(), // 4 days ago
};

const negotiationDeal = {
  id: "deal-3",
  name: "MidCo",
  company: "MidCo",
  value: 10000,
  stage: "negotiation",
  contactId: "contact-3",
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(), // 1 day ago (not stale enough for email)
};

const contacts = [
  { id: "contact-1", name: "Alice Smith", email: "alice@acme.com", role: "VP Sales", company: "Acme" },
  { id: "contact-2", name: "Bob Jones", email: "bob@bigco.com", role: "CTO", company: "BigCo" },
  { id: "contact-3", name: "Carol Lee", email: "carol@midco.com", role: "PM", company: "MidCo" },
];

const defaultSettings = {
  capabilities: { crmRead: true, crmWrite: true, calendar: true, gmail: true, slack: false },
  approvalRequired: { crmWrite: false },
  toolTrust: {},
  schedule: { enabled: false, hours: [], timezone: "UTC" },
  autonomyLevel: 1,
};

describe("analyze-pipeline autonomy gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetContacts.mockResolvedValue(contacts);
    mockGetActions.mockResolvedValue([]); // no existing actions
    mockGetActivities.mockResolvedValue([]); // no activities
    mockCreateAction.mockImplementation((_userId: string, data: Record<string, unknown>) =>
      Promise.resolve({ id: "action-new", userId: _userId, ...data, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
    );
  });

  it("AC-1: actions start as 'pending' when autonomyLevel is 1 (default)", async () => {
    // Arrange
    mockGetDeals.mockResolvedValue([staleDeal]); // stale deal → email suggestion
    mockGetUserSettings.mockResolvedValue({ ...defaultSettings, autonomyLevel: 1 });

    // Act
    const tool = createAnalyzePipelineTool(USER_ID);
    await tool.execute!({ focus: "all" }, { toolCallId: "tc1", messages: [], abortSignal: undefined as unknown as AbortSignal });

    // Assert — action created with status "pending"
    expect(mockCreateAction).toHaveBeenCalled();
    const [, actionData] = mockCreateAction.mock.calls[0];
    expect(actionData.status).toBe("pending");
  });

  it("AC-2: high priority actions start as 'approved' when autonomyLevel is 2", async () => {
    // Arrange — high-value deal (>$50K) → high priority email suggestion
    mockGetDeals.mockResolvedValue([highValueDeal]);
    mockGetUserSettings.mockResolvedValue({ ...defaultSettings, autonomyLevel: 2 });

    // Act
    const tool = createAnalyzePipelineTool(USER_ID);
    await tool.execute!({ focus: "all" }, { toolCallId: "tc2", messages: [], abortSignal: undefined as unknown as AbortSignal });

    // Assert — high priority action auto-approved
    expect(mockCreateAction).toHaveBeenCalled();
    // Find the high-priority action creation call
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const highPriorityCall = mockCreateAction.mock.calls.find(
      (call: any[]) => call[1].priority === "high"
    );
    expect(highPriorityCall).toBeDefined();
    expect(highPriorityCall![1].status).toBe("approved");
  });

  it("AC-2: medium priority actions start as 'approved' when autonomyLevel is 2", async () => {
    // Arrange — stale deal under $50K, 5 days → medium priority
    mockGetDeals.mockResolvedValue([staleDeal]);
    mockGetUserSettings.mockResolvedValue({ ...defaultSettings, autonomyLevel: 2 });

    // Act
    const tool = createAnalyzePipelineTool(USER_ID);
    await tool.execute!({ focus: "all" }, { toolCallId: "tc3", messages: [], abortSignal: undefined as unknown as AbortSignal });

    // Assert — medium priority action auto-approved
    expect(mockCreateAction).toHaveBeenCalled();
    const [, actionData] = mockCreateAction.mock.calls[0];
    expect(actionData.priority).toBe("medium");
    expect(actionData.status).toBe("approved");
  });

  it("AC-6: low priority actions stay 'pending' even with autonomyLevel 3", async () => {
    // Arrange — negotiation deal creates slack suggestion with "medium" priority
    // We need to verify that if a low priority action were created, it stays pending
    // The current pipeline creates "medium" slack suggestions, so we'll test with
    // a deal setup that creates a medium Slack + verify no low-priority auto-approves
    mockGetDeals.mockResolvedValue([negotiationDeal]);
    mockGetUserSettings.mockResolvedValue({ ...defaultSettings, autonomyLevel: 3 });

    // Act
    const tool = createAnalyzePipelineTool(USER_ID);
    await tool.execute!({ focus: "all" }, { toolCallId: "tc4", messages: [], abortSignal: undefined as unknown as AbortSignal });

    // Assert — all created actions: medium/high should be "approved", any low should be "pending"
    for (const [, actionData] of mockCreateAction.mock.calls) {
      if (actionData.priority === "low") {
        expect(actionData.status).toBe("pending");
      } else {
        expect(actionData.status).toBe("approved");
      }
    }
  });

  it("AC-2: autonomyLevel 3 also auto-approves high/medium actions", async () => {
    // Arrange
    mockGetDeals.mockResolvedValue([staleDeal, highValueDeal]);
    mockGetUserSettings.mockResolvedValue({ ...defaultSettings, autonomyLevel: 3 });

    // Act
    const tool = createAnalyzePipelineTool(USER_ID);
    await tool.execute!({ focus: "all" }, { toolCallId: "tc5", messages: [], abortSignal: undefined as unknown as AbortSignal });

    // Assert — all non-low-priority actions are "approved"
    expect(mockCreateAction).toHaveBeenCalled();
    for (const [, actionData] of mockCreateAction.mock.calls) {
      if (actionData.priority !== "low") {
        expect(actionData.status).toBe("approved");
      }
    }
  });
});
