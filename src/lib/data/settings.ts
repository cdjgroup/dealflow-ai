import { getRedis } from "@/lib/redis";
import { type UserSettings, DEFAULT_SETTINGS } from "@/lib/types/settings";

function settingsKey(userId: string): string {
  return `${userId}:settings`;
}

export async function getUserSettings(userId: string): Promise<UserSettings> {
  const redis = getRedis();
  const raw = await redis.get<UserSettings>(settingsKey(userId));
  if (!raw) return { ...DEFAULT_SETTINGS };
  return { ...DEFAULT_SETTINGS, ...raw, toolTrust: { ...raw.toolTrust } };
}

export async function updateUserSettings(
  userId: string,
  patch: Partial<UserSettings>
): Promise<UserSettings> {
  const current = await getUserSettings(userId);
  const merged: UserSettings = {
    capabilities: patch.capabilities ?? current.capabilities,
    approvalRequired: patch.approvalRequired ?? current.approvalRequired,
    toolTrust: { ...current.toolTrust, ...(patch.toolTrust ?? {}) },
    schedule: patch.schedule ?? current.schedule,
  };
  const redis = getRedis();
  await redis.set(settingsKey(userId), merged);
  return merged;
}

const VALID_HOURS = [8, 12, 17];

function scheduleIndexKey(hour: number): string {
  return `schedule:idx:${hour}`;
}

export async function updateScheduleIndex(
  userId: string,
  oldHours: number[],
  newHours: number[]
): Promise<void> {
  const redis = getRedis();
  const p = redis.pipeline();
  for (const h of oldHours) {
    if (!newHours.includes(h)) {
      p.srem(scheduleIndexKey(h), userId);
    }
  }
  for (const h of newHours) {
    if (!oldHours.includes(h) && VALID_HOURS.includes(h)) {
      p.sadd(scheduleIndexKey(h), userId);
    }
  }
  await p.exec();
}

export async function getUsersForScheduleHour(
  hour: number
): Promise<string[]> {
  const redis = getRedis();
  return (await redis.smembers(scheduleIndexKey(hour))) as string[];
}
