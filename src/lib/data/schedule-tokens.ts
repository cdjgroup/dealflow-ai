import { getRedis } from "@/lib/redis";
import { encrypt, decrypt } from "@/lib/crypto";

const TOKEN_TTL = 90 * 24 * 60 * 60; // 90 days

function key(userId: string): string {
  return `${userId}:schedule:refresh-token`;
}

export async function storeScheduleRefreshToken(
  userId: string,
  refreshToken: string
): Promise<void> {
  const redis = getRedis();
  const encrypted = encrypt(refreshToken);
  await redis.set(key(userId), encrypted, { ex: TOKEN_TTL });
}

export async function getScheduleRefreshToken(
  userId: string
): Promise<string | null> {
  const redis = getRedis();
  const raw = await redis.get<string>(key(userId));
  if (!raw) return null;
  return decrypt(raw);
}

export async function deleteScheduleRefreshToken(
  userId: string
): Promise<void> {
  const redis = getRedis();
  await redis.del(key(userId));
}
