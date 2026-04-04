import { getRedis } from "@/lib/redis";
import type {
  SuggestedAction,
  ActionStatus,
  ActionDraft,
} from "@/lib/types/actions";

function genId(): string {
  return crypto.randomUUID().replace(/-/g, "").substring(0, 12);
}

function now(): string {
  return new Date().toISOString();
}

function parse<T>(raw: string | null): T | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "object") return raw as T;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function actionKey(userId: string, actionId: string): string {
  return `${userId}:action:${actionId}`;
}

function actionIndexKey(userId: string): string {
  return `${userId}:_idx:actions`;
}

const ACTION_TTL = 30 * 24 * 60 * 60; // 30 days

export async function getActions(
  userId: string,
  filter?: { status?: ActionStatus }
): Promise<SuggestedAction[]> {
  const redis = getRedis();
  const ids = await redis.smembers(actionIndexKey(userId));
  if (ids.length === 0) return [];

  const keys = ids.map((id) => actionKey(userId, id));
  const raws = await redis.mget<string[]>(...keys);

  const actions: SuggestedAction[] = [];
  for (const raw of raws) {
    const action = parse<SuggestedAction>(raw);
    if (!action) continue;
    if (filter?.status && action.status !== filter.status) continue;
    actions.push(action);
  }

  // Sort by priority (high > medium > low), then by createdAt desc
  const priorityOrder = { high: 0, medium: 1, low: 2 };
  actions.sort((a, b) => {
    const pDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
    if (pDiff !== 0) return pDiff;
    return b.createdAt.localeCompare(a.createdAt);
  });

  return actions;
}

export async function getAction(
  userId: string,
  actionId: string
): Promise<SuggestedAction | null> {
  const redis = getRedis();
  const raw = await redis.get<string>(actionKey(userId, actionId));
  return parse<SuggestedAction>(raw);
}

export async function createAction(
  userId: string,
  data: Omit<SuggestedAction, "id" | "userId" | "createdAt" | "updatedAt">
): Promise<SuggestedAction> {
  const redis = getRedis();
  const action: SuggestedAction = {
    ...data,
    id: genId(),
    userId,
    createdAt: now(),
    updatedAt: now(),
  };

  const p = redis.pipeline();
  p.set(actionKey(userId, action.id), JSON.stringify(action));
  p.sadd(actionIndexKey(userId), action.id);
  await p.exec();

  return action;
}

export async function updateAction(
  userId: string,
  actionId: string,
  data: Partial<Pick<SuggestedAction, "status" | "draft" | "errorMessage">>
): Promise<SuggestedAction | null> {
  const redis = getRedis();
  const existing = await getAction(userId, actionId);
  if (!existing) return null;

  const updated: SuggestedAction = {
    ...existing,
    ...data,
    updatedAt: now(),
  };

  await redis.set(actionKey(userId, actionId), JSON.stringify(updated));
  return updated;
}

export async function batchUpdateStatus(
  userId: string,
  actionIds: string[],
  status: ActionStatus
): Promise<SuggestedAction[]> {
  const results: SuggestedAction[] = [];
  for (const id of actionIds) {
    const existing = await getAction(userId, id);
    if (!existing) continue;
    if (existing.status === status) {
      results.push(existing);
      continue;
    }
    const updated = await updateAction(userId, id, { status });
    if (updated) results.push(updated);
  }
  return results;
}

export async function getPendingActionCount(
  userId: string
): Promise<number> {
  const actions = await getActions(userId);
  return actions.filter((a) => a.status === "pending").length;
}

// --- Seed Data ---

function daysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

