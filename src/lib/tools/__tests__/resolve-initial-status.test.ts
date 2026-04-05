import { describe, it, expect } from "vitest";
import { resolveInitialStatus } from "@/lib/tools/analyze-pipeline";
import type { ActionPriority } from "@/lib/types/actions";
import type { AutonomyLevel, ConfidenceThresholds } from "@/lib/types/settings";

// Default thresholds per AC-5 and DEFAULT_SETTINGS
const DEFAULT_THRESHOLDS: ConfidenceThresholds = {
  autoApprove: 0.85,
  requireReview: 0.5,
};

describe("resolveInitialStatus", () => {
  // ---------------------------------------------------------------------------
  // AC-1: High-confidence actions auto-approve at creation
  // ---------------------------------------------------------------------------
  describe("AC-1: high-confidence actions auto-approve", () => {
    it("should return 'approved' when confidence exceeds autoApprove threshold and autonomyLevel >= 2", () => {
      // Arrange
      const suggestion = { priority: "medium" as ActionPriority, confidence: 0.92 };
      const settings = { autonomyLevel: 2 as AutonomyLevel, confidenceThresholds: DEFAULT_THRESHOLDS };

      // Act
      const result = resolveInitialStatus(suggestion, settings);

      // Assert
      expect(result).toBe("approved");
    });

    it("AC-1: should return 'approved' for high-confidence high-priority action at autonomyLevel 2", () => {
      const suggestion = { priority: "high" as ActionPriority, confidence: 0.92 };
      const settings = { autonomyLevel: 2 as AutonomyLevel, confidenceThresholds: DEFAULT_THRESHOLDS };

      expect(resolveInitialStatus(suggestion, settings)).toBe("approved");
    });

    it("AC-1: should return 'approved' for high-confidence low-priority action at autonomyLevel 2 (confidence overrides priority)", () => {
      // Low priority would normally stay pending, but high confidence promotes it
      const suggestion = { priority: "low" as ActionPriority, confidence: 0.92 };
      const settings = { autonomyLevel: 2 as AutonomyLevel, confidenceThresholds: DEFAULT_THRESHOLDS };

      expect(resolveInitialStatus(suggestion, settings)).toBe("approved");
    });

    it("AC-1: should return 'approved' for high-confidence action at autonomyLevel 3", () => {
      const suggestion = { priority: "medium" as ActionPriority, confidence: 0.95 };
      const settings = { autonomyLevel: 3 as AutonomyLevel, confidenceThresholds: DEFAULT_THRESHOLDS };

      expect(resolveInitialStatus(suggestion, settings)).toBe("approved");
    });

    it("AC-1 boundary: should return 'approved' when confidence is exactly at autoApprove threshold (0.85)", () => {
      const suggestion = { priority: "medium" as ActionPriority, confidence: 0.85 };
      const settings = { autonomyLevel: 2 as AutonomyLevel, confidenceThresholds: DEFAULT_THRESHOLDS };

      expect(resolveInitialStatus(suggestion, settings)).toBe("approved");
    });
  });

  // ---------------------------------------------------------------------------
  // AC-2: Low-confidence actions require manual review regardless of autonomy
  // ---------------------------------------------------------------------------
  describe("AC-2: low-confidence actions require manual review", () => {
    it("should return 'pending' when confidence is below requireReview threshold regardless of autonomy", () => {
      // Arrange
      const suggestion = { priority: "high" as ActionPriority, confidence: 0.35 };
      const settings = { autonomyLevel: 3 as AutonomyLevel, confidenceThresholds: DEFAULT_THRESHOLDS };

      // Act
      const result = resolveInitialStatus(suggestion, settings);

      // Assert
      expect(result).toBe("pending");
    });

    it("AC-2: should return 'pending' for low-confidence at autonomyLevel 1", () => {
      const suggestion = { priority: "high" as ActionPriority, confidence: 0.35 };
      const settings = { autonomyLevel: 1 as AutonomyLevel, confidenceThresholds: DEFAULT_THRESHOLDS };

      expect(resolveInitialStatus(suggestion, settings)).toBe("pending");
    });

    it("AC-2: should return 'pending' for low-confidence at autonomyLevel 2", () => {
      const suggestion = { priority: "medium" as ActionPriority, confidence: 0.35 };
      const settings = { autonomyLevel: 2 as AutonomyLevel, confidenceThresholds: DEFAULT_THRESHOLDS };

      expect(resolveInitialStatus(suggestion, settings)).toBe("pending");
    });

    it("AC-2 boundary: should return 'pending' when confidence is exactly at requireReview threshold (0.5)", () => {
      const suggestion = { priority: "high" as ActionPriority, confidence: 0.5 };
      const settings = { autonomyLevel: 3 as AutonomyLevel, confidenceThresholds: DEFAULT_THRESHOLDS };

      expect(resolveInitialStatus(suggestion, settings)).toBe("pending");
    });

    it("AC-2: autonomyLevel 3 (highest trust) cannot override low confidence — stays pending", () => {
      // Even the most permissive autonomy level cannot override a confidence-based demotion
      const suggestion = { priority: "high" as ActionPriority, confidence: 0.2 };
      const settings = { autonomyLevel: 3 as AutonomyLevel, confidenceThresholds: DEFAULT_THRESHOLDS };

      expect(resolveInitialStatus(suggestion, settings)).toBe("pending");
    });
  });

  // ---------------------------------------------------------------------------
  // AC-3: Actions without confidence use existing autonomy logic
  // ---------------------------------------------------------------------------
  describe("AC-3: undefined confidence falls back to autonomy heuristic", () => {
    it("should return 'approved' for non-low priority at autonomyLevel 2 when confidence is undefined", () => {
      // Arrange
      const suggestion = { priority: "medium" as ActionPriority, confidence: undefined };
      const settings = { autonomyLevel: 2 as AutonomyLevel, confidenceThresholds: DEFAULT_THRESHOLDS };

      // Act
      const result = resolveInitialStatus(suggestion, settings);

      // Assert
      expect(result).toBe("approved");
    });

    it("AC-3: should return 'approved' for high priority at autonomyLevel 2 when confidence is undefined", () => {
      const suggestion = { priority: "high" as ActionPriority, confidence: undefined };
      const settings = { autonomyLevel: 2 as AutonomyLevel, confidenceThresholds: DEFAULT_THRESHOLDS };

      expect(resolveInitialStatus(suggestion, settings)).toBe("approved");
    });

    it("AC-3: should return 'pending' for low priority at autonomyLevel 2 when confidence is undefined", () => {
      const suggestion = { priority: "low" as ActionPriority, confidence: undefined };
      const settings = { autonomyLevel: 2 as AutonomyLevel, confidenceThresholds: DEFAULT_THRESHOLDS };

      expect(resolveInitialStatus(suggestion, settings)).toBe("pending");
    });

    it("AC-3: should return 'pending' for any priority at autonomyLevel 1 when confidence is undefined", () => {
      const suggestion = { priority: "high" as ActionPriority, confidence: undefined };
      const settings = { autonomyLevel: 1 as AutonomyLevel, confidenceThresholds: DEFAULT_THRESHOLDS };

      expect(resolveInitialStatus(suggestion, settings)).toBe("pending");
    });

    it("AC-3: should return 'approved' for high priority at autonomyLevel 3 when confidence is undefined", () => {
      const suggestion = { priority: "high" as ActionPriority, confidence: undefined };
      const settings = { autonomyLevel: 3 as AutonomyLevel, confidenceThresholds: DEFAULT_THRESHOLDS };

      expect(resolveInitialStatus(suggestion, settings)).toBe("approved");
    });

    it("AC-3: suggestion with no confidence field at all (not present) falls back to autonomy", () => {
      // Omit confidence entirely — tests that the function handles a missing key
      const suggestion = { priority: "medium" as ActionPriority };
      const settings = { autonomyLevel: 2 as AutonomyLevel, confidenceThresholds: DEFAULT_THRESHOLDS };

      expect(resolveInitialStatus(suggestion, settings)).toBe("approved");
    });
  });

  // ---------------------------------------------------------------------------
  // AC-5: Default thresholds — middle-band confidence defers to autonomy logic
  // ---------------------------------------------------------------------------
  describe("AC-5: middle-band confidence (between thresholds) defers to autonomy", () => {
    it("should fall through to autonomy logic when confidence is in the middle band (0.7)", () => {
      // Arrange — confidence = 0.7, between requireReview (0.5) and autoApprove (0.85)
      const suggestion = { priority: "medium" as ActionPriority, confidence: 0.7 };
      const settings = { autonomyLevel: 2 as AutonomyLevel, confidenceThresholds: DEFAULT_THRESHOLDS };

      // Act
      const result = resolveInitialStatus(suggestion, settings);

      // Assert — autonomyLevel 2 + medium priority → approved (same as no-confidence path)
      expect(result).toBe("approved");
    });

    it("AC-5: middle-band confidence at autonomyLevel 1 defers to autonomy — stays pending", () => {
      const suggestion = { priority: "high" as ActionPriority, confidence: 0.7 };
      const settings = { autonomyLevel: 1 as AutonomyLevel, confidenceThresholds: DEFAULT_THRESHOLDS };

      expect(resolveInitialStatus(suggestion, settings)).toBe("pending");
    });

    it("AC-5: middle-band confidence + low priority at autonomyLevel 2 stays pending", () => {
      // Confidence is not low enough to force pending, and not high enough to force approve.
      // Priority = low at autonomyLevel 2 → pending via autonomy logic.
      const suggestion = { priority: "low" as ActionPriority, confidence: 0.7 };
      const settings = { autonomyLevel: 2 as AutonomyLevel, confidenceThresholds: DEFAULT_THRESHOLDS };

      expect(resolveInitialStatus(suggestion, settings)).toBe("pending");
    });

    it("AC-5: when no confidenceThresholds provided, uses default 0.85/0.5 thresholds", () => {
      // Settings with no confidenceThresholds — function must apply defaults
      const suggestion = { priority: "medium" as ActionPriority, confidence: 0.92 };
      const settings = { autonomyLevel: 2 as AutonomyLevel };

      // High confidence should still auto-approve with default thresholds
      expect(resolveInitialStatus(suggestion, settings)).toBe("approved");
    });

    it("AC-5: low confidence demotes even with no explicit thresholds (applies default requireReview = 0.5)", () => {
      const suggestion = { priority: "high" as ActionPriority, confidence: 0.3 };
      const settings = { autonomyLevel: 3 as AutonomyLevel };

      expect(resolveInitialStatus(suggestion, settings)).toBe("pending");
    });
  });

  // ---------------------------------------------------------------------------
  // Edge cases: autonomyLevel 1 with high confidence / autonomyLevel 3 with low confidence
  // ---------------------------------------------------------------------------
  describe("edge cases: confidence can override autonomy in both directions", () => {
    it("should return 'approved' for autonomyLevel 1 when confidence exceeds autoApprove (confidence promotes)", () => {
      // autonomyLevel 1 would normally set everything to pending,
      // but high confidence should promote to approved
      const suggestion = { priority: "high" as ActionPriority, confidence: 0.92 };
      const settings = { autonomyLevel: 1 as AutonomyLevel, confidenceThresholds: DEFAULT_THRESHOLDS };

      expect(resolveInitialStatus(suggestion, settings)).toBe("approved");
    });

    it("should return 'pending' for autonomyLevel 3 when confidence is below requireReview (confidence demotes)", () => {
      // autonomyLevel 3 would normally approve high/medium,
      // but low confidence should demote to pending
      const suggestion = { priority: "high" as ActionPriority, confidence: 0.35 };
      const settings = { autonomyLevel: 3 as AutonomyLevel, confidenceThresholds: DEFAULT_THRESHOLDS };

      expect(resolveInitialStatus(suggestion, settings)).toBe("pending");
    });
  });
});
