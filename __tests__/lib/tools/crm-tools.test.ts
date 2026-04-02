import { describe, it, expect, vi, beforeEach } from "vitest";
import { createCrmTools } from "@/lib/tools/crm";
import type { Deal, Contact, Activity } from "@/lib/data/crm";

// Helper: tool.execute may be undefined and returns a union type at the TS level.
// At runtime it always returns the plain object. This helper handles the type narrowing.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function exec(tool: { execute?: (...args: any[]) => any }, input: Record<string, unknown> = {}) {
  return tool.execute!(input, { toolCallId: "test", messages: [], abortSignal: undefined as unknown as AbortSignal });
}

const mockGetDeals = vi.fn();
const mockGetDeal = vi.fn();
const mockCreateDealRecord = vi.fn();
const mockUpdateDealRecord = vi.fn();
const mockGetContacts = vi.fn();
const mockGetContact = vi.fn();
const mockCreateContactRecord = vi.fn();
const mockGetActivities = vi.fn();
const mockCreateActivityRecord = vi.fn();

vi.mock("@/lib/data/crm", () => ({
  getDeals: (...args: unknown[]) => mockGetDeals(...args),
  getDeal: (...args: unknown[]) => mockGetDeal(...args),
  createDealRecord: (...args: unknown[]) => mockCreateDealRecord(...args),
  updateDealRecord: (...args: unknown[]) => mockUpdateDealRecord(...args),
  getContacts: (...args: unknown[]) => mockGetContacts(...args),
  getContact: (...args: unknown[]) => mockGetContact(...args),
  createContactRecord: (...args: unknown[]) => mockCreateContactRecord(...args),
  getActivities: (...args: unknown[]) => mockGetActivities(...args),
  createActivityRecord: (...args: unknown[]) => mockCreateActivityRecord(...args),
}));

const sampleDeal: Deal = {
  id: "d1",
  name: "Acme Corp Deal",
  company: "Acme",
  value: 50000,
  stage: "proposal",
  contactId: "c1",
  createdAt: "2026-03-31T00:00:00Z",
  updatedAt: "2026-03-31T00:00:00Z",
};

const sampleContact: Contact = {
  id: "c1",
  name: "Jane Smith",
  email: "jane@acme.com",
  company: "Acme",
  role: "VP Sales",
  createdAt: "2026-03-31T00:00:00Z",
};

const sampleActivity: Activity = {
  id: "a1",
  dealId: "d1",
  contactId: "c1",
  type: "email",
  summary: "Sent proposal",
  createdAt: "2026-03-31T00:00:00Z",
};

