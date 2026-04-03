import { describe, it, expect } from "vitest";
import { TOOL_SCOPE_CONFIG, TOOL_SCOPES, scopeProvider } from "@/lib/tools/scope-map";

// The 5 Token Vault tools that must appear in TOOL_SCOPE_CONFIG (F3)
const TOKEN_VAULT_TOOLS = [
  "checkCalendar",
  "searchEmails",
  "draftEmail",
  "listSlackChannels",
  "sendSlackMessage",
] as const;

describe("scope-map", () => {
  describe("TOOL_SCOPE_CONFIG (AC-2)", () => {
    it("AC-2: should export TOOL_SCOPE_CONFIG as a non-null record", () => {
      expect(TOOL_SCOPE_CONFIG).toBeDefined();
      expect(typeof TOOL_SCOPE_CONFIG).toBe("object");
      expect(TOOL_SCOPE_CONFIG).not.toBeNull();
    });

    it("AC-2: should have an entry for every Token Vault tool", () => {
      for (const tool of TOKEN_VAULT_TOOLS) {
        expect(
          TOOL_SCOPE_CONFIG,
          `TOOL_SCOPE_CONFIG should have entry for ${tool}`
        ).toHaveProperty(tool);
      }
    });

    it("AC-2: each entry should have a string connection field", () => {
      for (const tool of TOKEN_VAULT_TOOLS) {
        expect(typeof TOOL_SCOPE_CONFIG[tool].connection).toBe("string");
        expect(TOOL_SCOPE_CONFIG[tool].connection.length).toBeGreaterThan(0);
      }
    });

    it("AC-2: each entry should have a string provider field", () => {
      for (const tool of TOKEN_VAULT_TOOLS) {
        expect(typeof TOOL_SCOPE_CONFIG[tool].provider).toBe("string");
        expect(TOOL_SCOPE_CONFIG[tool].provider.length).toBeGreaterThan(0);
      }
    });

    it("AC-2: each entry should have a non-empty scopes array", () => {
      for (const tool of TOKEN_VAULT_TOOLS) {
        expect(Array.isArray(TOOL_SCOPE_CONFIG[tool].scopes)).toBe(true);
        expect(TOOL_SCOPE_CONFIG[tool].scopes.length).toBeGreaterThan(0);
        for (const scope of TOOL_SCOPE_CONFIG[tool].scopes) {
          expect(typeof scope).toBe("string");
        }
      }
    });

    it("AC-2: each entry should have a non-empty string minScope", () => {
      for (const tool of TOKEN_VAULT_TOOLS) {
        expect(typeof TOOL_SCOPE_CONFIG[tool].minScope).toBe("string");
        expect(TOOL_SCOPE_CONFIG[tool].minScope.length).toBeGreaterThan(0);
      }
    });

    it("AC-2: each entry should have accessLevel of 'read' or 'write'", () => {
      for (const tool of TOKEN_VAULT_TOOLS) {
        expect(["read", "write"]).toContain(TOOL_SCOPE_CONFIG[tool].accessLevel);
      }
    });

    it("AC-2: each entry should have a non-empty dataDescription string", () => {
      for (const tool of TOKEN_VAULT_TOOLS) {
        expect(typeof TOOL_SCOPE_CONFIG[tool].dataDescription).toBe("string");
        expect(TOOL_SCOPE_CONFIG[tool].dataDescription.length).toBeGreaterThan(0);
      }
    });

    it("AC-2: checkCalendar connection should be google-oauth2", () => {
      expect(TOOL_SCOPE_CONFIG["checkCalendar"].connection).toBe("google-oauth2");
    });

    it("AC-2: Gmail tools (searchEmails, draftEmail) connection should be google-oauth2", () => {
      expect(TOOL_SCOPE_CONFIG["searchEmails"].connection).toBe("google-oauth2");
      expect(TOOL_SCOPE_CONFIG["draftEmail"].connection).toBe("google-oauth2");
    });

    it("AC-2: Slack tools connection should be sign-in-with-slack", () => {
      expect(TOOL_SCOPE_CONFIG["listSlackChannels"].connection).toBe("sign-in-with-slack");
      expect(TOOL_SCOPE_CONFIG["sendSlackMessage"].connection).toBe("sign-in-with-slack");
    });

    it("AC-2: draftEmail and sendSlackMessage should have write accessLevel", () => {
      expect(TOOL_SCOPE_CONFIG["draftEmail"].accessLevel).toBe("write");
      expect(TOOL_SCOPE_CONFIG["sendSlackMessage"].accessLevel).toBe("write");
    });

    it("AC-2: read tools should have read accessLevel", () => {
      expect(TOOL_SCOPE_CONFIG["checkCalendar"].accessLevel).toBe("read");
      expect(TOOL_SCOPE_CONFIG["searchEmails"].accessLevel).toBe("read");
      expect(TOOL_SCOPE_CONFIG["listSlackChannels"].accessLevel).toBe("read");
    });
  });

  describe("TOOL_SCOPES backward compat (AC-2)", () => {
    it("AC-2: should still export TOOL_SCOPES for backward compatibility", () => {
      expect(TOOL_SCOPES).toBeDefined();
    });

    it("AC-2: TOOL_SCOPES should be an object with tool-name keys", () => {
      expect(typeof TOOL_SCOPES).toBe("object");
      expect(TOOL_SCOPES).not.toBeNull();
    });
  });

  describe("scopeProvider backward compat (AC-2)", () => {
    it("AC-2: should still export scopeProvider function", () => {
      expect(typeof scopeProvider).toBe("function");
    });

    it("AC-2: scopeProvider should return Google for calendar scopes", () => {
      const provider = scopeProvider(["calendar.readonly"]);
      expect(provider).toBe("Google");
    });

    it("AC-2: scopeProvider should return Slack for slack scopes", () => {
      const provider = scopeProvider(["channels:read"]);
      expect(provider).toBe("Slack");
    });
  });
});
