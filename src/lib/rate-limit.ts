import { Ratelimit } from "@upstash/ratelimit";
import { getRedis } from "@/lib/redis";

let rateLimiter: Ratelimit | null = null;

// 10 requests per minute per user
export function getRateLimiter(): Ratelimit {
  if (!rateLimiter) {
    rateLimiter = new Ratelimit({
      redis: getRedis(),
      limiter: Ratelimit.slidingWindow(10, "1 m"),
      prefix: "dealflow:ratelimit",
    });
  }
  return rateLimiter;
}
