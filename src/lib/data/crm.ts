import { getRedis } from "@/lib/redis";
import { DEFAULT_TOOL_TRUST } from "@/lib/types/settings";

export interface Deal {
  id: string;
  name: string;
  company: string;
  value: number;
  stage:
    | "lead"
    | "qualified"
    | "proposal"
    | "negotiation"
    | "closed-won"
    | "closed-lost";
  contactId: string;
  createdAt: string;
  updatedAt: string;
}

export interface Contact {
  id: string;
  name: string;
  email: string;
  company: string;
  role: string;
  phone?: string;
  createdAt: string;
}

export interface Activity {
  id: string;
  dealId: string;
  contactId: string;
  type: "email" | "call" | "meeting" | "note";
  summary: string;
  createdAt: string;
}

function genId(): string {
  return crypto.randomUUID().replace(/-/g, "").substring(0, 12);
}

function now(): string {
  return new Date().toISOString();
}

// Upstash Redis auto-deserializes JSON, so raw may arrive as an object
function parse<T>(raw: string | null): T | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "object") return raw as T;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

// --- Index helpers (Redis Sets replace dangerous KEYS scans) ---

function dealIndexKey(userId: string): string {
  return `${userId}:_idx:deals`;
}

function contactIndexKey(userId: string): string {
  return `${userId}:_idx:contacts`;
}

function activityIndexKey(userId: string, dealId: string): string {
  return `${userId}:_idx:activities:${dealId}`;
}

// --- Deals ---

export async function getDeals(userId: string): Promise<Deal[]> {
  const redis = getRedis();
  const ids = await redis.smembers(dealIndexKey(userId));
  if (ids.length === 0) return [];
  const keys = ids.map((id) => `${userId}:deal:${id}`);
  const values = await redis.mget<string[]>(...keys);
  return values
    .filter(Boolean)
    .map((v) => parse<Deal>(v))
    .filter((d): d is Deal => d !== null);
}

export async function getDeal(
  userId: string,
  dealId: string
): Promise<Deal | null> {
  const redis = getRedis();
  const raw = await redis.get<string>(`${userId}:deal:${dealId}`);
  return parse<Deal>(raw);
}

export async function createDealRecord(
  userId: string,
  data: Omit<Deal, "id" | "createdAt" | "updatedAt">
): Promise<Deal> {
  const redis = getRedis();
  const deal: Deal = {
    ...data,
    id: genId(),
    createdAt: now(),
    updatedAt: now(),
  };
  const p = redis.pipeline();
  p.set(`${userId}:deal:${deal.id}`, JSON.stringify(deal));
  p.sadd(dealIndexKey(userId), deal.id);
  await p.exec();
  return deal;
}

export async function updateDealRecord(
  userId: string,
  dealId: string,
  data: Partial<Omit<Deal, "id" | "createdAt">>
): Promise<Deal | null> {
  const redis = getRedis();
  const key = `${userId}:deal:${dealId}`;
  const lockKey = `${key}:lock`;

  // Advisory lock to prevent concurrent read-modify-write races
  // (e.g., CIBA retry + simultaneous Action Center update)
  const acquired = await redis.set(lockKey, "1", { nx: true, ex: 5 });
  if (!acquired) {
    // Another update in progress — retry once after brief delay
    await new Promise((r) => setTimeout(r, 100));
    const retry = await redis.set(lockKey, "1", { nx: true, ex: 5 });
    if (!retry) return null;
  }

  try {
    const existing = await getDeal(userId, dealId);
    if (!existing) return null;
    const updated: Deal = {
      ...existing,
      ...data,
      id: existing.id,
      createdAt: existing.createdAt,
      updatedAt: now(),
    };
    await redis.set(key, JSON.stringify(updated));
    return updated;
  } finally {
    await redis.del(lockKey);
  }
}

// --- Contacts ---

