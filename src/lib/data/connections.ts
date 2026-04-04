import { getRedis } from "@/lib/redis";

function key(userId: string): string {
  return `${userId}:disabled-connections`;
}

export async function isConnectionDisabled(
  userId: string,
  connection: string
): Promise<boolean> {
  const redis = getRedis();
  return (await redis.sismember(key(userId), connection)) === 1;
}

export async function disableConnection(
  userId: string,
  connection: string
): Promise<void> {
  const redis = getRedis();
  await redis.sadd(key(userId), connection);
}

export async function enableConnection(
  userId: string,
  connection: string
): Promise<void> {
  const redis = getRedis();
  await redis.srem(key(userId), connection);
}

export async function getDisabledConnections(
  userId: string
): Promise<string[]> {
  const redis = getRedis();
  return (await redis.smembers(key(userId))) as string[];
}
