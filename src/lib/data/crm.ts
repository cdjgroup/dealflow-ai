import { getRedis } from "@/lib/redis";

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

function parse<T>(raw: string | null): T | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "object") return raw as T;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function getDeals(userId: string): Promise<Deal[]> {
  const redis = getRedis();
  const keys = await redis.keys(`${userId}:deal:*`);
  if (keys.length === 0) return [];
  const values = await redis.mget<string[]>(...keys);
  return values.filter(Boolean).map((v) => parse<Deal>(v)!).filter(Boolean);
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
  await redis.set(`${userId}:deal:${deal.id}`, JSON.stringify(deal));
  return deal;
}

export async function getContacts(userId: string): Promise<Contact[]> {
  const redis = getRedis();
  const keys = await redis.keys(`${userId}:contact:*`);
  if (keys.length === 0) return [];
  const values = await redis.mget<string[]>(...keys);
  return values
    .filter(Boolean)
    .map((v) => parse<Contact>(v)!)
    .filter(Boolean);
}

export async function getContact(
  userId: string,
  contactId: string
): Promise<Contact | null> {
  const redis = getRedis();
  const raw = await redis.get<string>(`${userId}:contact:${contactId}`);
  return parse<Contact>(raw);
}

export async function getActivities(
  userId: string,
  dealId: string
): Promise<Activity[]> {
  const redis = getRedis();
  const keys = await redis.keys(`${userId}:activity:${dealId}:*`);
  if (keys.length === 0) return [];
  const values = await redis.mget<string[]>(...keys);
  return values
    .filter(Boolean)
    .map((v) => parse<Activity>(v)!)
    .filter(Boolean);
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
  await redis.set(
    `${userId}:activity:${activity.dealId}:${activity.id}`,
    JSON.stringify(activity)
  );
  return activity;
}

export async function seedDemoData(userId: string): Promise<void> {
  const redis = getRedis();

  const contacts: Contact[] = [
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
  ];

  const deals: Deal[] = [
    {
      id: "d1",
      name: "Meridian Platform Migration",
      company: "Meridian Technologies",
      value: 85000,
      stage: "proposal",
      contactId: "c1",
      createdAt: "2026-03-15T10:30:00Z",
      updatedAt: "2026-03-28T16:00:00Z",
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
      stage: "lead",
      contactId: "c4",
      createdAt: "2026-03-22T11:30:00Z",
      updatedAt: "2026-03-22T11:30:00Z",
    },
  ];

  const activities: Activity[] = [
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
  ];

  for (const contact of contacts) {
    await redis.set(
      `${userId}:contact:${contact.id}`,
      JSON.stringify(contact)
    );
  }
  for (const deal of deals) {
    await redis.set(`${userId}:deal:${deal.id}`, JSON.stringify(deal));
  }
  for (const activity of activities) {
    await redis.set(
      `${userId}:activity:${activity.dealId}:${activity.id}`,
      JSON.stringify(activity)
    );
  }
}
