import { describe, it, expect } from "vitest";
import { evaluateTrustGraduation } from "@/lib/trust-graduation";
import type { ActionTypeStats, TrustLevel } from "@/lib/types/settings";

describe("evaluateTrustGraduation", () => {
  // --- AC-1: Nudge appears after approve threshold ---

  it("AC-1: returns 'always' when approval rate > 0.8 and currentTrust is 'ask' (5/5 approved)", () => {
    // Arrange
    const stats: ActionTypeStats = { approved: 5, dismissed: 0 };
    const currentTrust: TrustLevel = "ask";
    // Act
    const result = evaluateTrustGraduation(stats, currentTrust);
    // Assert
    expect(result).toBe("always");
  });

  it("AC-1: returns 'always' when approval rate > 0.8 and currentTrust is 'ask' (9/10 approved)", () => {
    // Arrange
    const stats: ActionTypeStats = { approved: 9, dismissed: 1 };
    const currentTrust: TrustLevel = "ask";
    // Act
    const result = evaluateTrustGraduation(stats, currentTrust);
    // Assert
    expect(result).toBe("always");
  });

  // --- AC-2: Upgrade-only — low approval rate never returns 'never' ---

  it("AC-2: returns null (not 'never') when approval rate is low and currentTrust is 'ask'", () => {
    // Arrange — 2 approved, 4 dismissed: rate = 0.33, below threshold
    const stats: ActionTypeStats = { approved: 2, dismissed: 4 };
    const currentTrust: TrustLevel = "ask";
    // Act
    const result = evaluateTrustGraduation(stats, currentTrust);
    // Assert — upgrade-only: no downgrade to 'never'
    expect(result).toBeNull();
    expect(result).not.toBe("never");
  });

  // --- AC-3: No nudge below minimum sample ---

  it("AC-3: returns null when total decisions < 5 even if all approved (4 approved, 0 dismissed)", () => {
    // Arrange — total = 4, below minimum of 5
    const stats: ActionTypeStats = { approved: 4, dismissed: 0 };
    const currentTrust: TrustLevel = "ask";
    // Act
    const result = evaluateTrustGraduation(stats, currentTrust);
    // Assert
    expect(result).toBeNull();
  });

  it("AC-3: returns null when total decisions = 0 (zero decisions)", () => {
    // Arrange
    const stats: ActionTypeStats = { approved: 0, dismissed: 0 };
    const currentTrust: TrustLevel = "ask";
    // Act
    const result = evaluateTrustGraduation(stats, currentTrust);
    // Assert
    expect(result).toBeNull();
  });

  // --- AC-4: No nudge when trust already matches suggested level ---

  it("AC-4: returns null when currentTrust is already 'always', even with high approval rate", () => {
    // Arrange — user is already at 'always', nothing to upgrade to
    const stats: ActionTypeStats = { approved: 10, dismissed: 0 };
    const currentTrust: TrustLevel = "always";
    // Act
    const result = evaluateTrustGraduation(stats, currentTrust);
    // Assert
    expect(result).toBeNull();
  });

  // --- Additional edge cases ---

  it("boundary: returns null when approval rate is exactly 0.8 (4/5) — threshold is strictly > 0.8", () => {
    // Arrange — 4 approved, 1 dismissed: rate = 0.8 exactly, not strictly greater
    const stats: ActionTypeStats = { approved: 4, dismissed: 1 };
    const currentTrust: TrustLevel = "ask";
    // Act
    const result = evaluateTrustGraduation(stats, currentTrust);
    // Assert — strictly > 0.8, so 0.8 does not qualify
    expect(result).toBeNull();
  });

  it("boundary: returns 'always' when total is exactly 5 and all approved (rate = 1.0)", () => {
    // Arrange — minimum sample satisfied, rate = 1.0 > 0.8
    const stats: ActionTypeStats = { approved: 5, dismissed: 0 };
    const currentTrust: TrustLevel = "ask";
    // Act
    const result = evaluateTrustGraduation(stats, currentTrust);
    // Assert
    expect(result).toBe("always");
  });

  it("returns null when currentTrust is 'never' even with high approval rate", () => {
    // Arrange — only triggers when currentTrust === 'ask'; 'never' is out of scope
    const stats: ActionTypeStats = { approved: 10, dismissed: 0 };
    const currentTrust: TrustLevel = "never";
    // Act
    const result = evaluateTrustGraduation(stats, currentTrust);
    // Assert
    expect(result).toBeNull();
  });
});
