import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mock Redis before importing the module under test ---
const mockGet = vi.fn();
const mockSet = vi.fn();

vi.mock("@/lib/redis", () => ({
  getRedis: () => ({
    get: mockGet,
    set: mockSet,
  }),
}));

// Dynamic import so mocks are in place before module evaluation
const { updateUserSettings, getUserSettings } = await import(
  "@/lib/data/settings"
);

describe("settings data layer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("updateUserSettings", () => {
    it("AC-7: persists autonomyLevel when included in patch", async () => {
      // Arrange — current settings stored in Redis have no autonomyLevel
      const currentSettings = {
        capabilities: {
          crmRead: true,
          crmWrite: true,
          calendar: true,
          gmail: true,
          slack: false,
        },
        approvalRequired: { crmWrite: false },
        toolTrust: {},
        schedule: { enabled: false, hours: [], timezone: "UTC" },
      };
      mockGet.mockResolvedValue(currentSettings);
      mockSet.mockResolvedValue("OK");

      // Act
      await updateUserSettings("user-123", { autonomyLevel: 2 });

      // Assert — set must have been called with a payload that includes autonomyLevel: 2
      expect(mockSet).toHaveBeenCalledOnce();
      const [, stored] = mockSet.mock.calls[0];
      expect(stored.autonomyLevel).toBe(2);
    });

    it("AC-7: preserves autonomyLevel when patch does not include it", async () => {
      // Arrange — current settings already have autonomyLevel: 3
      const currentSettings = {
        capabilities: {
          crmRead: true,
          crmWrite: true,
          calendar: true,
          gmail: true,
          slack: false,
        },
        approvalRequired: { crmWrite: false },
        toolTrust: {},
        schedule: { enabled: false, hours: [], timezone: "UTC" },
        autonomyLevel: 3,
      };
      mockGet.mockResolvedValue(currentSettings);
      mockSet.mockResolvedValue("OK");

      // Act — patch only touches capabilities, not autonomyLevel
      await updateUserSettings("user-123", {
        capabilities: { ...currentSettings.capabilities, slack: true },
      });

      // Assert — autonomyLevel 3 must survive the merge
      expect(mockSet).toHaveBeenCalledOnce();
      const [, stored] = mockSet.mock.calls[0];
      expect(stored.autonomyLevel).toBe(3);
    });

    it("AC-1: autonomyLevel defaults to 1 when absent from both current settings and patch", async () => {
      // Arrange — settings in Redis have no autonomyLevel field at all
      const currentSettings = {
        capabilities: {
          crmRead: true,
          crmWrite: true,
          calendar: true,
          gmail: true,
          slack: false,
        },
        approvalRequired: { crmWrite: false },
        toolTrust: {},
        schedule: { enabled: false, hours: [], timezone: "UTC" },
      };
      mockGet.mockResolvedValue(currentSettings);
      mockSet.mockResolvedValue("OK");

      // Act — patch also omits autonomyLevel
      await updateUserSettings("user-123", {});

      // Assert — merged result must default to 1
      const [, stored] = mockSet.mock.calls[0];
      expect(stored.autonomyLevel).toBe(1);
    });

    it("AC-7: autonomyLevel can be updated from 2 to 1 (downgrade)", async () => {
      // Arrange
      const currentSettings = {
        capabilities: {
          crmRead: true,
          crmWrite: false,
          calendar: false,
          gmail: false,
          slack: false,
        },
        approvalRequired: { crmWrite: false },
        toolTrust: {},
        schedule: { enabled: false, hours: [], timezone: "UTC" },
        autonomyLevel: 2,
      };
      mockGet.mockResolvedValue(currentSettings);
      mockSet.mockResolvedValue("OK");

      // Act
      await updateUserSettings("user-123", { autonomyLevel: 1 });

      // Assert
      const [, stored] = mockSet.mock.calls[0];
      expect(stored.autonomyLevel).toBe(1);
    });
  });

  describe("getUserSettings", () => {
    it("AC-1: returns autonomyLevel 1 when settings have no stored autonomyLevel", async () => {
      // Arrange — simulate legacy settings without the field
      const legacySettings = {
        capabilities: {
          crmRead: true,
          crmWrite: true,
          calendar: true,
          gmail: true,
          slack: false,
        },
        approvalRequired: { crmWrite: false },
        toolTrust: {},
        schedule: { enabled: false, hours: [], timezone: "UTC" },
      };
      mockGet.mockResolvedValue(legacySettings);

      // Act
      const result = await getUserSettings("user-123");

      // Assert — must fall back to default of 1
      expect(result.autonomyLevel).toBe(1);
    });
  });
});
