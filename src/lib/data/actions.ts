import { getRedis } from "@/lib/redis";
import type {
  SuggestedAction,
  ActionStatus,
  ActionDraft,
} from "@/lib/types/actions";

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

function actionKey(userId: string, actionId: string): string {
  return `${userId}:action:${actionId}`;
}

function actionIndexKey(userId: string): string {
  return `${userId}:_idx:actions`;
}

const ACTION_TTL = 30 * 24 * 60 * 60; // 30 days

export async function getActions(
  userId: string,
  filter?: { status?: ActionStatus }
): Promise<SuggestedAction[]> {
  const redis = getRedis();
  const ids = await redis.smembers(actionIndexKey(userId));
  if (ids.length === 0) return [];

  const keys = ids.map((id) => actionKey(userId, id));
  const raws = await redis.mget<string[]>(...keys);

  const actions: SuggestedAction[] = [];
  for (const raw of raws) {
    const action = parse<SuggestedAction>(raw);
    if (!action) continue;
    if (filter?.status && action.status !== filter.status) continue;
    actions.push(action);
  }

  // Sort by priority (high > medium > low), then by createdAt desc
  const priorityOrder = { high: 0, medium: 1, low: 2 };
  actions.sort((a, b) => {
    const pDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
    if (pDiff !== 0) return pDiff;
    return b.createdAt.localeCompare(a.createdAt);
  });

  return actions;
}

export async function getAction(
  userId: string,
  actionId: string
): Promise<SuggestedAction | null> {
  const redis = getRedis();
  const raw = await redis.get<string>(actionKey(userId, actionId));
  return parse<SuggestedAction>(raw);
}

export async function createAction(
  userId: string,
  data: Omit<SuggestedAction, "id" | "userId" | "createdAt" | "updatedAt">
): Promise<SuggestedAction> {
  const redis = getRedis();
  const action: SuggestedAction = {
    ...data,
    id: genId(),
    userId,
    createdAt: now(),
    updatedAt: now(),
  };

  const p = redis.pipeline();
  p.set(actionKey(userId, action.id), JSON.stringify(action));
  p.sadd(actionIndexKey(userId), action.id);
  await p.exec();

  return action;
}

export async function updateAction(
  userId: string,
  actionId: string,
  data: Partial<Pick<SuggestedAction, "status" | "draft" | "errorMessage">>
): Promise<SuggestedAction | null> {
  const redis = getRedis();
  const existing = await getAction(userId, actionId);
  if (!existing) return null;

  const updated: SuggestedAction = {
    ...existing,
    ...data,
    updatedAt: now(),
  };

  await redis.set(actionKey(userId, actionId), JSON.stringify(updated));
  return updated;
}

export async function batchUpdateStatus(
  userId: string,
  actionIds: string[],
  status: ActionStatus
): Promise<SuggestedAction[]> {
  const results: SuggestedAction[] = [];
  for (const id of actionIds) {
    const existing = await getAction(userId, id);
    if (!existing) continue;
    if (existing.status === status) {
      results.push(existing);
      continue;
    }
    const updated = await updateAction(userId, id, { status });
    if (updated) results.push(updated);
  }
  return results;
}

export async function getActiveActionCount(
  userId: string
): Promise<number> {
  const actions = await getActions(userId);
  return actions.filter(
    (a) => a.status !== "sent" && a.status !== "dismissed"
  ).length;
}

// Alias for backward compatibility
export const getPendingActionCount = getActiveActionCount;

export async function clearAllActions(userId: string): Promise<number> {
  const redis = getRedis();
  const indexKey = actionIndexKey(userId);
  const ids = await redis.smembers(indexKey);
  if (ids.length === 0) return 0;

  const p = redis.pipeline();
  for (const id of ids) {
    p.del(actionKey(userId, id));
  }
  p.del(indexKey);
  await p.exec();

  return ids.length;
}
