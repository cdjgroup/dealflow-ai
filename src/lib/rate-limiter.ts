import { getToolRateLimiter } from "@/lib/rate-limit";

export type ToolTier = "read" | "write" | "crm-read" | "crm-write";

export interface ToolRateLimitConfig {
  tier: ToolTier;
  requests: number;
  window: string;
}

export interface RateLimitResult {
  allowed: boolean;
  toolName: string;
  tier?: ToolTier;
  remaining: number;
  resetMs?: number;
}

export const TOOL_RATE_LIMITS: Record<string, ToolRateLimitConfig> = {
  // read tier — 10/min
  checkCalendar: { tier: "read", requests: 10, window: "1 m" },
  searchEmails: { tier: "read", requests: 10, window: "1 m" },
  listSlackChannels: { tier: "read", requests: 10, window: "1 m" },

  // write tier — 5/min
  draftEmail: { tier: "write", requests: 5, window: "1 m" },
  createCalendarEvent: { tier: "write", requests: 5, window: "1 m" },
  sendSlackMessage: { tier: "write", requests: 5, window: "1 m" },

  // crm-read tier — 20/min
  listDeals: { tier: "crm-read", requests: 20, window: "1 m" },
  getDealDetails: { tier: "crm-read", requests: 20, window: "1 m" },
  searchContacts: { tier: "crm-read", requests: 20, window: "1 m" },

  // crm-write tier — 5/min
  createDeal: { tier: "crm-write", requests: 5, window: "1 m" },
  updateDeal: { tier: "crm-write", requests: 5, window: "1 m" },
  createContact: { tier: "crm-write", requests: 5, window: "1 m" },
  logActivity: { tier: "crm-write", requests: 5, window: "1 m" },

  // compound tools — 3/min (expensive: spawn sub-agents or generate bulk actions)
  delegateResearch: { tier: "read", requests: 3, window: "1 m" },
  analyzePipeline: { tier: "read", requests: 3, window: "1 m" },
};

export const REQUEST_TOOL_CALL_LIMIT = 15;

export async function checkToolRateLimit(
  userId: string,
  toolName: string
): Promise<RateLimitResult> {
  const config = TOOL_RATE_LIMITS[toolName];

  if (!config) {
    return { allowed: true, toolName, remaining: -1 };
  }

  try {
    const limiter = getToolRateLimiter(toolName, config.requests, config.window);
    const response = await limiter.limit(userId);

    if (response.success) {
      return {
        allowed: true,
        toolName,
        tier: config.tier,
        remaining: response.remaining,
      };
    } else {
      return {
        allowed: false,
        toolName,
        tier: config.tier,
        remaining: 0,
        resetMs: Math.max(0, response.reset - Date.now()),
      };
    }
  } catch (err) {
    console.error(`[rate-limiter] rate limit check failed for ${toolName}:`, err);
    return { allowed: false, toolName, tier: config.tier, remaining: 0 };
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyTool = Record<string, any>;

export function attachRateLimiter<T extends AnyTool>(
  tools: Record<string, T>,
  userId: string,
  onBlocked: (result: RateLimitResult) => void
): Record<string, T> {
  const wrapped: Record<string, T> = {};

  for (const [toolName, tool] of Object.entries(tools)) {
    if (!tool.execute) {
      wrapped[toolName] = tool;
      continue;
    }

    const originalExecute = tool.execute;

    wrapped[toolName] = {
      ...tool,
      execute: async (...args: unknown[]): Promise<unknown> => {
        const config = TOOL_RATE_LIMITS[toolName];

        if (!config) {
          return originalExecute(...args);
        }

        let rlResult: RateLimitResult;
        try {
          rlResult = await checkToolRateLimit(userId, toolName);
        } catch (err) {
          console.error(`[rate-limiter] unexpected error for ${toolName}:`, err);
          const failResult: RateLimitResult = {
            allowed: false,
            toolName,
            tier: config.tier,
            remaining: 0,
          };
          onBlocked(failResult);
          return {
            error: `Rate limit check failed for tool ${toolName}`,
            toolName,
          };
        }

        if (!rlResult.allowed) {
          onBlocked(rlResult);
          return {
            error: `Rate limit exceeded for tool ${toolName}`,
            toolName,
            resetMs: rlResult.resetMs,
          };
        }

        return originalExecute(...args);
      },
    };
  }

  return wrapped;
}

export class RequestToolCounter {
  private count = 0;
  private readonly limit: number;

  constructor(limit = REQUEST_TOOL_CALL_LIMIT) {
    this.limit = limit;
  }

  increment(): { count: number; limit: number; breached: boolean } {
    this.count += 1;
    return {
      count: this.count,
      limit: this.limit,
      breached: this.count > this.limit,
    };
  }

  getCount(): number {
    return this.count;
  }
}
