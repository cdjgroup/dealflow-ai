import { getRedis } from "@/lib/redis";
import { type UserSettings, DEFAULT_SETTINGS } from "@/lib/types/settings";

function settingsKey(userId: string): string {
  return `${userId}:settings`;
}

export async function getUserSettings(userId: string): Promise<UserSettings> {
  const redis = getRedis();
  const raw = await redis.get<UserSettings>(settingsKey(userId));
  if (!raw) return { ...DEFAULT_SETTINGS };
  return raw;
}

export async function updateUserSettings(
  userId: string,
  patch: Partial<UserSettings>
): Promise<UserSettings> {
  const current = await getUserSettings(userId);
  const merged: UserSettings = {
    capabilities: patch.capabilities ?? current.capabilities,
    approvalRequired: patch.approvalRequired ?? current.approvalRequired,
  };
  const redis = getRedis();
  await redis.set(settingsKey(userId), merged);
  return merged;
}
