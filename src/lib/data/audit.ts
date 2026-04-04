import { getRedis } from "@/lib/redis";
import type { AuditEntry, AuditFilters } from "@/lib/types/audit";

// PII retention: audit entries contain masked email addresses and truncated
// tool inputs. Auto-deleted after 7 days via Redis TTL. User data deletion
// cascades through clearAllActions + Redis key expiry.
const AUDIT_TTL_SECONDS = 7 * 24 * 60 * 60;

function auditKey(userId: string): string {
  return `${userId}:audit`;
}

function genId(): string {
  return crypto.randomUUID().replace(/-/g, "").substring(0, 12);
}

function sanitizeInput(
  input: Record<string, unknown>
): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (typeof value === "string") {
      let masked = value.replace(/([\w.+%-])([\w.+%-]*)@/g, "$1***@");
      if (masked.length > 200) masked = masked.slice(0, 200) + "…";
      sanitized[key] = masked;
    } else if (
      typeof value === "object" &&
      value !== null &&
      !Array.isArray(value)
    ) {
      sanitized[key] = sanitizeInput(value as Record<string, unknown>);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

export async function writeAuditEntry(
  userId: string,
  data: Omit<AuditEntry, "id" | "userId" | "timestamp">
): Promise<AuditEntry> {
  const entry: AuditEntry = {
    ...data,
    id: genId(),
    userId,
    input: sanitizeInput(data.input),
    timestamp: new Date().toISOString(),
  };

  try {
    const redis = getRedis();
    await redis.lpush(auditKey(userId), JSON.stringify(entry));
    await redis.expire(auditKey(userId), AUDIT_TTL_SECONDS);
  } catch (err) {
    console.error("Audit write failed (non-blocking):", err);
  }

  return entry;
}

export async function getAuditLog(
  userId: string,
  options?: { limit?: number } & AuditFilters
): Promise<AuditEntry[]> {
  const limit = options?.limit ?? 50;
  const hasFilters = !!(options?.toolName || options?.result || options?.startDate || options?.endDate);
  // When filters are active, fetch more entries so in-memory filtering has enough candidates
  const fetchLimit = hasFilters ? Math.max(limit * 4, 500) : limit;
  const redis = getRedis();
  const raw = await redis.lrange<string>(auditKey(userId), 0, fetchLimit - 1);

  const entries = raw
    .map((item) => {
      if (typeof item === "object") return item as unknown as AuditEntry;
      try {
        return JSON.parse(item) as AuditEntry;
      } catch {
        return null;
      }
    })
    .filter((e): e is AuditEntry => e !== null);

  if (!hasFilters) {
    return entries;
  }

  return entries
    .filter((entry) => {
      if (options!.toolName && entry.toolName !== options!.toolName) return false;
      if (options!.result && entry.result !== options!.result) return false;
      if (options!.startDate && entry.timestamp < options!.startDate) return false;
      if (options!.endDate && entry.timestamp > options!.endDate + "T23:59:59.999Z") return false;
      return true;
    })
    .slice(0, limit);
}
