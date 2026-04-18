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
const mockMget = vi.fn();
const mockSmembers = vi.fn();
const mockSadd = vi.fn();

// Pipeline mock: collects calls and executes them on exec()
function createMockPipeline() {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  return {
    set: vi.fn((...args: unknown[]) => { calls.push({ method: "set", args }); }),
    sadd: vi.fn((...args: unknown[]) => { calls.push({ method: "sadd", args }); }),
    del: vi.fn((...args: unknown[]) => { calls.push({ method: "del", args }); }),
    exec: vi.fn(async () => calls.map(() => "OK")),
    _calls: calls,
  };
}
const mockPipeline = vi.fn(() => createMockPipeline());

vi.mock("@/lib/redis", () => ({
  getRedis: () => ({
    get: mockGet,
    set: mockSet,
    del: mockDel,
    mget: mockMget,
    smembers: mockSmembers,
    sadd: mockSadd,
    pipeline: mockPipeline,
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
      mockSmembers.mockResolvedValue(["d1"]);
      mockMget.mockResolvedValue([JSON.stringify(deal)]);

      const deals = await getDeals("user1");

      expect(mockSmembers).toHaveBeenCalledWith("user1:_idx:deals");
      expect(mockMget).toHaveBeenCalledWith("user1:deal:d1");
      expect(deals).toHaveLength(1);
      expect(deals[0].name).toBe("Acme Corp");
    });

    it("should return empty array when no deals exist", async () => {
      mockSmembers.mockResolvedValue([]);

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
    it("should create a deal with generated id and timestamps via pipeline", async () => {
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
      expect(mockPipeline).toHaveBeenCalled();

      const pipeline = mockPipeline.mock.results[0].value;
      expect(pipeline.set).toHaveBeenCalledWith(
        `user1:deal:${deal.id}`,
        JSON.stringify(deal)
      );
      expect(pipeline.sadd).toHaveBeenCalledWith(
        "user1:_idx:deals",
        deal.id
      );
      expect(pipeline.exec).toHaveBeenCalled();
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
      mockSmembers.mockResolvedValue(["c1"]);
      mockMget.mockResolvedValue([JSON.stringify(contact)]);

      const contacts = await getContacts("user1");

      expect(mockSmembers).toHaveBeenCalledWith("user1:_idx:contacts");
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
      mockSmembers.mockResolvedValue(["a1"]);
      mockMget.mockResolvedValue([JSON.stringify(activity)]);

      const activities = await getActivities("user1", "d1");

      expect(mockSmembers).toHaveBeenCalledWith("user1:_idx:activities:d1");
      expect(activities).toHaveLength(1);
      expect(activities[0].summary).toBe("Sent proposal");
    });
  });

  describe("createActivityRecord", () => {
    it("should create an activity with generated id and timestamp via pipeline", async () => {
      const activity = await createActivityRecord("user1", {
        dealId: "d1",
        contactId: "c1",
        type: "call",
        summary: "Discovery call",
      });

      expect(activity.id).toBeDefined();
      expect(activity.type).toBe("call");
      expect(activity.createdAt).toBeDefined();
      expect(mockPipeline).toHaveBeenCalled();

      const pipeline = mockPipeline.mock.results[0].value;
      expect(pipeline.exec).toHaveBeenCalled();
    });
  });

  describe("seedDemoData", () => {
    it("should create demo deals, contacts, and activities via pipeline", async () => {
      const result = await seedDemoData("user1");

      expect(result.deals).toBe(8);
      expect(result.contacts).toBe(7);
      expect(result.activities).toBe(12);
      expect(mockPipeline).toHaveBeenCalled();

      const pipeline = mockPipeline.mock.results[0].value;
      expect(pipeline.exec).toHaveBeenCalled();

      // Pipeline should have set + sadd for each record
      const setCalls = pipeline.set.mock.calls;
      const saddCalls = pipeline.sadd.mock.calls;

      const dealSets = setCalls.filter((c: string[]) => c[0].includes(":deal:"));
      const contactSets = setCalls.filter((c: string[]) => c[0].includes(":contact:"));
      const activitySets = setCalls.filter((c: string[]) => c[0].includes(":activity:"));

      expect(dealSets).toHaveLength(8);
      expect(contactSets).toHaveLength(7);
      expect(activitySets).toHaveLength(12);
      expect(saddCalls.length).toBe(27); // 8 + 7 + 12 index entries
    });
  });
});
