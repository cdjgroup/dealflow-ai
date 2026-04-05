import { describe, it, expect } from "vitest";
import { DEFAULT_SETTINGS } from "@/lib/types/settings";
import type { AutonomyLevel, UserSettings } from "@/lib/types/settings";

describe("settings types", () => {
  describe("AutonomyLevel", () => {
    it("AC-1: type accepts value 1 (Suggest Only)", () => {
      // Arrange + Act — compile-time check expressed at runtime
      const level: AutonomyLevel = 1;
      // Assert
      expect(level).toBe(1);
    });

    it("accepts value 2 (Auto-Approve)", () => {
      const level: AutonomyLevel = 2;
      expect(level).toBe(2);
    });

    it("accepts value 3 (Full Autonomous)", () => {
      const level: AutonomyLevel = 3;
      expect(level).toBe(3);
    });
  });

  describe("DEFAULT_SETTINGS", () => {
    it("AC-1: default autonomyLevel is 1 (Suggest Only)", () => {
      // Arrange — use existing exported constant
      // Act + Assert
      expect(DEFAULT_SETTINGS.autonomyLevel).toBe(1);
    });

    it("autonomyLevel field is present on UserSettings shape", () => {
      // Arrange
      const settings: UserSettings = DEFAULT_SETTINGS;
      // Assert — if the field doesn't exist, TypeScript would error and
      // the value would be undefined, failing the toBeDefined check
      expect(settings.autonomyLevel).toBeDefined();
    });

    it("default autonomyLevel is a number, not undefined or null", () => {
      expect(typeof DEFAULT_SETTINGS.autonomyLevel).toBe("number");
    });
  });
});
