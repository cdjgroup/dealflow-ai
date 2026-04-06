import { Ratelimit } from "@upstash/ratelimit";
import { getRedis } from "@/lib/redis";

const limiters = new Map<string, Ratelimit>();

function create(prefix: string, requests: number, window: string): Ratelimit {
  const key = `dealflow:rl:${prefix}`;
  let limiter = limiters.get(key);
  if (!limiter) {
    limiter = new Ratelimit({
      redis: getRedis(),
      limiter: Ratelimit.slidingWindow(requests, window as "1 m"),
      prefix: key,
    });
    limiters.set(key, limiter);
  }
  return limiter;
}

// 20 req/min — AI chat, seed, action execute, batch operations
export function getRateLimiter(): Ratelimit {
  return create("default", 20, "1 m");
}

// 30 req/min — polling endpoints (CIBA status, token status)
export function getPollingLimiter(): Ratelimit {
  return create("poll", 30, "1 m");
}

// 5 req/min — sensitive operations (CIBA initiate, connection changes)
export function getSensitiveLimiter(): Ratelimit {
  return create("sensitive", 5, "1 m");
}

// Per-tool rate limiters — requests/window configurable per tool
export function getToolRateLimiter(toolName: string, requests: number, window: string): Ratelimit {
  return create(`tool:${toolName}`, requests, window);
}

// Per-client MCP rate limiting — dynamic rate per client
export function getMcpClientLimiter(clientId: string, requestsPerMinute: number): Ratelimit {
  return create(`mcp:${clientId}`, requestsPerMinute, "1 m");
}
