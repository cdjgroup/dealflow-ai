import { Redis } from "@upstash/redis";
import type { Store } from "@auth0/ai/stores";

export class UpstashStore implements Store {
  private redis: Redis;

  constructor(redis?: Redis) {
    if (redis) {
      this.redis = redis;
    } else {
      if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
        throw new Error("Missing UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN");
      }
      this.redis = new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
      });
    }
  }

  private buildKey(namespace: string[], key: string): string {
    return namespace.length > 0 ? `${namespace.join(":")}:${key}` : key;
  }

  async get<T = unknown>(
    namespace: string[],
    key: string
  ): Promise<T | undefined> {
    const val = await this.redis.get<string>(this.buildKey(namespace, key));
    if (val === null || val === undefined) return undefined;
    if (typeof val === "string") {
      try {
        return JSON.parse(val) as T;
      } catch {
        return val as T;
      }
    }
    return val as T;
  }

  async put(
    namespace: string[],
    key: string,
    value: unknown,
    options?: { expiresIn?: number }
  ): Promise<void> {
    const k = this.buildKey(namespace, key);
    const serialized = JSON.stringify(value);

    if (options?.expiresIn && options.expiresIn > 0) {
      await this.redis.set(k, serialized, {
        ex: Math.ceil(options.expiresIn / 1000),
      });
    } else {
      await this.redis.set(k, serialized);
    }
  }

  async delete(namespace: string[], key: string): Promise<void> {
    await this.redis.del(this.buildKey(namespace, key));
  }
}