const SEED_ACTIONS: Omit<SuggestedAction, "userId" | "createdAt" | "updatedAt">[] = [
  {
    id: "act1",
    type: "email",
    status: "pending",
    priority: "high",
    dealId: "d1",
    dealName: "Meridian Platform Migration",
    contactName: "Sarah Chen",
    justification:
      "Sarah hasn't responded to the proposal sent 10 days ago. An $85K deal in proposal stage needs a gentle follow-up to keep momentum.",
    draft: {
      to: "schen@meridian.tech",
      subject: "Following up on Meridian Platform Migration proposal",
      body: "Hi Sarah,\n\nI wanted to check in on the platform migration proposal we sent over. I know these decisions take time, and I'm happy to walk through any questions your team might have.\n\nWould it help to schedule a quick call this week to discuss next steps?\n\nBest regards",
    } as ActionDraft,
  },
  {
    id: "act2",
    type: "calendar",
    status: "pending",
    priority: "high",
    dealId: "d3",
    dealName: "BrightPath Onboarding System",
    contactName: "Elena Rodriguez",
    justification:
      "Elena requested a product demo last week. The $28K deal is in qualified stage — scheduling the demo promptly keeps the sales cycle on track.",
    draft: {
      title: "BrightPath Onboarding System — Product Demo",
      date: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
      time: "14:00",
      duration: 45,
      attendees: ["erodriguez@brightpath.com"],
      notes: "Demo focus: onboarding workflow automation, SSO integration, reporting dashboard",
    } as ActionDraft,
  },
  {
    id: "act3",
    type: "slack",
    status: "pending",
    priority: "medium",
    dealId: "d2",
    dealName: "Vantage API Integration",
    contactName: "Marcus Thompson",
    justification:
      "Legal review is in progress on the $42K Vantage deal. A quick #sales-team update keeps stakeholders informed and shows pipeline momentum.",
    draft: {
      channel: "#sales-team",
      message:
        "Pipeline update: Vantage API Integration ($42K) is in legal review. Contract terms are being finalized — expecting signed agreement by end of next week. Two other deals moved forward this week: Meridian (proposal) and BrightPath (demo scheduling).",
    } as ActionDraft,
  },
  {
    id: "act4",
    type: "email",
    status: "pending",
    priority: "medium",
    dealId: "d4",
    dealName: "Pinnacle Dev Tools License",
    contactName: "James Wilson",
    justification:
      "James is a new lead with no follow-up yet. The $15K opportunity needs an introductory email to start the relationship and qualify the lead.",
    draft: {
      to: "jwilson@pinnacle.dev",
      subject: "Exploring Dev Tools solutions for Pinnacle",
      body: "Hi James,\n\nI noticed Pinnacle Dev is exploring developer tooling solutions. I'd love to learn more about your team's workflow and see if we might be a good fit.\n\nDo you have 15 minutes this week for a quick intro call?\n\nBest regards",
    } as ActionDraft,
  },
  {
    id: "act5",
    type: "email",
    status: "pending",
    priority: "low",
    dealId: "d2",
    dealName: "Vantage API Integration",
    contactName: "Marcus Thompson",
    justification:
      "Last direct contact with Marcus was 5 days ago during the contract review meeting. A brief check-in shows attentiveness while legal processes continue.",
    draft: {
      to: "mthompson@vantage.io",
      subject: "Quick check-in — Vantage API Integration",
      body: "Hi Marcus,\n\nJust wanted to touch base while the contract review is underway. If there are any technical questions from your team about the API integration scope, I'm happy to hop on a call.\n\nLet me know if there's anything I can help move things along.\n\nBest regards",
    } as ActionDraft,
  },
  {
    id: "act6",
    type: "email",
    status: "pending",
    priority: "high",
    dealId: "d6",
    dealName: "Nova Finance Data Pipeline",
    contactName: "David Kim",
    justification:
      "The $65K Nova Finance proposal was sent but David hasn't responded. As VP of Engineering, he likely needs technical specifics on real-time sync capabilities before moving forward.",
    draft: {
      to: "dkim@novafinance.com",
      subject: "Real-time sync architecture details — Nova Data Pipeline",
      body: "Hi David,\n\nFollowing up on the data pipeline proposal. I put together a brief technical overview of our real-time sync architecture that addresses the requirements you mentioned on our last call.\n\nWould it be helpful to schedule a 30-minute deep dive with our engineering team?\n\nBest regards",
    } as ActionDraft,
  },
  {
    id: "act7",
    type: "calendar",
    status: "pending",
    priority: "high",
    dealId: "d7",
    dealName: "Axon Health Portal Redesign",
    contactName: "Rachel Torres",
    justification:
      "Rachel requested HIPAA compliance details during the demo. The $95K deal is in negotiation — scheduling a compliance review meeting addresses her top concern.",
    draft: {
      title: "Axon Health — HIPAA Compliance & Security Review",
      date: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
      time: "10:00",
      duration: 60,
      attendees: ["rachel.t@axonhealth.co"],
      notes: "Cover: HIPAA BAA, data encryption at rest/transit, audit logging, access controls, SOC 2 certification timeline",
    } as ActionDraft,
  },
  {
    id: "act8",
    type: "slack",
    status: "pending",
    priority: "medium",
    dealId: "d5",
    dealName: "Stratos Cloud Migration",
    contactName: "Priya Patel",
    justification:
      "Stratos Cloud Migration ($120K) just closed. Sharing this win with the team boosts morale and provides context for the upcoming onboarding kickoff.",
    draft: {
      channel: "#sales-team",
      message:
        "Closed-won: Stratos Cloud Migration ($120K) is signed! 12-month engagement with Priya Patel's team. Onboarding kickoff is scheduled. Big thanks to everyone who supported the technical evaluation. Pipeline is looking strong heading into Q2.",
    } as ActionDraft,
  },
];

export async function seedActions(userId: string): Promise<number> {
  const redis = getRedis();
  const p = redis.pipeline();

  for (let i = 0; i < SEED_ACTIONS.length; i++) {
    const seed = SEED_ACTIONS[i];
    const action: SuggestedAction = {
      ...seed,
      userId,
      createdAt: daysAgo(SEED_ACTIONS.length - i),
      updatedAt: daysAgo(SEED_ACTIONS.length - i),
    };
    p.set(actionKey(userId, action.id), JSON.stringify(action));
    p.sadd(actionIndexKey(userId), action.id);
  }

  await p.exec();
  return SEED_ACTIONS.length;
}
