import { tool } from "ai";
import { z } from "zod";
import {
  getDeals,
  getDeal,
  createDealRecord,
  getContacts,
  getContact,
  getActivities,
  createActivityRecord,
} from "@/lib/data/crm";

export function createCrmTools(userId: string) {
  const listDeals = tool({
    description:
      "List all deals in the CRM pipeline. Shows deal name, company, value, stage, and contact.",
    inputSchema: z.object({}),
    execute: async () => {
      const deals = await getDeals(userId);
      return {
        deals: deals.map((d) => ({
          id: d.id,
          name: d.name,
          company: d.company,
          value: `$${d.value.toLocaleString()}`,
          stage: d.stage,
          contactId: d.contactId,
        })),
        totalValue: `$${deals.reduce((sum, d) => sum + d.value, 0).toLocaleString()}`,
        count: deals.length,
      };
    },
  });

  const getDealDetails = tool({
    description:
      "Get detailed information about a specific deal including its activity history.",
    inputSchema: z.object({
      dealId: z.string().describe("The deal ID"),
    }),
    execute: async ({ dealId }) => {
      const deal = await getDeal(userId, dealId);
      if (!deal) return { error: "Deal not found" };

      const activities = await getActivities(userId, dealId);
      const contact = await getContact(userId, deal.contactId);

      return {
        deal,
        contact: contact
          ? { name: contact.name, email: contact.email, role: contact.role }
          : null,
        activities: activities.map((a) => ({
          type: a.type,
          summary: a.summary,
          date: a.createdAt,
        })),
      };
    },
  });

  const searchContacts = tool({
    description:
      "Search contacts in the CRM by name, email, or company. Returns matching contacts.",
    inputSchema: z.object({
      query: z
        .string()
        .describe("Search term — matches against name, email, or company"),
    }),
    execute: async ({ query }) => {
      const contacts = await getContacts(userId);
      const q = query.toLowerCase();
      const matches = contacts.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.email.toLowerCase().includes(q) ||
          c.company.toLowerCase().includes(q)
      );
      return { contacts: matches, count: matches.length };
    },
  });

  const createDeal = tool({
    description:
      "Create a new deal in the CRM pipeline. Requires a name, company, value, and associated contact.",
    inputSchema: z.object({
      name: z.string().describe("Deal name"),
      company: z.string().describe("Company name"),
      value: z.number().describe("Deal value in dollars"),
      stage: z
        .enum([
          "lead",
          "qualified",
          "proposal",
          "negotiation",
          "closed-won",
          "closed-lost",
        ])
        .default("lead")
        .describe("Pipeline stage"),
      contactId: z.string().describe("Associated contact ID"),
    }),
    execute: async ({ name, company, value, stage, contactId }) => {
      const deal = await createDealRecord(userId, {
        name,
        company,
        value,
        stage,
        contactId,
      });
      return { success: true, deal };
    },
  });

  const logActivity = tool({
    description:
      "Log an activity (email, call, meeting, or note) on a deal. Use this to record interactions with contacts.",
    inputSchema: z.object({
      dealId: z.string().describe("The deal ID"),
      contactId: z.string().describe("The contact ID"),
      type: z
        .enum(["email", "call", "meeting", "note"])
        .describe("Activity type"),
      summary: z.string().describe("Brief summary of the activity"),
    }),
    execute: async ({ dealId, contactId, type, summary }) => {
      const activity = await createActivityRecord(userId, {
        dealId,
        contactId,
        type,
        summary,
      });
      return { success: true, activity };
    },
  });

  return { listDeals, getDealDetails, searchContacts, createDeal, logActivity };
}
