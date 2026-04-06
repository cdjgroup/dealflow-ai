import { getRedis } from "@/lib/redis";
import type { CibaSession, CibaStatus } from "./types";

const CIBA_TTL = 600; // 10 minutes — covers max CIBA expiry + buffer

function sessionKey(userId: string, toolName: string): string {
  return `ciba:${userId}:${toolName}`;
}

function authReqLookupKey(authReqId: string): string {
  return `ciba:req:${authReqId}`;
}

export async function storeCibaSession(
  session: CibaSession
): Promise<void> {
  const redis = getRedis();
  const p = redis.pipeline();
  p.set(
    sessionKey(session.userId, session.toolName),
    JSON.stringify(session),
    { ex: CIBA_TTL }
  );
  // H3: O(1) lookup index — avoids KEYS scan in status endpoint
  // Store userId:toolName so status endpoint can update sessions by authReqId
  p.set(authReqLookupKey(session.authReqId), `${session.userId}:${session.toolName}`, { ex: CIBA_TTL });
  await p.exec();
}

/**
 * Parse the reverse lookup value: "userId:toolName" or legacy "userId".
 */
function parseLookupValue(value: string): { userId: string; toolName: string | null } {
  const colonIdx = value.indexOf(":");
  if (colonIdx === -1) return { userId: value, toolName: null };
  return { userId: value.slice(0, colonIdx), toolName: value.slice(colonIdx + 1) };
}

export async function getSessionOwner(
  authReqId: string
): Promise<string | null> {
  const redis = getRedis();
  const raw = await redis.get<string>(authReqLookupKey(authReqId));
  if (!raw) return null;
  return parseLookupValue(raw).userId;
}

/**
 * Look up the full session by authReqId using the reverse index.
 */
export async function getSessionByAuthReqId(
  authReqId: string
): Promise<CibaSession | null> {
  const redis = getRedis();
  const raw = await redis.get<string>(authReqLookupKey(authReqId));
  if (!raw) return null;
  const { userId, toolName } = parseLookupValue(raw);
  if (!toolName) return null;
  return getCibaSession(userId, toolName);
}

export async function getCibaSession(
  userId: string,
  toolName: string
): Promise<CibaSession | null> {
  const redis = getRedis();
  const raw = await redis.get<string>(sessionKey(userId, toolName));
  if (!raw) return null;
  try {
    return typeof raw === "string" ? JSON.parse(raw) : raw as unknown as CibaSession;
  } catch (err) {
    console.error("Failed to parse CIBA session from Redis:", err);
    return null;
  }
}

export async function updateCibaSessionStatus(
  userId: string,
  toolName: string,
  status: CibaStatus
): Promise<void> {
  const session = await getCibaSession(userId, toolName);
  if (!session) return;
  session.status = status;
  await storeCibaSession(session);
}

export async function deleteCibaSession(
  userId: string,
  toolName: string
): Promise<void> {
  const redis = getRedis();
  // Clean up both the session and the authReqId lookup index
  const session = await getCibaSession(userId, toolName);
  const p = redis.pipeline();
  p.del(sessionKey(userId, toolName));
  if (session?.authReqId) {
    p.del(authReqLookupKey(session.authReqId));
  }
  await p.exec();
}
