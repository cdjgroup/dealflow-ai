import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SuggestedAction } from "@/lib/types/actions";
import type { TrustStats } from "@/lib/types/settings";

// --- Mocks (defined before dynamic imports so vi.mock hoisting picks them up) ---

const mockRequireAuth = vi.fn();
const mockCheckCsrf = vi.fn();
const mockGetAction = vi.fn();
const mockUpdateAction = vi.fn();
const mockGetUserSettings = vi.fn();
const mockIncrementTrustStat = vi.fn();
const mockGetTrustStats = vi.fn();

vi.mock("@/lib/auth-guard", () => ({
  requireAuth: (...args: unknown[]) => mockRequireAuth(...args),
}));

vi.mock("@/lib/api-guard", () => ({
  checkCsrf: (...args: unknown[]) => mockCheckCsrf(...args),
}));

vi.mock("@/lib/data/actions", () => ({
  getAction: (...args: unknown[]) => mockGetAction(...args),
  updateAction: (...args: unknown[]) => mockUpdateAction(...args),
  // batch route
  batchUpdateStatus: vi.fn().mockResolvedValue([]),
  getActions: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/lib/data/settings", () => ({
  getUserSettings: (...args: unknown[]) => mockGetUserSettings(...args),
  incrementTrustStat: (...args: unknown[]) => mockIncrementTrustStat(...args),
  getTrustStats: (...args: unknown[]) => mockGetTrustStats(...args),
}));

// Dynamic imports after mocks are registered
const { PUT } = await import("@/app/api/actions/[id]/route");
const { POST } = await import("@/app/api/actions/batch/route");

// --- Helpers ---

