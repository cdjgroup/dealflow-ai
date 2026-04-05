import { tool } from "ai";
import { generateText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import { getDeals, getContacts, getActivities } from "@/lib/data/crm";
import { createAction, getActions } from "@/lib/data/actions";
import { getUserSettings } from "@/lib/data/settings";
import type { ActionType, ActionPriority, ActionDraft } from "@/lib/types/actions";
import { draftSchema } from "@/lib/schemas/action-draft";

interface SuggestionInput {
  type: ActionType;
  priority: ActionPriority;
  dealId: string;
  dealName: string;
  contactName: string;
  justification: string;
  draft: ActionDraft;
  confidence?: number;
}

function matchesFocusFilter(
  deal: { value: number; stage: string },
  daysSinceUpdate: number,
  focus: string
): boolean {
  if (focus === "stale" && daysSinceUpdate < 5) return false;
  if (focus === "high-value" && deal.value < 50000) return false;
  if (focus === "new-leads" && deal.stage !== "lead") return false;
  return true;
}

interface DealContext {
  dealId: string;
  dealName: string;
  stage: string;
  value: number;
  contactName: string;
  contactEmail: string;
  contactRole: string;
  contactCompany: string;
  daysSinceUpdate: number;
  lastActivitySummary: string | null;
  activityCount: number;
}

const emailDraftSchema = z.object({
  to: z.string(),
  subject: z.string(),
  body: z.string(),
});

const calendarDraftSchema = z.object({
  title: z.string(),
  date: z.string(),
  time: z.string(),
  duration: z.number(),
  attendees: z.array(z.string()),
  notes: z.string().optional(),
});

const slackDraftSchema = z.object({
  channel: z.string(),
  message: z.string(),
});

const suggestionItemSchema = z.object({
  type: z.enum(["email", "calendar", "slack"]),
  priority: z.enum(["high", "medium", "low"]),
  dealId: z.string(),
  dealName: z.string(),
  contactName: z.string(),
  confidence: z.number().min(0).max(1),
  justification: z.string(),
  draft: z.union([emailDraftSchema, calendarDraftSchema, slackDraftSchema]),
});

const suggestionsOutputSchema = z.object({
  suggestions: z.array(suggestionItemSchema),
});

const SYSTEM_PROMPT = `You are a sales pipeline AI assistant. Analyze the provided deal data and suggest specific actions the salesperson should take.

Rules:
- Only suggest these action types: email (follow-up), calendar (meeting/demo), slack (team update)
- Do NOT suggest actions for deals that already have a suggestion (listed in existingActions)
- Add a confidence score (0.0-1.0) reflecting how certain you are this action is needed right now
- Personalize all content using the contact's name, role, company, and deal context
- For email drafts: include "to" (email), "subject", and "body" fields. Body should be professional but warm.
- For calendar drafts: include "title", "date" (YYYY-MM-DD, schedule 3 days from now), "time" (HH:MM, default 14:00), "duration" (minutes), "attendees" (array of emails), and optional "notes"
- For slack drafts: include "channel" (#sales-team) and "message"
- Priority: "high" for deals >$50K or stale >7 days, "medium" for moderately stale (3-7 days), "low" for routine updates
- Be specific in justifications — reference deal value, stage, days inactive, and what happened last

Return ONLY a JSON object (no markdown, no wrapping, no explanation) with this exact structure:
{"suggestions": [{"type": "email"|"calendar"|"slack", "priority": "high"|"medium"|"low", "dealId": "...", "dealName": "...", "contactName": "...", "confidence": 0.0-1.0, "justification": "...", "draft": {...}}]}

Email draft: {"to": "email", "subject": "...", "body": "..."}
Calendar draft: {"title": "...", "date": "YYYY-MM-DD", "time": "HH:MM", "duration": minutes, "attendees": ["email"], "notes": "..."}
Slack draft: {"channel": "#sales-team", "message": "..."}`;

async function generateLLMSuggestions(
  dealContexts: DealContext[],
  existingKeys: Set<string>,
  focus: string,
  abortSignal?: AbortSignal
): Promise<SuggestionInput[]> {
  const { text } = await generateText({
    model: anthropic("claude-haiku-4-5-20251001"),
    system: SYSTEM_PROMPT,
    prompt: JSON.stringify({
      deals: dealContexts,
      existingActions: Array.from(existingKeys),
      focus,
      today: new Date().toISOString().split("T")[0],
    }),
    maxRetries: 1,
    abortSignal,
  });

  // Strip markdown fences if present
  const cleaned = text.replace(/^```(?:json)?\s*/m, "").replace(/\s*```\s*$/m, "").trim();
  const parsed = suggestionsOutputSchema.safeParse(JSON.parse(cleaned));
  if (!parsed.success) {
    console.warn("LLM output failed schema validation:", parsed.error.issues);
    return [];
  }

  // Filter out suggestions for deals that already have actions
  return parsed.data.suggestions
    .filter((s) => !existingKeys.has(`${s.dealId}:${s.type}`))
    .map((s) => ({
      type: s.type as ActionType,
      priority: s.priority as ActionPriority,
      dealId: s.dealId,
      dealName: s.dealName,
      contactName: s.contactName,
      justification: s.justification,
      confidence: s.confidence,
      draft: s.draft as ActionDraft,
    }));
}

function generateHeuristicSuggestions(
  deals: Array<{ id: string; name: string; value: number; stage: string; contactId: string; updatedAt: string }>,
  contactMap: Map<string, { id: string; name: string; email: string; role: string; company: string }>,
  existingKeys: Set<string>,
  focus: string,
  activitiesByDeal: Map<string, Array<{ summary: string; createdAt: string }>>
): SuggestionInput[] {
  const now = Date.now();
  const suggestions: SuggestionInput[] = [];

  for (const deal of deals) {
    const contact = contactMap.get(deal.contactId);
    if (!contact) continue;

    const daysSinceUpdate = Math.floor(
      (now - new Date(deal.updatedAt).getTime()) / (1000 * 60 * 60 * 24)
    );
    const activities = activitiesByDeal.get(deal.id) ?? [];
    const lastActivity = activities.length > 0
      ? activities.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
      : null;

    if (!matchesFocusFilter(deal, daysSinceUpdate, focus)) continue;

    if (daysSinceUpdate >= 3 && !existingKeys.has(`${deal.id}:email`)) {
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

    if (deal.stage === "qualified" && !existingKeys.has(`${deal.id}:calendar`)) {
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

    if (deal.stage === "negotiation" && !existingKeys.has(`${deal.id}:slack`)) {
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

  return suggestions;
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
    execute: async ({ focus }: { focus: string }, { abortSignal }) => {
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

      // Track existing action deal+type combos to avoid duplicates
      const existingKeys = new Set(
        existingActions
          .filter((a) => a.status !== "dismissed")
          .map((a) => `${a.dealId}:${a.type}`)
      );

      // Fetch all activities in parallel to avoid N+1 sequential queries
      const now = Date.now();
      const activityResults = await Promise.all(
        deals.map((d) => getActivities(userId, d.id))
      );
      const activitiesByDeal = new Map(
        deals.map((d, i) => [d.id, activityResults[i]])
      );

      const dealContexts: DealContext[] = [];
      for (const deal of deals) {
        const contact = contactMap.get(deal.contactId);
        if (!contact) continue;

        const daysSinceUpdate = Math.floor(
          (now - new Date(deal.updatedAt).getTime()) / (1000 * 60 * 60 * 24)
        );
        const activities = activitiesByDeal.get(deal.id) ?? [];
        const lastActivity = activities.length > 0
          ? activities.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
          : null;

        if (!matchesFocusFilter(deal, daysSinceUpdate, focus)) continue;

        dealContexts.push({
          dealId: deal.id,
          dealName: deal.name,
          stage: deal.stage,
          value: deal.value,
          contactName: contact.name,
          contactEmail: contact.email,
          contactRole: contact.role,
          contactCompany: contact.company,
          daysSinceUpdate,
          lastActivitySummary: lastActivity?.summary ?? null,
          activityCount: activities.length,
        });
      }

      // Try LLM generation, fall back to heuristics
      let suggestions: SuggestionInput[];
      let generationMethod: "ai" | "heuristic" = "ai";
      try {
        suggestions = await generateLLMSuggestions(
          dealContexts,
          existingKeys,
          focus,
          abortSignal
        );
      } catch (err) {
        console.error("LLM suggestion generation failed, falling back to heuristics:", err);
        generationMethod = "heuristic";
        suggestions = generateHeuristicSuggestions(
          deals,
          contactMap,
          existingKeys,
          focus,
          activitiesByDeal
        );
      }

      // Validate drafts against strict schema before writing to Redis
      const validated = suggestions.filter((s) => {
        const result = draftSchema.safeParse(s.draft);
        if (!result.success) {
          console.warn(`Draft validation failed for ${s.type} action (${s.dealName}):`, result.error.issues);
        }
        return result.success;
      });

      // Create actions in Redis
      // Autonomy gate: level 2+ auto-approves high/medium priority actions
      let created = 0;
      // Autonomy gate: level 2+ auto-approves high/medium priority actions
      for (const suggestion of validated) {
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
        generationMethod,
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
