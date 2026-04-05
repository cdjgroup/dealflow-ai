import { tool } from "ai";
import { z } from "zod";
import { getDeals, getContacts, getActivities } from "@/lib/data/crm";
import { createAction, getActions } from "@/lib/data/actions";
import { getUserSettings } from "@/lib/data/settings";
import type { ActionType, ActionPriority, ActionDraft } from "@/lib/types/actions";

interface SuggestionInput {
  type: ActionType;
  priority: ActionPriority;
  dealId: string;
  dealName: string;
  contactName: string;
  justification: string;
  draft: ActionDraft;
}

/**
 * Creates the analyzePipeline tool, scoped to a specific user.
 * The AI reads deals, contacts, and activities, then creates
 * suggested actions in the Action Center for user review.
 */
export function createAnalyzePipelineTool(userId: string) {
  return tool({
    description:
      "Analyze the user's sales pipeline and generate suggested next actions (emails, meetings, Slack messages) in the Action Center. Use this when the user asks you to review their pipeline, suggest next steps, or generate action items. The suggestions appear at /dashboard/actions for the user to review, edit, and approve before execution.",
    inputSchema: z.object({
      focus: z
        .enum(["all", "stale", "high-value", "new-leads"])
        .optional()
        .default("all")
        .describe(
          "Which deals to focus on: all, stale (no recent activity), high-value (>$50K), or new-leads"
        ),
    }),
    execute: async ({ focus }: { focus: string }) => {
      const [deals, contacts, existingActions, settings] = await Promise.all([
        getDeals(userId),
        getContacts(userId),
        getActions(userId),
        getUserSettings(userId),
      ]);

      if (deals.length === 0) {
        return {
          suggestions: 0,
          message:
            "No deals found in your pipeline. Seed demo data or create deals first.",
        };
      }

      const contactMap = new Map(contacts.map((c) => [c.id, c]));
      const now = Date.now();
      const suggestions: SuggestionInput[] = [];

      // Track existing action deal+type combos to avoid duplicates
      const existingKeys = new Set(
        existingActions
          .filter((a) => a.status !== "dismissed")
          .map((a) => `${a.dealId}:${a.type}`)
      );

      for (const deal of deals) {
        const contact = contactMap.get(deal.contactId);
        if (!contact) continue;

        const daysSinceUpdate = Math.floor(
          (now - new Date(deal.updatedAt).getTime()) / (1000 * 60 * 60 * 24)
        );
        const activities = await getActivities(userId, deal.id);
        const lastActivity = activities.length > 0
          ? activities.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
          : null;

        // Apply focus filter
        if (focus === "stale" && daysSinceUpdate < 5) continue;
        if (focus === "high-value" && deal.value < 50000) continue;
        if (focus === "new-leads" && deal.stage !== "lead") continue;

        // Suggest email follow-up for stale deals
        if (
          daysSinceUpdate >= 3 &&
          !existingKeys.has(`${deal.id}:email`)
        ) {
          const priority: ActionPriority =
            deal.value >= 50000 ? "high" : daysSinceUpdate >= 7 ? "high" : "medium";

          suggestions.push({
            type: "email",
            priority,
            dealId: deal.id,
            dealName: deal.name,
            contactName: contact.name,
            justification: `${deal.name} ($${deal.value.toLocaleString()}) has had no activity for ${daysSinceUpdate} days in ${deal.stage} stage. A follow-up email keeps the deal moving.`,
            draft: {
              to: contact.email,
              subject: `Following up — ${deal.name}`,
              body: `Hi ${contact.name.split(" ")[0]},\n\nI wanted to check in on ${deal.name}. ${lastActivity ? `Last we spoke, ${lastActivity.summary.toLowerCase().replace(/\.$/, "")}` : "I'd love to hear how things are progressing"}.\n\nDo you have time this week for a quick call?\n\nBest regards`,
            },
          });
        }

        // Suggest calendar event for qualified deals needing demos
        if (
          deal.stage === "qualified" &&
          !existingKeys.has(`${deal.id}:calendar`)
        ) {
          const demoDate = new Date(now + 3 * 24 * 60 * 60 * 1000);
          suggestions.push({
            type: "calendar",
            priority: "high",
            dealId: deal.id,
            dealName: deal.name,
            contactName: contact.name,
            justification: `${deal.name} is in qualified stage — scheduling a demo is the logical next step to advance toward proposal.`,
            draft: {
              title: `${deal.name} — Product Demo`,
              date: demoDate.toISOString().split("T")[0],
              time: "14:00",
              duration: 45,
              attendees: [contact.email],
              notes: `Demo for ${contact.name} (${contact.role} at ${contact.company}). Deal value: $${deal.value.toLocaleString()}.`,
            },
          });
        }

        // Suggest Slack update for deals in negotiation
        if (
          deal.stage === "negotiation" &&
          !existingKeys.has(`${deal.id}:slack`)
        ) {
          suggestions.push({
            type: "slack",
            priority: "medium",
            dealId: deal.id,
            dealName: deal.name,
            contactName: contact.name,
            justification: `${deal.name} ($${deal.value.toLocaleString()}) is in negotiation. Keeping the team updated shows pipeline momentum.`,
            draft: {
              channel: "#sales-team",
              message: `Pipeline update: ${deal.name} ($${deal.value.toLocaleString()}) is in negotiation with ${contact.name} at ${contact.company}. ${lastActivity ? `Latest: ${lastActivity.summary}` : "Awaiting next steps."}`,
            },
          });
        }
      }

      // Create actions in Redis
      // Autonomy gate: level 2+ auto-approves high/medium priority actions
      let created = 0;
      for (const suggestion of suggestions) {
        const initialStatus =
          settings.autonomyLevel >= 2 && suggestion.priority !== "low"
            ? "approved"
            : "pending";
        await createAction(userId, { ...suggestion, status: initialStatus });
        created++;
      }

      const typeBreakdown = suggestions.reduce(
        (acc, s) => {
          acc[s.type] = (acc[s.type] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>
      );

      return {
        suggestions: created,
        breakdown: typeBreakdown,
        message:
          created > 0
            ? `Created ${created} suggested actions in your Action Center. Go to /dashboard/actions to review, edit, and approve them.`
            : "No new actions to suggest — your pipeline looks well-maintained, or suggestions already exist for active deals.",
        dealsAnalyzed: deals.length,
        focus,
      };
    },
  });
}
