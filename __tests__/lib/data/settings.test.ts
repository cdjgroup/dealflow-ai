import { describe, it, expect, vi, beforeEach } from "vitest";
import { getUserSettings, updateUserSettings } from "@/lib/data/settings";
import { DEFAULT_SETTINGS } from "@/lib/types/settings";

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
});
