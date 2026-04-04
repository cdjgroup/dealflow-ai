import { getRedis } from "@/lib/redis";
import type { ScheduledCibaSession } from "@/lib/types/scheduled-ciba";

const SESSION_TTL = 600; // 10 minutes
const ACTIVE_INDEX_KEY = "schedule:ciba:active";

function sessionKey(userId: string, batchId: string): string {
  return `ciba:scheduled:${userId}:${batchId}`;
}

export async function storeScheduledCibaSession(
  session: ScheduledCibaSession
): Promise<void> {
  const redis = getRedis();
  const key = sessionKey(session.userId, session.batchId);
  const p = redis.pipeline();
  p.set(key, JSON.stringify(session), { ex: SESSION_TTL });
  p.sadd(ACTIVE_INDEX_KEY, key);
  await p.exec();
}

export async function getScheduledCibaSession(
  userId: string,
  batchId: string
): Promise<ScheduledCibaSession | null> {
  const redis = getRedis();
  const raw = await redis.get<string>(sessionKey(userId, batchId));
  if (!raw) return null;
  return typeof raw === "string" ? JSON.parse(raw) : (raw as unknown as ScheduledCibaSession);
}

export async function getAllActiveScheduledSessions(): Promise<ScheduledCibaSession[]> {
  const redis = getRedis();
  const keys = (await redis.smembers(ACTIVE_INDEX_KEY)) as string[];
  if (keys.length === 0) return [];

  const raws = await redis.mget<string[]>(...keys);
  const sessions: ScheduledCibaSession[] = [];
  const staleKeys: string[] = [];

  for (let i = 0; i < raws.length; i++) {
    if (!raws[i]) {
      staleKeys.push(keys[i]);
      continue;
    }
    const s = typeof raws[i] === "string" ? JSON.parse(raws[i]!) : raws[i];
    sessions.push(s as ScheduledCibaSession);
  }

  if (staleKeys.length > 0) {
    const p = redis.pipeline();
    for (const k of staleKeys) p.srem(ACTIVE_INDEX_KEY, k);
    await p.exec();
  }

  return sessions;
}

export async function removeScheduledCibaSession(
  userId: string,
  batchId: string
): Promise<void> {
  const redis = getRedis();
  const key = sessionKey(userId, batchId);
  const p = redis.pipeline();
  p.del(key);
  p.srem(ACTIVE_INDEX_KEY, key);
  await p.exec();
}