export async function getContacts(userId: string): Promise<Contact[]> {
  const redis = getRedis();
  const ids = await redis.smembers(contactIndexKey(userId));
  if (ids.length === 0) return [];
  const keys = ids.map((id) => `${userId}:contact:${id}`);
  const values = await redis.mget<string[]>(...keys);
  return values
    .filter(Boolean)
    .map((v) => parse<Contact>(v))
    .filter((c): c is Contact => c !== null);
}

export async function getContact(
  userId: string,
  contactId: string
): Promise<Contact | null> {
  const redis = getRedis();
  const raw = await redis.get<string>(`${userId}:contact:${contactId}`);
  return parse<Contact>(raw);
}

export async function createContactRecord(
  userId: string,
  data: Omit<Contact, "id" | "createdAt">
): Promise<Contact> {
  const redis = getRedis();
  const contact: Contact = {
    ...data,
    id: genId(),
    createdAt: now(),
  };
  const p = redis.pipeline();
  p.set(`${userId}:contact:${contact.id}`, JSON.stringify(contact));
  p.sadd(contactIndexKey(userId), contact.id);
  await p.exec();
  return contact;
}

// --- Activities ---

export async function getActivities(
  userId: string,
  dealId: string
): Promise<Activity[]> {
  const redis = getRedis();
  const ids = await redis.smembers(activityIndexKey(userId, dealId));
  if (ids.length === 0) return [];
  const keys = ids.map((id) => `${userId}:activity:${dealId}:${id}`);
  const values = await redis.mget<string[]>(...keys);
  return values
    .filter(Boolean)
    .map((v) => parse<Activity>(v))
    .filter((a): a is Activity => a !== null);
}

export async function createActivityRecord(
  userId: string,
  data: Omit<Activity, "id" | "createdAt">
): Promise<Activity> {
  const redis = getRedis();
  const activity: Activity = {
    ...data,
    id: genId(),
    createdAt: now(),
  };
  const p = redis.pipeline();
  p.set(
    `${userId}:activity:${activity.dealId}:${activity.id}`,
    JSON.stringify(activity)
  );
  p.sadd(activityIndexKey(userId, activity.dealId), activity.id);
  await p.exec();
  return activity;
}

// --- Seed data ---

const SEED_CONTACTS: Contact[] = [
  {
    id: "c1",
    name: "Sarah Chen",
    email: "sarah.chen@meridian.io",
    company: "Meridian Technologies",
    role: "VP Engineering",
    phone: "+1-555-0101",
    createdAt: "2026-03-15T10:00:00Z",
  },
  {
    id: "c2",
    name: "Marcus Johnson",
    email: "m.johnson@vantage.co",
    company: "Vantage Partners",
    role: "CTO",
    phone: "+1-555-0202",
    createdAt: "2026-03-10T14:00:00Z",
  },
  {
    id: "c3",
    name: "Elena Rodriguez",
    email: "elena@brightpath.com",
    company: "BrightPath Solutions",
    role: "Director of Operations",
    createdAt: "2026-03-20T09:00:00Z",
  },
  {
    id: "c4",
    name: "James Wilson",
    email: "jwilson@pinnacle.dev",
    company: "Pinnacle Dev",
    role: "Head of Product",
    createdAt: "2026-03-22T11:00:00Z",
  },
  {
    id: "c5",
    name: "Priya Patel",
    email: "priya@stratoscloud.io",
    company: "Stratos Cloud",
    role: "CEO",
    phone: "+1-555-0303",
    createdAt: "2026-02-28T08:00:00Z",
  },
  {
    id: "c6",
    name: "David Kim",
    email: "dkim@novafinance.com",
    company: "Nova Finance",
    role: "VP of Engineering",
    phone: "+1-555-0404",
    createdAt: "2026-03-05T13:00:00Z",
  },
  {
    id: "c7",
    name: "Rachel Torres",
    email: "rachel.t@axonhealth.co",
    company: "Axon Health",
    role: "CIO",
    createdAt: "2026-03-01T10:00:00Z",
  },
];

