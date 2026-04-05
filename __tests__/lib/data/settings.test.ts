import { describe, it, expect, vi, beforeEach } from "vitest";
import { getUserSettings, updateUserSettings } from "@/lib/data/settings";
import { DEFAULT_SETTINGS } from "@/lib/types/settings";
import type { TrustLevel } from "@/lib/types/settings";

// Mock Redis
const mockGet = vi.fn();
const mockSet = vi.fn();
vi.mock("@/lib/redis", () => ({
  getRedis: () => ({ get: mockGet, set: mockSet }),
}));

const TEST_USER = "auth0|test123";

describe("settings data layer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getUserSettings", () => {
    it("returns defaults when no settings exist", async () => {
      mockGet.mockResolvedValue(null);
      const settings = await getUserSettings(TEST_USER);
      expect(settings).toEqual(DEFAULT_SETTINGS);
    });

    it("returns stored settings when they exist", async () => {
      const stored = {
        ...DEFAULT_SETTINGS,
        capabilities: { ...DEFAULT_SETTINGS.capabilities, gmail: false },
      };
      mockGet.mockResolvedValue(stored);
      const settings = await getUserSettings(TEST_USER);
      expect(settings.capabilities.gmail).toBe(false);
    });

    it("uses correct Redis key", async () => {
      mockGet.mockResolvedValue(null);
      await getUserSettings(TEST_USER);
      expect(mockGet).toHaveBeenCalledWith(`${TEST_USER}:settings`);
    });
  });

  describe("updateUserSettings", () => {
    it("merges partial update with existing settings", async () => {
      mockGet.mockResolvedValue(DEFAULT_SETTINGS);
      mockSet.mockResolvedValue("OK");

      const result = await updateUserSettings(TEST_USER, {
        capabilities: { ...DEFAULT_SETTINGS.capabilities, gmail: false },
      });

      expect(result.capabilities.gmail).toBe(false);
      expect(result.capabilities.calendar).toBe(true); // unchanged
    });

    it("persists merged settings to Redis", async () => {
      mockGet.mockResolvedValue(DEFAULT_SETTINGS);
      mockSet.mockResolvedValue("OK");

      await updateUserSettings(TEST_USER, {
        approvalRequired: { crmWrite: true },
      });

      expect(mockSet).toHaveBeenCalledWith(
        `${TEST_USER}:settings`,
        expect.objectContaining({
          approvalRequired: { crmWrite: true },
        })
      );
    });

    it("returns defaults merged with patch for new user", async () => {
      mockGet.mockResolvedValue(null);
      mockSet.mockResolvedValue("OK");

      const result = await updateUserSettings(TEST_USER, {
        capabilities: { ...DEFAULT_SETTINGS.capabilities, slack: true },
      });

      expect(result.capabilities.slack).toBe(true);
      expect(result.approvalRequired).toEqual(DEFAULT_SETTINGS.approvalRequired);
    });
  });

  // AC-4: toolTrust field on UserSettings
  describe("toolTrust in UserSettings (AC-4)", () => {
    it("default settings include toolTrust as an empty object", () => {
      expect(DEFAULT_SETTINGS.toolTrust).toBeDefined();
      expect(DEFAULT_SETTINGS.toolTrust).toEqual({});
    });

    it("updateUserSettings merges toolTrust per-key — setting checkCalendar then draftEmail preserves both", async () => {
      // First call: existing settings have checkCalendar set
      const settingsWithCalendar = {
        ...DEFAULT_SETTINGS,
        toolTrust: { checkCalendar: "ask" as TrustLevel },
      };
      mockGet.mockResolvedValue(settingsWithCalendar);
      mockSet.mockResolvedValue("OK");

      const result = await updateUserSettings(TEST_USER, {
        toolTrust: { draftEmail: "always" },
      });

      // Both keys must survive the merge
      expect(result.toolTrust.checkCalendar).toBe("ask");
      expect(result.toolTrust.draftEmail).toBe("always");
    });

    it("updateUserSettings with toolTrust does not clobber capabilities", async () => {
      mockGet.mockResolvedValue(DEFAULT_SETTINGS);
      mockSet.mockResolvedValue("OK");

      const result = await updateUserSettings(TEST_USER, {
        toolTrust: { checkCalendar: "never" },
      });

      expect(result.capabilities).toEqual(DEFAULT_SETTINGS.capabilities);
    });

    it("updateUserSettings with toolTrust does not clobber approvalRequired", async () => {
      const settingsWithApproval = {
        ...DEFAULT_SETTINGS,
        approvalRequired: { crmWrite: true },
      };
      mockGet.mockResolvedValue(settingsWithApproval);
      mockSet.mockResolvedValue("OK");

      const result = await updateUserSettings(TEST_USER, {
        toolTrust: { draftEmail: "always" },
      });

      expect(result.approvalRequired.crmWrite).toBe(true);
    });
  });

  describe("mcpClients merge (AC-12)", () => {
    it("AC-12: full-replaces mcpClients when present in patch", async () => {
      const existing = {
        ...DEFAULT_SETTINGS,
        mcpClients: {
          "client-a": { allowedCategories: ["crmRead" as const], label: "A" },
        },
      };
      mockGet.mockResolvedValue(existing);
      mockSet.mockResolvedValue("OK");

      const result = await updateUserSettings(TEST_USER, {
        mcpClients: {
          "client-b": { allowedCategories: ["calendar" as const], label: "B" },
        },
      });

      // Full replace: client-a is gone, only client-b exists
      expect(result.mcpClients?.["client-a"]).toBeUndefined();
      expect(result.mcpClients?.["client-b"]).toBeDefined();
    });

    it("AC-12: can remove all clients by sending empty object", async () => {
      const existing = {
        ...DEFAULT_SETTINGS,
        mcpClients: {
          "client-a": { allowedCategories: ["crmRead" as const], label: "A" },
        },
      };
      mockGet.mockResolvedValue(existing);
      mockSet.mockResolvedValue("OK");

      const result = await updateUserSettings(TEST_USER, {
        mcpClients: {},
      });

      expect(Object.keys(result.mcpClients ?? {})).toHaveLength(0);
    });

    it("AC-12: preserves undefined mcpClients when not in patch", async () => {
      mockGet.mockResolvedValue(DEFAULT_SETTINGS);
      mockSet.mockResolvedValue("OK");

      const result = await updateUserSettings(TEST_USER, {
        capabilities: { ...DEFAULT_SETTINGS.capabilities, gmail: false },
      });

      expect(result.mcpClients).toBeUndefined();
    });
  });
});
