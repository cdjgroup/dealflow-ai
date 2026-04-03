import { getRedis } from "@/lib/redis";

function key(userId: string): string {
  return `${userId}:disabled-connections`;
}

/**
 * Check if a connection has been disabled (disconnected) by the user.
 */
export async function isConnectionDisabled(
  userId: string,
  connection: string
): Promise<boolean> {
  const redis = getRedis();
  return (await redis.sismember(key(userId), connection)) === 1;
}

/**
 * Mark a connection as disabled. Tools and token-status will refuse
 * to exchange tokens for this connection until re-enabled.
 */
export async function disableConnection(
  userId: string,
  connection: string
): Promise<void> {
  const redis = getRedis();
  await redis.sadd(key(userId), connection);
}

/**
 * Re-enable a connection (e.g., after user clicks "Connect").
 */
export async function enableConnection(
  userId: string,
  connection: string
): Promise<void> {
  const redis = getRedis();
  await redis.srem(key(userId), connection);
}

/**
 * Get all disabled connections for a user.
 */
export async function getDisabledConnections(
  userId: string
): Promise<string[]> {
  const redis = getRedis();
  return (await redis.smembers(key(userId))) as string[];
}