const SEED_DEALS: Deal[] = [
  {
    id: "d1",
    name: "Meridian Platform Migration",
    company: "Meridian Technologies",
    value: 85000,
    stage: "proposal",
    contactId: "c1",
    createdAt: "2026-03-15T10:30:00Z",
    updatedAt: "2026-04-04T16:00:00Z",
  },
  {
    id: "d2",
    name: "Vantage API Integration",
    company: "Vantage Partners",
    value: 42000,
    stage: "negotiation",
    contactId: "c2",
    createdAt: "2026-03-10T14:30:00Z",
    updatedAt: "2026-03-30T09:00:00Z",
  },
  {
    id: "d3",
    name: "BrightPath Onboarding System",
    company: "BrightPath Solutions",
    value: 28000,
    stage: "qualified",
    contactId: "c3",
    createdAt: "2026-03-20T09:30:00Z",
    updatedAt: "2026-03-25T14:00:00Z",
  },
  {
    id: "d4",
    name: "Pinnacle Dev Tools License",
    company: "Pinnacle Dev",
    value: 15000,
    stage: "qualified",
    contactId: "c4",
    createdAt: "2026-03-22T11:30:00Z",
    updatedAt: "2026-03-22T11:30:00Z",
  },
  {
    id: "d5",
    name: "Stratos Cloud Migration",
    company: "Stratos Cloud",
    value: 120000,
    stage: "closed-won",
    contactId: "c5",
    createdAt: "2026-02-28T08:30:00Z",
    updatedAt: "2026-03-20T17:00:00Z",
  },
  {
    id: "d6",
    name: "Nova Finance Data Pipeline",
    company: "Nova Finance",
    value: 65000,
    stage: "proposal",
    contactId: "c6",
    createdAt: "2026-03-05T13:30:00Z",
    updatedAt: "2026-04-03T10:00:00Z",
  },
  {
    id: "d7",
    name: "Axon Health Portal Redesign",
    company: "Axon Health",
    value: 95000,
    stage: "negotiation",
    contactId: "c7",
    createdAt: "2026-03-01T10:30:00Z",
    updatedAt: "2026-03-31T15:00:00Z",
  },
  {
    id: "d8",
    name: "Stratos Analytics Add-on",
    company: "Stratos Cloud",
    value: 35000,
    stage: "closed-lost",
    contactId: "c5",
    createdAt: "2026-03-08T09:00:00Z",
    updatedAt: "2026-03-25T12:00:00Z",
  },
];

