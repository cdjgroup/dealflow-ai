import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getDeals,
  getDeal,
  createDealRecord,
  getContacts,
  getContact,
  getActivities,
  createActivityRecord,
  seedDemoData,
  type Deal,
  type Contact,
} from "@/lib/data/crm";

const mockGet = vi.fn();
const mockSet = vi.fn();
const mockDel = vi.fn();
const mockKeys = vi.fn();
const mockMget = vi.fn();

vi.mock("@/lib/redis", () => ({
  getRedis: () => ({
    get: mockGet,
    set: mockSet,
    del: mockDel,
    keys: mockKeys,
    mget: mockMget,
  }),
}));

describe("CRM Data Layer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getDeals", () => {
    it("should return all deals for a user", async () => {
      const deal: Deal = {
        id: "d1",
        name: "Acme Corp",
        company: "Acme",
        value: 50000,
        stage: "proposal",
        contactId: "c1",
        createdAt: "2026-03-31T00:00:00Z",
        updatedAt: "2026-03-31T00:00:00Z",
      };
      mockKeys.mockResolvedValue(["user1:deal:d1"]);
      mockMget.mockResolvedValue([JSON.stringify(deal)]);

      const deals = await getDeals("user1");

      expect(mockKeys).toHaveBeenCalledWith("user1:deal:*");
      expect(deals).toHaveLength(1);
      expect(deals[0].name).toBe("Acme Corp");
    });

    it("should return empty array when no deals exist", async () => {
      mockKeys.mockResolvedValue([]);

      const deals = await getDeals("user1");

      expect(deals).toEqual([]);
    });
  });

  describe("getDeal", () => {
    it("should return a specific deal", async () => {
      const deal: Deal = {
        id: "d1",
        name: "Acme Corp",
        company: "Acme",
        value: 50000,
        stage: "lead",
        contactId: "c1",
        createdAt: "2026-03-31T00:00:00Z",
        updatedAt: "2026-03-31T00:00:00Z",
      };
      mockGet.mockResolvedValue(JSON.stringify(deal));

      const result = await getDeal("user1", "d1");

      expect(mockGet).toHaveBeenCalledWith("user1:deal:d1");
      expect(result?.name).toBe("Acme Corp");
    });

    it("should return null for missing deal", async () => {
      mockGet.mockResolvedValue(null);

      const result = await getDeal("user1", "missing");

      expect(result).toBeNull();
    });
  });

  describe("createDealRecord", () => {
    it("should create a deal with generated id and timestamps", async () => {
      mockSet.mockResolvedValue("OK");

      const deal = await createDealRecord("user1", {
        name: "New Deal",
        company: "NewCo",
        value: 10000,
        stage: "lead",
        contactId: "c1",
      });

      expect(deal.id).toBeDefined();
      expect(deal.name).toBe("New Deal");
      expect(deal.createdAt).toBeDefined();
      expect(deal.updatedAt).toBeDefined();
      expect(mockSet).toHaveBeenCalledWith(
        `user1:deal:${deal.id}`,
        JSON.stringify(deal)
      );
    });
  });

  describe("getContacts", () => {
    it("should return all contacts for a user", async () => {
      const contact: Contact = {
        id: "c1",
        name: "Jane Smith",
        email: "jane@acme.com",
        company: "Acme",
        role: "VP Sales",
        createdAt: "2026-03-31T00:00:00Z",
      };
      mockKeys.mockResolvedValue(["user1:contact:c1"]);
      mockMget.mockResolvedValue([JSON.stringify(contact)]);

      const contacts = await getContacts("user1");

      expect(contacts).toHaveLength(1);
      expect(contacts[0].name).toBe("Jane Smith");
    });
  });

  describe("getContact", () => {
    it("should return a specific contact", async () => {
      const contact: Contact = {
        id: "c1",
        name: "Jane Smith",
        email: "jane@acme.com",
        company: "Acme",
        role: "VP Sales",
        createdAt: "2026-03-31T00:00:00Z",
      };
      mockGet.mockResolvedValue(JSON.stringify(contact));

      const result = await getContact("user1", "c1");

      expect(result?.email).toBe("jane@acme.com");
    });
  });

  describe("getActivities", () => {
    it("should return activities for a deal", async () => {
      const activity = {
        id: "a1",
        dealId: "d1",
        contactId: "c1",
        type: "email",
        summary: "Sent proposal",
        createdAt: "2026-03-31T00:00:00Z",
      };
      mockKeys.mockResolvedValue(["user1:activity:d1:a1"]);
      mockMget.mockResolvedValue([JSON.stringify(activity)]);

      const activities = await getActivities("user1", "d1");

      expect(activities).toHaveLength(1);
      expect(activities[0].summary).toBe("Sent proposal");
    });
  });

  describe("createActivityRecord", () => {
    it("should create an activity with generated id and timestamp", async () => {
      mockSet.mockResolvedValue("OK");

      const activity = await createActivityRecord("user1", {
        dealId: "d1",
        contactId: "c1",
        type: "call",
        summary: "Discovery call",
      });

      expect(activity.id).toBeDefined();
      expect(activity.type).toBe("call");
      expect(activity.createdAt).toBeDefined();
    });
  });

  describe("seedDemoData", () => {
    it("should create demo deals, contacts, and activities", async () => {
      mockSet.mockResolvedValue("OK");

      await seedDemoData("user1");

      // Should have created multiple records
      expect(mockSet).toHaveBeenCalled();
      const calls = mockSet.mock.calls;
      const dealCalls = calls.filter((c: string[]) =>
        c[0].includes(":deal:")
      );
      const contactCalls = calls.filter((c: string[]) =>
        c[0].includes(":contact:")
      );
      const activityCalls = calls.filter((c: string[]) =>
        c[0].includes(":activity:")
      );

      expect(dealCalls.length).toBeGreaterThanOrEqual(3);
      expect(contactCalls.length).toBeGreaterThanOrEqual(3);
      expect(activityCalls.length).toBeGreaterThanOrEqual(3);
    });
  });
});
