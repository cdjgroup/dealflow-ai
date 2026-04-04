import { getRedis } from "@/lib/redis";
import type { CibaSession, CibaStatus } from "./types";

const CIBA_TTL = 600; // 10 minutes — covers max CIBA expiry + buffer

function sessionKey(userId: string, toolName: string): string {
  return `ciba:${userId}:${toolName}`;
}

/**
 * Store a CIBA session in Redis, keyed by userId + toolName.
 * Only one active CIBA session per user per tool at a time.
 */
export async function storeCibaSession(
  session: CibaSession
): Promise<void> {
  const redis = getRedis();
  await redis.set(
    sessionKey(session.userId, session.toolName),
    JSON.stringify(session),
    { ex: CIBA_TTL }
  );
}

/**
 * Retrieve the active CIBA session for a user + tool, if one exists.
 */
export async function getCibaSession(
  userId: string,
  toolName: string
): Promise<CibaSession | null> {
  const redis = getRedis();
  const raw = await redis.get<string>(sessionKey(userId, toolName));
  if (!raw) return null;
  try {
    return typeof raw === "string" ? JSON.parse(raw) : raw as unknown as CibaSession;
  } catch {
    return null;
  }
}

/**
 * Update the status of a CIBA session.
 */
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

/**
 * Delete the CIBA session (cleanup after completion).
 */
export async function deleteCibaSession(
  userId: string,
  toolName: string
): Promise<void> {
  const redis = getRedis();
  await redis.del(sessionKey(userId, toolName));
}
