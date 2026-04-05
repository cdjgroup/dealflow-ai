import { getRedis } from "@/lib/redis";

export interface McpAnalyticsSummary {
  totalCalls: number;
  successCount: number;
  errorCount: number;
  successRate: number;
  topTools: { name: string; count: number }[];
  dailyBreakdown: { date: string; calls: number }[];
}

function analyticsKey(userId: string, clientId: string, dateStr?: string): string {
  const date = dateStr ?? new Date().toISOString().substring(0, 10);
  return `${userId}:mcp-analytics:${clientId}:${date}`;
}

export async function recordMcpCall(
  userId: string,
  clientId: string,
  toolName: string,
  success: boolean
): Promise<void> {
  try {
    const redis = getRedis();
    const key = analyticsKey(userId, clientId);
    await redis.hincrby(key, "totalCalls", 1);
    if (success) {
      await redis.hincrby(key, "successCount", 1);
    } else {
      await redis.hincrby(key, "errorCount", 1);
    }
    await redis.hincrby(key, `tool:${toolName}`, 1);
    await redis.expire(key, 30 * 24 * 60 * 60); // 30 days
  } catch {
    // fire-and-forget: silently absorb errors
  }
}

export async function getMcpAnalytics(
  userId: string,
  clientId: string,
  days = 7
): Promise<McpAnalyticsSummary> {
  const redis = getRedis();

  let totalCalls = 0;
  let successCount = 0;
  let errorCount = 0;
  const toolCounts: Record<string, number> = {};
  const dailyBreakdown: { date: string; calls: number; success: number }[] = [];

  // Iterate over each day in the range
  for (let d = 0; d < days; d++) {
    const date = new Date();
    date.setDate(date.getDate() - d);
    const dateStr = date.toISOString().substring(0, 10);
    const key = analyticsKey(userId, clientId, dateStr);
    const data = await redis.hgetall(key);

    if (!data || Object.keys(data).length === 0) continue;

    const dayCalls = parseInt(String(data.totalCalls ?? "0"), 10) || 0;
    const daySuccess = parseInt(String(data.successCount ?? "0"), 10) || 0;
    const dayErrors = parseInt(String(data.errorCount ?? "0"), 10) || 0;

    totalCalls += dayCalls;
    successCount += daySuccess;
    errorCount += dayErrors;

    if (dayCalls > 0) {
      dailyBreakdown.push({ date: dateStr, calls: dayCalls, success: daySuccess });
    }

    for (const [field, val] of Object.entries(data)) {
      if (field.startsWith("tool:")) {
        const toolName = field.slice(5);
        toolCounts[toolName] = (toolCounts[toolName] || 0) + (parseInt(String(val), 10) || 0);
      }
    }
  }

  const topTools = Object.entries(toolCounts)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  const successRate = totalCalls > 0 ? successCount / totalCalls : 0;

  return {
    totalCalls,
    successCount,
    errorCount,
    successRate,
    topTools,
    dailyBreakdown,
  };
}
