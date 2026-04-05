import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/redis", () => ({
  getRedis: () => ({
    get: vi.fn(),
    set: vi.fn(),
  }),
}));

// Mock the Ratelimit class
const mockLimit = vi.fn();

vi.mock("@upstash/ratelimit", () => ({
  Ratelimit: class MockRatelimit {
    static slidingWindow = vi.fn(() => "sliding-window-config");
    private prefix: string;
    constructor(opts: { prefix: string }) {
      this.prefix = opts.prefix;
    }
    limit = mockLimit;
  },
}));

describe("getMcpClientLimiter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("AC-13: returns a limiter object with a limit method", async () => {
    const { getMcpClientLimiter } = await import("@/lib/rate-limit");
    const limiter = getMcpClientLimiter("client-123", 60);
    expect(limiter).toBeDefined();
    expect(typeof limiter.limit).toBe("function");
  });

  it("AC-14: returns different limiter instances for different client IDs", async () => {
    // Reset module to clear limiter cache
    vi.resetModules();
    const { getMcpClientLimiter } = await import("@/lib/rate-limit");
    const limiterA = getMcpClientLimiter("client-A", 60);
    const limiterB = getMcpClientLimiter("client-B", 60);
    // They should be different objects (different prefix keys)
    expect(limiterA).not.toBe(limiterB);
  });

  it("AC-13: same clientId returns cached limiter instance", async () => {
    vi.resetModules();
    const { getMcpClientLimiter } = await import("@/lib/rate-limit");
    const first = getMcpClientLimiter("client-X", 60);
    const second = getMcpClientLimiter("client-X", 60);
    expect(first).toBe(second);
  });
});