describe("CRM Tools", () => {
  const tools = createCrmTools("user1");

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("listDeals", () => {
    it("should call getDeals with userId and format values correctly", async () => {
      const deal2: Deal = {
        ...sampleDeal,
        id: "d2",
        name: "Beta Deal",
        value: 25000,
      };
      mockGetDeals.mockResolvedValue([sampleDeal, deal2]);

      const result = await exec(tools.listDeals);

      expect(mockGetDeals).toHaveBeenCalledWith("user1");
      expect(result.deals).toHaveLength(2);
      expect(result.deals[0].value).toBe("$50,000");
      expect(result.deals[1].value).toBe("$25,000");
      expect(result.totalValue).toBe("$75,000");
      expect(result.count).toBe(2);
    });

    it("should return empty list when no deals exist", async () => {
      mockGetDeals.mockResolvedValue([]);

      const result = await exec(tools.listDeals);

      expect(result.deals).toEqual([]);
      expect(result.totalValue).toBe("$0");
      expect(result.count).toBe(0);
    });
  });

  describe("getDealDetails", () => {
    it("should return deal with contact and activities", async () => {
      mockGetDeal.mockResolvedValue(sampleDeal);
      mockGetActivities.mockResolvedValue([sampleActivity]);
      mockGetContact.mockResolvedValue(sampleContact);

      const result = await exec(tools.getDealDetails, { dealId: "d1" });

      expect(mockGetDeal).toHaveBeenCalledWith("user1", "d1");
      expect(mockGetActivities).toHaveBeenCalledWith("user1", "d1");
      expect(mockGetContact).toHaveBeenCalledWith("user1", "c1");
      expect(result.deal).toEqual(sampleDeal);
      expect(result.contact).toEqual({
        name: "Jane Smith",
        email: "jane@acme.com",
        role: "VP Sales",
      });
      expect(result.activities).toHaveLength(1);
      expect(result.activities[0].type).toBe("email");
      expect(result.activities[0].summary).toBe("Sent proposal");
    });

    it("should return error when deal not found", async () => {
      mockGetDeal.mockResolvedValue(null);

      const result = await exec(tools.getDealDetails, { dealId: "missing" });

      expect(result).toEqual({ error: "Deal not found" });
      expect(mockGetActivities).not.toHaveBeenCalled();
    });
  });

  describe("searchContacts", () => {
    it("should filter contacts by name case-insensitively", async () => {
      const contacts: Contact[] = [
        sampleContact,
        { ...sampleContact, id: "c2", name: "Bob Jones", email: "bob@other.com", company: "Other Inc" },
      ];
      mockGetContacts.mockResolvedValue(contacts);

      const result = await exec(tools.searchContacts, { query: "jane" });

      expect(mockGetContacts).toHaveBeenCalledWith("user1");
      expect(result.contacts).toHaveLength(1);
      expect(result.contacts[0].name).toBe("Jane Smith");
      expect(result.count).toBe(1);
    });

    it("should filter contacts by email", async () => {
      mockGetContacts.mockResolvedValue([sampleContact]);

      const result = await exec(tools.searchContacts, { query: "acme.com" });

      expect(result.contacts).toHaveLength(1);
    });

    it("should filter contacts by company", async () => {
      mockGetContacts.mockResolvedValue([sampleContact]);

      const result = await exec(tools.searchContacts, { query: "ACME" });

      expect(result.contacts).toHaveLength(1);
    });

    it("should return empty when no contacts match", async () => {
      mockGetContacts.mockResolvedValue([sampleContact]);

      const result = await exec(tools.searchContacts, { query: "nonexistent" });

      expect(result.contacts).toEqual([]);
      expect(result.count).toBe(0);
    });
  });

  describe("createDeal", () => {
    it("should call createDealRecord with correct params", async () => {
      const newDeal: Deal = {
        ...sampleDeal,
        id: "d99",
        stage: "lead",
      };
      mockCreateDealRecord.mockResolvedValue(newDeal);

      const result = await exec(tools.createDeal, {
          name: "Acme Corp Deal",
          company: "Acme",
          value: 50000,
          stage: "lead",
          contactId: "c1",
        });

      expect(mockCreateDealRecord).toHaveBeenCalledWith("user1", {
        name: "Acme Corp Deal",
        company: "Acme",
        value: 50000,
        stage: "lead",
        contactId: "c1",
      });
      expect(result.success).toBe(true);
      expect(result.deal).toEqual(newDeal);
    });
  });

  describe("updateDeal", () => {
    it("should call updateDealRecord with correct params", async () => {
      const updatedDeal: Deal = {
        ...sampleDeal,
        stage: "negotiation",
        value: 60000,
      };
      mockUpdateDealRecord.mockResolvedValue(updatedDeal);

      const result = await exec(tools.updateDeal, { dealId: "d1", stage: "negotiation", value: 60000 });

      expect(mockUpdateDealRecord).toHaveBeenCalledWith("user1", "d1", {
        stage: "negotiation",
        value: 60000,
      });
      expect(result.success).toBe(true);
      expect(result.deal).toEqual(updatedDeal);
    });

    it("should return error when deal not found", async () => {
      mockUpdateDealRecord.mockResolvedValue(null);

      const result = await exec(tools.updateDeal, { dealId: "missing", stage: "proposal" });

      expect(result).toEqual({ error: "Deal not found" });
    });
  });

  describe("createContact", () => {
    it("should call createContactRecord with correct params", async () => {
      mockCreateContactRecord.mockResolvedValue(sampleContact);

      const result = await exec(tools.createContact, {
          name: "Jane Smith",
          email: "jane@acme.com",
          company: "Acme",
          role: "VP Sales",
        });

      expect(mockCreateContactRecord).toHaveBeenCalledWith("user1", {
        name: "Jane Smith",
        email: "jane@acme.com",
        company: "Acme",
        role: "VP Sales",
        phone: undefined,
      });
      expect(result.success).toBe(true);
      expect(result.contact).toEqual(sampleContact);
    });
  });

  describe("logActivity", () => {
    it("should call createActivityRecord with correct params", async () => {
      mockCreateActivityRecord.mockResolvedValue(sampleActivity);

      const result = await exec(tools.logActivity, {
          dealId: "d1",
          contactId: "c1",
          type: "email",
          summary: "Sent proposal",
        });

      expect(mockCreateActivityRecord).toHaveBeenCalledWith("user1", {
        dealId: "d1",
        contactId: "c1",
        type: "email",
        summary: "Sent proposal",
      });
      expect(result.success).toBe(true);
      expect(result.activity).toEqual(sampleActivity);
    });
  });
});
