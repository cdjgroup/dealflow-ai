import { describe, it, expect } from "vitest";
import type { ParameterConstraint } from "@/lib/types/policy";

// Dynamic import after module mocks would go here — but validateParameterConstraints
// is a pure function with no side-effect dependencies, so static import is fine.
// The import will fail at test-run time (RED phase) because the export doesn't exist yet.
import { validateParameterConstraints } from "@/lib/mcp/tool-adapter";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("validateParameterConstraints", () => {
  // -------------------------------------------------------------------------
  describe("AC-9: Matching parameter value passes validation", () => {
    it("AC-9: should return null when query matches the constraint pattern", () => {
      // Arrange
      const constraints: Record<string, ParameterConstraint[]> = {
        searchEmails: [{ param: "query", pattern: "from:.*@acme\\.com" }],
      };

      // Act
      const result = validateParameterConstraints(
        "searchEmails",
        { query: "from:alice@acme.com" },
        constraints
      );

      // Assert
      expect(result).toBeNull();
    });

    it("AC-9: should return null when all multiple constraints on the same tool pass", () => {
      // Arrange
      const constraints: Record<string, ParameterConstraint[]> = {
        searchEmails: [
          { param: "query", pattern: "from:.*@acme\\.com" },
          { param: "query", pattern: "^from:" },
        ],
      };

      // Act
      const result = validateParameterConstraints(
        "searchEmails",
        { query: "from:alice@acme.com" },
        constraints
      );

      // Assert
      expect(result).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  describe("AC-8: Non-matching parameter value is rejected", () => {
    it("AC-8: should return an error string when query does not match the constraint pattern", () => {
      // Arrange
      const constraints: Record<string, ParameterConstraint[]> = {
        searchEmails: [{ param: "query", pattern: "from:.*@acme\\.com" }],
      };

      // Act
      const result = validateParameterConstraints(
        "searchEmails",
        { query: "from:bob@evil.com" },
        constraints
      );

      // Assert
      expect(result).toBeTypeOf("string");
    });

    it("AC-8: should include 'constraint' or 'violated' in the error message", () => {
      // Arrange
      const constraints: Record<string, ParameterConstraint[]> = {
        searchEmails: [{ param: "query", pattern: "from:.*@acme\\.com" }],
      };

      // Act
      const result = validateParameterConstraints(
        "searchEmails",
        { query: "from:bob@evil.com" },
        constraints
      );

      // Assert — error must signal a constraint violation clearly
      expect(result).toMatch(/constraint|violated/i);
    });

    it("AC-8: should return an error when first constraint passes but second fails", () => {
      // Arrange — two constraints; second one won't match
      const constraints: Record<string, ParameterConstraint[]> = {
        searchEmails: [
          { param: "query", pattern: "from:.*@acme\\.com" },
          { param: "query", pattern: "^subject:" }, // will not match
        ],
      };

      // Act
      const result = validateParameterConstraints(
        "searchEmails",
        { query: "from:alice@acme.com" },
        constraints
      );

      // Assert — all constraints must pass; second failure means rejection
      expect(result).toBeTypeOf("string");
    });
  });

  // -------------------------------------------------------------------------
  describe("AC-10: No constraints means no filtering", () => {
    it("AC-10: should return null when constraints object is empty", () => {
      // Arrange
      const constraints: Record<string, ParameterConstraint[]> = {};

      // Act
      const result = validateParameterConstraints(
        "searchEmails",
        { query: "from:bob@evil.com" },
        constraints
      );

      // Assert
      expect(result).toBeNull();
    });

    it("AC-10: should return null when the tool has no entry in constraints", () => {
      // Arrange — constraints exist but only for a different tool
      const constraints: Record<string, ParameterConstraint[]> = {
        draftEmail: [{ param: "to", pattern: "@acme\\.com$" }],
      };

      // Act
      const result = validateParameterConstraints(
        "searchEmails",
        { query: "from:bob@evil.com" },
        constraints
      );

      // Assert
      expect(result).toBeNull();
    });

    it("AC-10: should return null when constraints entry for the tool is an empty array", () => {
      // Arrange
      const constraints: Record<string, ParameterConstraint[]> = {
        searchEmails: [],
      };

      // Act
      const result = validateParameterConstraints(
        "searchEmails",
        { query: "anything" },
        constraints
      );

      // Assert
      expect(result).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  describe("AC-11: Invalid regex fails closed", () => {
    it("AC-11: should return an error string (not throw) when the constraint pattern is invalid regex", () => {
      // Arrange
      const constraints: Record<string, ParameterConstraint[]> = {
        searchEmails: [{ param: "query", pattern: "[invalid(" }],
      };

      // Act — must NOT throw; should fail closed by returning an error string
      let result: string | null;
      expect(() => {
        result = validateParameterConstraints(
          "searchEmails",
          { query: "anything" },
          constraints
        );
      }).not.toThrow();

      // Assert — invalid regex is treated as a constraint violation, not a pass
      expect(result!).toBeTypeOf("string");
    });

    it("AC-11: error message for invalid regex should indicate a configuration problem", () => {
      // Arrange
      const constraints: Record<string, ParameterConstraint[]> = {
        searchEmails: [{ param: "query", pattern: "[invalid(" }],
      };

      // Act
      const result = validateParameterConstraints(
        "searchEmails",
        { query: "anything" },
        constraints
      );

      // Assert — error string is non-empty and meaningful
      expect(result).not.toBe("");
      expect(result).not.toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  describe("AC-13: Error message includes useful context", () => {
    it("AC-13: should include the tool name in the error message", () => {
      // Arrange
      const constraints: Record<string, ParameterConstraint[]> = {
        searchEmails: [
          { param: "query", pattern: "from:.*@acme\\.com", description: "Only acme.com emails" },
        ],
      };

      // Act
      const result = validateParameterConstraints(
        "searchEmails",
        { query: "from:bob@evil.com" },
        constraints
      );

      // Assert
      expect(result).toContain("searchEmails");
    });

    it("AC-13: should include the param name in the error message", () => {
      // Arrange
      const constraints: Record<string, ParameterConstraint[]> = {
        searchEmails: [
          { param: "query", pattern: "from:.*@acme\\.com", description: "Only acme.com emails" },
        ],
      };

      // Act
      const result = validateParameterConstraints(
        "searchEmails",
        { query: "from:bob@evil.com" },
        constraints
      );

      // Assert
      expect(result).toContain("query");
    });

    it("AC-13: should include the constraint description when provided", () => {
      // Arrange
      const constraints: Record<string, ParameterConstraint[]> = {
        searchEmails: [
          { param: "query", pattern: "from:.*@acme\\.com", description: "Only acme.com emails" },
        ],
      };

      // Act
      const result = validateParameterConstraints(
        "searchEmails",
        { query: "from:bob@evil.com" },
        constraints
      );

      // Assert
      expect(result).toContain("Only acme.com emails");
    });

    it("AC-13: should not throw when description is omitted but still include tool and param", () => {
      // Arrange — no description field
      const constraints: Record<string, ParameterConstraint[]> = {
        searchEmails: [{ param: "query", pattern: "from:.*@acme\\.com" }],
      };

      // Act
      const result = validateParameterConstraints(
        "searchEmails",
        { query: "from:bob@evil.com" },
        constraints
      );

      // Assert — still useful without description
      expect(result).toContain("searchEmails");
      expect(result).toContain("query");
    });
  });

  // -------------------------------------------------------------------------
  describe("Edge cases", () => {
    it("should return null when constrained param is absent from params (optional param)", () => {
      // Arrange — constraint on "query" but params don't include "query"
      const constraints: Record<string, ParameterConstraint[]> = {
        searchEmails: [{ param: "query", pattern: "from:.*@acme\\.com" }],
      };

      // Act — "query" not present; absent params are not constrained
      const result = validateParameterConstraints(
        "searchEmails",
        { someOtherParam: "value" },
        constraints
      );

      // Assert — absent param is not a violation (param is optional)
      expect(result).toBeNull();
    });

    it("should coerce a non-string param value to string before matching", () => {
      // Arrange — param value is a number; pattern matches its string form
      const constraints: Record<string, ParameterConstraint[]> = {
        listDeals: [{ param: "limit", pattern: "^[0-9]+$" }],
      };

      // Act — numeric value should be coerced: "42" matches ^[0-9]+$
      const result = validateParameterConstraints(
        "listDeals",
        { limit: 42 },
        constraints
      );

      // Assert — numeric coercion to "42" matches the pattern, so no error
      expect(result).toBeNull();
    });

    it("should reject when non-string param value does not match after coercion", () => {
      // Arrange — pattern requires only digits; boolean "false" coerces to "false" which won't match
      const constraints: Record<string, ParameterConstraint[]> = {
        listDeals: [{ param: "limit", pattern: "^[0-9]+$" }],
      };

      // Act
      const result = validateParameterConstraints(
        "listDeals",
        { limit: false },
        constraints
      );

      // Assert — "false" does not match ^[0-9]+$
      expect(result).toBeTypeOf("string");
    });
  });
});
