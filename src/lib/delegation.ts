import { getRedis } from "@/lib/redis";

export interface DelegationToken {
  id: string;
  userId: string;
  allowedTools: string[];
  ttlSeconds: number;
  createdAt: string;
  expiresAt: string;
}

function delegationKey(id: string): string {
  return `delegation:${id}`;
}

function genId(): string {
  return `del-${crypto.randomUUID().replace(/-/g, "").substring(0, 12)}`;
}

/**
 * Create a time-limited delegation token that authorizes a subset of tools.
 * Stored in Redis with automatic TTL expiry.
 */
export async function createDelegation(
  userId: string,
  allowedTools: string[],
  ttlSeconds: number
): Promise<DelegationToken> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);

  const token: DelegationToken = {
    id: genId(),
    userId,
    allowedTools,
    ttlSeconds,
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
  };

  const redis = getRedis();
  await redis.set(delegationKey(token.id), token, { ex: ttlSeconds });

  return token;
}

/**
 * Retrieve a delegation token. Returns null if expired or not found.
 */
export async function getDelegation(
  delegationId: string
): Promise<DelegationToken | null> {
  const redis = getRedis();
  const raw = await redis.get<DelegationToken>(delegationKey(delegationId));
  return raw ?? null;
}

/**
 * Revoke a delegation token immediately (before TTL expiry).
 */
export async function revokeDelegation(delegationId: string): Promise<void> {
  const redis = getRedis();
  await redis.del(delegationKey(delegationId));
}
