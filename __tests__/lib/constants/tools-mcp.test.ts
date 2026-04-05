import { describe, it, expect } from "vitest";
import { MCP_SAFE_TOOLS, TRUST_TIER_TOOLS } from "@/lib/constants/tools";

describe("MCP tool constants", () => {
  describe("MCP_SAFE_TOOLS", () => {
    it("is a Set", () => {
      expect(MCP_SAFE_TOOLS).toBeInstanceOf(Set);
    });

    it("contains at least one tool name", () => {
      expect(MCP_SAFE_TOOLS.size).toBeGreaterThan(0);
    });
  });

  describe("TRUST_TIER_TOOLS", () => {
    it("defines entries for all four trust tiers", () => {
      expect(TRUST_TIER_TOOLS).toHaveProperty("full");
      expect(TRUST_TIER_TOOLS).toHaveProperty("standard");
      expect(TRUST_TIER_TOOLS).toHaveProperty("restricted");
      expect(TRUST_TIER_TOOLS).toHaveProperty("readonly");
    });

    it("each tier value is an array of strings", () => {
      for (const tools of Object.values(TRUST_TIER_TOOLS)) {
        expect(Array.isArray(tools)).toBe(true);
        for (const t of tools) {
          expect(typeof t).toBe("string");
        }
      }
    });

    describe("AC-23: restricted tier", () => {
      it("AC-23: includes CRM read tools", () => {
        const tools = TRUST_TIER_TOOLS["restricted"];
        expect(tools).toContain("listDeals");
        expect(tools).toContain("getDealDetails");
        expect(tools).toContain("searchContacts");
      });

      it("AC-23: includes calendar tools", () => {
        const tools = TRUST_TIER_TOOLS["restricted"];
        expect(tools).toContain("checkCalendar");
      });

      it("AC-23: includes email tools", () => {
        const tools = TRUST_TIER_TOOLS["restricted"];
        expect(tools).toContain("searchEmails");
      });

      it("AC-23: does NOT include Slack tools", () => {
        const tools = TRUST_TIER_TOOLS["restricted"];
        expect(tools).not.toContain("listSlackChannels");
        expect(tools).not.toContain("sendSlackMessage");
      });
    });

    describe("tier hierarchy", () => {
      it("full tier includes more tools than restricted tier", () => {
        expect(TRUST_TIER_TOOLS["full"].length).toBeGreaterThan(
          TRUST_TIER_TOOLS["restricted"].length
        );
      });

      it("readonly tier includes fewer tools than restricted tier", () => {
        expect(TRUST_TIER_TOOLS["readonly"].length).toBeLessThan(
          TRUST_TIER_TOOLS["restricted"].length
        );
      });
    });
  });
});