function makeEmailAction(overrides: Partial<SuggestedAction> = {}): SuggestedAction {
  return {
    id: "action-1",
    userId: "user-123",
    type: "email",
    status: "approved",
    priority: "high",
    dealId: "deal-1",
    dealName: "Acme Corp",
    contactName: "Alice",
    justification: "Follow up on proposal",
    draft: { to: "alice@acme.com", subject: "Proposal", body: "Hi Alice" },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makePutRequest(actionId: string, body: Record<string, unknown>) {
  return new Request(`http://localhost/api/actions/${actionId}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "X-Requested-With": "XMLHttpRequest",
    },
    body: JSON.stringify(body),
  });
}

function makePostRequest(body: Record<string, unknown>) {
  return new Request("http://localhost/api/actions/batch", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Requested-With": "XMLHttpRequest",
    },
    body: JSON.stringify(body),
  });
}

const baseSettings = {
  capabilities: { crmRead: true, crmWrite: true, calendar: true, gmail: true, slack: false },
  approvalRequired: { crmWrite: false },
  toolTrust: {},
  schedule: { enabled: false, hours: [], timezone: "UTC" },
  autonomyLevel: 1 as const,
};

const thresholdMetStats: TrustStats = {
  email: { approved: 5, dismissed: 0 },
  calendar: { approved: 0, dismissed: 0 },
  slack: { approved: 0, dismissed: 0 },
};

const belowThresholdStats: TrustStats = {
  email: { approved: 3, dismissed: 0 },
  calendar: { approved: 0, dismissed: 0 },
  slack: { approved: 0, dismissed: 0 },
};

// --- Tests ---

describe("trust calibration nudge integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default: auth succeeds, CSRF passes
    mockRequireAuth.mockResolvedValue({ userId: "user-123" });
    mockCheckCsrf.mockReturnValue(null);

    // Default action returned by getAction
    mockGetAction.mockResolvedValue(makeEmailAction({ status: "pending" }));

    // Default updateAction returns the approved version
    mockUpdateAction.mockResolvedValue(makeEmailAction({ status: "approved" }));

    // Default: no outstanding trust stats (below threshold)
    mockGetUserSettings.mockResolvedValue({ ...baseSettings });
    mockIncrementTrustStat.mockResolvedValue(undefined);
    mockGetTrustStats.mockResolvedValue(belowThresholdStats);
  });

  describe("PUT /api/actions/:id (single action)", () => {
    it("AC-1: returns nudge when approve pushes email stats past threshold", async () => {
      // Arrange — toolTrust.draftEmail is unset (defaults to "ask" behaviour),
      // and after increment the email bucket has 5 approvals with 0 dismissals.
      mockGetTrustStats.mockResolvedValue(thresholdMetStats);

      const req = makePutRequest("action-1", { status: "approved" });
      // Next.js dynamic-route params passed as second argument
      const params = Promise.resolve({ id: "action-1" });

      // Act
      const res = await PUT(req, { params });
      const body = await res.json();

      // Assert — response must include a nudge pointing to draftEmail → "always"
      expect(res.status).toBe(200);
      expect(body).toHaveProperty("nudge");
      expect(body.nudge).toMatchObject({
        tool: "draftEmail",
        suggestedTrust: "always",
      });
    });

    it("returns no nudge when approve keeps email stats below threshold (3 approvals)", async () => {
      // Arrange — only 3 approvals, threshold is 5
      mockGetTrustStats.mockResolvedValue(belowThresholdStats);

      const req = makePutRequest("action-1", { status: "approved" });
      const params = Promise.resolve({ id: "action-1" });

      // Act
      const res = await PUT(req, { params });
      const body = await res.json();

      // Assert — no nudge present
      expect(res.status).toBe(200);
      expect(body).not.toHaveProperty("nudge");
    });

    it("returns no nudge when action is dismissed (trust stat not in approve path)", async () => {
      // Arrange — dismissed action; even if stats are high, no nudge expected on dismiss
      mockGetTrustStats.mockResolvedValue(thresholdMetStats);
      mockUpdateAction.mockResolvedValue(makeEmailAction({ status: "dismissed" }));

      const req = makePutRequest("action-1", { status: "dismissed" });
      const params = Promise.resolve({ id: "action-1" });

      // Act
      const res = await PUT(req, { params });
      const body = await res.json();

      // Assert
      expect(res.status).toBe(200);
      expect(body).not.toHaveProperty("nudge");
    });

    it("AC-8: returns 200 with action but no nudge when getTrustStats throws", async () => {
      // Arrange — graduation check throws; endpoint must degrade gracefully
      mockGetTrustStats.mockRejectedValue(new Error("Redis connection timeout"));

      const req = makePutRequest("action-1", { status: "approved" });
      const params = Promise.resolve({ id: "action-1" });

      // Act
      const res = await PUT(req, { params });
      const body = await res.json();

      // Assert — action still updated, no nudge, no 500
      expect(res.status).toBe(200);
      expect(body).toHaveProperty("action");
      expect(body).not.toHaveProperty("nudge");
    });

    it("returns no nudge when toolTrust for draftEmail is already 'always'", async () => {
      // Arrange — user has already graduated draftEmail to "always"; no further nudge needed
      mockGetUserSettings.mockResolvedValue({
        ...baseSettings,
        toolTrust: { draftEmail: "always" },
      });
      mockGetTrustStats.mockResolvedValue(thresholdMetStats);

      const req = makePutRequest("action-1", { status: "approved" });
      const params = Promise.resolve({ id: "action-1" });

      // Act
      const res = await PUT(req, { params });
      const body = await res.json();

      // Assert — trust already at target; nudge would be redundant
      expect(res.status).toBe(200);
      expect(body).not.toHaveProperty("nudge");
    });
  });

  describe("POST /api/actions/batch (batch approve)", () => {
    it("AC-7: returns nudge when batch approve pushes email stats past threshold", async () => {
      // Arrange — batch of email actions, stats cross threshold after increment
      const emailActions = [
        makeEmailAction({ id: "action-1", status: "approved" }),
        makeEmailAction({ id: "action-2", status: "approved" }),
      ];
      // Simulate batchUpdateStatus returning updated actions
      const { batchUpdateStatus } = await import("@/lib/data/actions");
      vi.mocked(batchUpdateStatus).mockResolvedValue(emailActions);

      mockGetTrustStats.mockResolvedValue(thresholdMetStats);

      const req = makePostRequest({ actionIds: ["action-1", "action-2"], status: "approved" });

      // Act
      const res = await POST(req);
      const body = await res.json();

      // Assert — nudge present in batch response
      expect(res.status).toBe(200);
      expect(body).toHaveProperty("nudge");
      expect(body.nudge).toMatchObject({
        tool: "draftEmail",
        suggestedTrust: "always",
      });
    });

    it("returns no nudge in batch response when stats remain below threshold", async () => {
      // Arrange
      const { batchUpdateStatus } = await import("@/lib/data/actions");
      vi.mocked(batchUpdateStatus).mockResolvedValue([
        makeEmailAction({ id: "action-1", status: "approved" }),
      ]);
      mockGetTrustStats.mockResolvedValue(belowThresholdStats);

      const req = makePostRequest({ actionIds: ["action-1"], status: "approved" });

      // Act
      const res = await POST(req);
      const body = await res.json();

      // Assert
      expect(res.status).toBe(200);
      expect(body).not.toHaveProperty("nudge");
    });

    it("AC-8 (batch): returns 200 with actions but no nudge when getTrustStats throws", async () => {
      // Arrange — graduation check throws mid-batch; batch result must still be returned
      const { batchUpdateStatus } = await import("@/lib/data/actions");
      vi.mocked(batchUpdateStatus).mockResolvedValue([
        makeEmailAction({ id: "action-1", status: "approved" }),
      ]);
      mockGetTrustStats.mockRejectedValue(new Error("Stats unavailable"));

      const req = makePostRequest({ actionIds: ["action-1"], status: "approved" });

      // Act
      const res = await POST(req);
      const body = await res.json();

      // Assert — actions returned, no nudge, no 500
      expect(res.status).toBe(200);
      expect(body).toHaveProperty("actions");
      expect(body).not.toHaveProperty("nudge");
    });
  });
});
