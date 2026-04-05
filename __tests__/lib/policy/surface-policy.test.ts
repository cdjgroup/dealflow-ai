import { describe, it, expect } from "vitest";
import { getSurfacePolicy } from "@/lib/policy/surface-policy";
import type { Surface } from "@/lib/types/policy";

describe("getSurfacePolicy", () => {
  describe("AC-22: mcp surface", () => {
    it("AC-22: returns a policy for the 'mcp' surface", () => {
      const policy = getSurfacePolicy("mcp");
      expect(policy).toBeDefined();
      expect(policy.surface).toBe("mcp");
    });

    it("AC-22: mcp policy has requiresApproval: false", () => {
      const policy = getSurfacePolicy("mcp");
      expect(policy.requiresApproval).toBe(false);
    });

    it("AC-22: mcp policy has requiresCiba: false", () => {
      const policy = getSurfacePolicy("mcp");
      expect(policy.requiresCiba).toBe(false);
    });

    it("AC-22: mcp policy includes allowedToolCategories as an array", () => {
      const policy = getSurfacePolicy("mcp");
      expect(Array.isArray(policy.allowedToolCategories)).toBe(true);
    });
  });

  describe("chat surface", () => {
    it("returns a policy with surface 'chat'", () => {
      const policy = getSurfacePolicy("chat");
      expect(policy.surface).toBe("chat");
    });
  });

  describe("actions surface", () => {
    it("returns a policy with surface 'actions'", () => {
      const policy = getSurfacePolicy("actions");
      expect(policy.surface).toBe("actions");
    });
  });

  describe("error handling", () => {
    it("throws or returns undefined for an unrecognized surface", () => {
      // An unknown surface should not silently return a valid policy
      expect(() =>
        getSurfacePolicy("unknown" as Surface)
      ).toThrow();
    });
  });
});