const SEED_ACTIVITIES: Activity[] = [
  {
    id: "a1",
    dealId: "d1",
    contactId: "c1",
    type: "meeting",
    summary:
      "Initial discovery call with Sarah. Discussed migration timeline and budget.",
    createdAt: "2026-03-15T11:00:00Z",
  },
  {
    id: "a2",
    dealId: "d1",
    contactId: "c1",
    type: "email",
    summary: "Sent proposal document with 3 pricing tiers.",
    createdAt: "2026-03-22T15:00:00Z",
  },
  {
    id: "a3",
    dealId: "d2",
    contactId: "c2",
    type: "call",
    summary:
      "Technical deep-dive on API requirements. Marcus wants SSO integration.",
    createdAt: "2026-03-18T10:00:00Z",
  },
  {
    id: "a4",
    dealId: "d2",
    contactId: "c2",
    type: "meeting",
    summary: "Contract review meeting. Legal on both sides reviewing terms.",
    createdAt: "2026-03-28T14:00:00Z",
  },
  {
    id: "a5",
    dealId: "d3",
    contactId: "c3",
    type: "email",
    summary: "Elena requested a product demo for her team next week.",
    createdAt: "2026-03-24T09:00:00Z",
  },
  {
    id: "a6",
    dealId: "d5",
    contactId: "c5",
    type: "meeting",
    summary: "Final contract signing with Priya. 12-month engagement confirmed.",
    createdAt: "2026-03-20T16:00:00Z",
  },
  {
    id: "a7",
    dealId: "d5",
    contactId: "c5",
    type: "email",
    summary: "Sent onboarding package and kickoff meeting invite.",
    createdAt: "2026-03-21T09:00:00Z",
  },
  {
    id: "a8",
    dealId: "d6",
    contactId: "c6",
    type: "call",
    summary: "David walked through their current data stack. Needs real-time sync.",
    createdAt: "2026-03-12T11:00:00Z",
  },
  {
    id: "a9",
    dealId: "d6",
    contactId: "c6",
    type: "email",
    summary: "Sent technical architecture proposal for data pipeline integration.",
    createdAt: "2026-03-29T10:00:00Z",
  },
  {
    id: "a10",
    dealId: "d7",
    contactId: "c7",
    type: "meeting",
    summary: "Demo of portal prototype. Rachel wants HIPAA compliance details.",
    createdAt: "2026-03-15T14:00:00Z",
  },
  {
    id: "a11",
    dealId: "d7",
    contactId: "c7",
    type: "note",
    summary: "Legal review in progress. Expect final terms by end of week.",
    createdAt: "2026-03-31T15:00:00Z",
  },
  {
    id: "a12",
    dealId: "d4",
    contactId: "c4",
    type: "email",
    summary: "James interested in enterprise tier. Requested pricing comparison.",
    createdAt: "2026-03-25T10:00:00Z",
  },
];

export interface SeedResult {
  deals: number;
  contacts: number;
  activities: number;
}

export async function seedDemoData(userId: string): Promise<SeedResult> {
  const redis = getRedis();
  const p = redis.pipeline();

  for (const contact of SEED_CONTACTS) {
    p.set(`${userId}:contact:${contact.id}`, JSON.stringify(contact));
    p.sadd(contactIndexKey(userId), contact.id);
  }
  for (const deal of SEED_DEALS) {
    p.set(`${userId}:deal:${deal.id}`, JSON.stringify(deal));
    p.sadd(dealIndexKey(userId), deal.id);
  }
  for (const activity of SEED_ACTIVITIES) {
    p.set(
      `${userId}:activity:${activity.dealId}:${activity.id}`,
      JSON.stringify(activity)
    );
    p.sadd(activityIndexKey(userId, activity.dealId), activity.id);
  }

  // Clear old actions on reseed (start fresh — AI generates actions via analyzePipeline)
  const actionIdxKey = `${userId}:_idx:actions`;
  const oldActionIds = await redis.smembers(actionIdxKey);
  if (oldActionIds.length > 0) {
    for (const id of oldActionIds) {
      p.del(`${userId}:action:${id}`);
    }
    p.del(actionIdxKey);
  }

  // Seed trust stats: 4 email approvals, 0 dismissals — one more approval
  // triggers the Trust Calibration Nudge banner (threshold: 5 decisions, >80%)
  p.set(`${userId}:trustStats`, JSON.stringify({
    email: { approved: 4, dismissed: 0 },
    calendar: { approved: 0, dismissed: 0 },
    slack: { approved: 0, dismissed: 0 },
  }));

  // Reset settings that affect demo behavior:
  // - toolTrust: DEFAULT_TOOL_TRUST — restore sensible defaults (read=always, write=ask)
  // - autonomyLevel: 1 — "Suggest Only" so actions start as pending, not auto-approved
  const settingsKey = `${userId}:settings`;
  const currentSettings = await redis.get<Record<string, unknown>>(settingsKey);
  if (currentSettings) {
    p.set(settingsKey, JSON.stringify({ ...currentSettings, toolTrust: { ...DEFAULT_TOOL_TRUST }, autonomyLevel: 1 }));
  }

  await p.exec();

  return {
    deals: SEED_DEALS.length,
    contacts: SEED_CONTACTS.length,
    activities: SEED_ACTIVITIES.length,
  };
}
