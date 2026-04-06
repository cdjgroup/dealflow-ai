import { describe, it, expect, vi, beforeEach } from "vitest";
import type {
  RateLimitResult,
  ToolRateLimitConfig,
  ToolTier,
} from "@/lib/rate-limiter";

// ---------------------------------------------------------------------------
// Mock @/lib/rate-limit — must be hoisted so vi.mock factory runs before
// any import of the module under test.
// ---------------------------------------------------------------------------
const mockLimitFn = vi.hoisted(() => vi.fn());
const mockGetToolRateLimiter = vi.hoisted(() => vi.fn());

vi.mock("@/lib/rate-limit", () => ({
  getToolRateLimiter: mockGetToolRateLimiter,
}));

// Dynamic import so mocks are already registered when the module loads.
const {
  checkToolRateLimit,
  attachRateLimiter,
  RequestToolCounter,
  TOOL_RATE_LIMITS,
  REQUEST_TOOL_CALL_LIMIT,
} = await import("@/lib/rate-limiter");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal Tool-like object with a spy execute fn. */
function makeTool(name: string) {
  return {
    description: `${name} tool`,
    execute: vi.fn().mockResolvedValue({ success: true, toolName: name }),
  };
}

/** Default happy-path Ratelimit.limit() response. */
function allowedLimitResponse(remaining = 9, reset = Date.now() + 60_000) {
  return { success: true, remaining, reset, limit: 10 };
}

/** Blocked Ratelimit.limit() response. */
function blockedLimitResponse(reset = Date.now() + 60_000) {
  return { success: false, remaining: 0, reset, limit: 10 };
}

// ---------------------------------------------------------------------------
// TOOL_RATE_LIMITS — static config verification
// ---------------------------------------------------------------------------

describe("TOOL_RATE_LIMITS", () => {
  it("contains config entries for all read-tier tools", () => {
    const readTools = ["checkCalendar", "searchEmails", "listSlackChannels"];
    for (const tool of readTools) {
      expect(TOOL_RATE_LIMITS).toHaveProperty(tool);
      expect(TOOL_RATE_LIMITS[tool].tier).toBe("read");
      expect(TOOL_RATE_LIMITS[tool].requests).toBe(10);
    }
  });

  it("contains config entries for all write-tier tools", () => {
    const writeTools = ["draftEmail", "createCalendarEvent", "sendSlackMessage"];
    for (const tool of writeTools) {
      expect(TOOL_RATE_LIMITS).toHaveProperty(tool);
      expect(TOOL_RATE_LIMITS[tool].tier).toBe("write");
      expect(TOOL_RATE_LIMITS[tool].requests).toBe(10);
    }
  });

  it("contains config entries for all crm-read-tier tools", () => {
    const crmReadTools = ["listDeals", "getDealDetails", "searchContacts"];
    for (const tool of crmReadTools) {
      expect(TOOL_RATE_LIMITS).toHaveProperty(tool);
      expect(TOOL_RATE_LIMITS[tool].tier).toBe("crm-read");
      expect(TOOL_RATE_LIMITS[tool].requests).toBe(20);
    }
  });

  it("contains config entries for all crm-write-tier tools", () => {
    const crmWriteTools = [
      "createDeal",
      "updateDeal",
      "createContact",
      "logActivity",
    ];
    for (const tool of crmWriteTools) {
      expect(TOOL_RATE_LIMITS).toHaveProperty(tool);
      expect(TOOL_RATE_LIMITS[tool].tier).toBe("crm-write");
      expect(TOOL_RATE_LIMITS[tool].requests).toBe(5);
    }
  });
});

// ---------------------------------------------------------------------------
// REQUEST_TOOL_CALL_LIMIT — constant value
// ---------------------------------------------------------------------------

describe("REQUEST_TOOL_CALL_LIMIT", () => {
  it("is 15", () => {
    expect(REQUEST_TOOL_CALL_LIMIT).toBe(15);
  });
});

// ---------------------------------------------------------------------------
// checkToolRateLimit
// ---------------------------------------------------------------------------

describe("checkToolRateLimit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: rate limiter allows the call
    mockGetToolRateLimiter.mockReturnValue({ limit: mockLimitFn });
    mockLimitFn.mockResolvedValue(allowedLimitResponse());
  });

  // AC-2: within limits → allowed
  it("AC-2: returns allowed:true when Ratelimit.limit() succeeds", async () => {
    mockLimitFn.mockResolvedValue(allowedLimitResponse(9, Date.now() + 60_000));

    const result = await checkToolRateLimit("user-1", "checkCalendar");

    expect(result.allowed).toBe(true);
    expect(result.toolName).toBe("checkCalendar");
    expect(result.tier).toBe("read");
    expect(result.remaining).toBe(9);
  });

  // AC-1: over limits → blocked
  it("AC-1: returns allowed:false when Ratelimit.limit() reports breach", async () => {
    const resetMs = Date.now() + 55_000;
    mockLimitFn.mockResolvedValue(blockedLimitResponse(resetMs));

    const result = await checkToolRateLimit("user-1", "draftEmail");

    expect(result.allowed).toBe(false);
    expect(result.toolName).toBe("draftEmail");
    expect(result.tier).toBe("write");
    expect(result.remaining).toBe(0);
    expect(result.resetMs).toBeDefined();
  });

  // AC-1: blocked result carries resetMs as a duration (not epoch)
  it("AC-1: blocked result includes resetMs as ms-until-reset duration", async () => {
    const futureReset = Date.now() + 45_000;
    mockLimitFn.mockResolvedValue(blockedLimitResponse(futureReset));

    const result = await checkToolRateLimit("user-1", "createDeal");

    expect(typeof result.resetMs).toBe("number");
    expect(result.resetMs).toBeGreaterThan(0);
    // Must be a duration (< 60s window), not an epoch timestamp
    expect(result.resetMs).toBeLessThan(60_000);
  });

  // AC-5: tool without a rate-limit config passes through
  it("AC-5: returns allowed:true for tools not in TOOL_RATE_LIMITS without calling Ratelimit", async () => {
    const result = await checkToolRateLimit("user-1", "unknownTool");

    expect(result.allowed).toBe(true);
    expect(result.toolName).toBe("unknownTool");
    // remaining must be finite and JSON-safe for unconfigured tools
    expect(Number.isFinite(result.remaining)).toBe(true);
    // No rate limiter should be created for an unknown tool
    expect(mockGetToolRateLimiter).not.toHaveBeenCalled();
    expect(mockLimitFn).not.toHaveBeenCalled();
  });

  // AC-11: Redis unreachable → fail-closed
  it("AC-11: returns allowed:false and logs error when Ratelimit.limit() throws (fail-closed)", async () => {
    mockLimitFn.mockRejectedValue(new Error("Upstash connection refused"));
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await checkToolRateLimit("user-1", "checkCalendar");

    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(consoleSpy).toHaveBeenCalled();

    consoleSpy.mockRestore();
  });

  // AC-11: getToolRateLimiter itself throws → fail-closed
  it("AC-11: returns allowed:false when getToolRateLimiter throws (fail-closed)", async () => {
    mockGetToolRateLimiter.mockImplementation(() => {
      throw new Error("Redis init failed");
    });
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await checkToolRateLimit("user-1", "listDeals");

    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(consoleSpy).toHaveBeenCalled();

    consoleSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// attachRateLimiter
// ---------------------------------------------------------------------------

describe("attachRateLimiter", () => {
  let onBlocked: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    onBlocked = vi.fn();
    // Default: all calls allowed
    mockGetToolRateLimiter.mockReturnValue({ limit: mockLimitFn });
    mockLimitFn.mockResolvedValue(allowedLimitResponse());
  });

  // AC-2: within limits → execute runs normally
  it("AC-2: calls the original execute when rate limit is not exceeded", async () => {
    const tools = { checkCalendar: makeTool("checkCalendar") };
    const wrapped = attachRateLimiter(tools, "user-1", onBlocked);

    const result = await wrapped.checkCalendar.execute!({}, {});

    expect(tools.checkCalendar.execute).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ success: true, toolName: "checkCalendar" });
    expect(onBlocked).not.toHaveBeenCalled();
  });

  // AC-1: over limit → execute is NOT called, onBlocked fires, error returned
  it("AC-1: does not call execute and fires onBlocked when rate limit is exceeded", async () => {
    mockLimitFn.mockResolvedValue(blockedLimitResponse());
    const tools = { draftEmail: makeTool("draftEmail") };
    const wrapped = attachRateLimiter(tools, "user-1", onBlocked);

    const result = await wrapped.draftEmail.execute!({}, {});

    expect(tools.draftEmail.execute).not.toHaveBeenCalled();
    expect(onBlocked).toHaveBeenCalledTimes(1);

    // The result must carry error-type information about the block
    expect(result).toBeDefined();
    expect(result).toHaveProperty("toolName", "draftEmail");
  });

  // AC-9: onBlocked receives a RateLimitResult with required fields
  it("AC-9: onBlocked callback receives RateLimitResult with toolName, tier, remaining, resetMs", async () => {
    mockLimitFn.mockResolvedValue(blockedLimitResponse());
    const tools = { createDeal: makeTool("createDeal") };
    const wrapped = attachRateLimiter(tools, "user-1", onBlocked);

    await wrapped.createDeal.execute!({}, {});

    expect(onBlocked).toHaveBeenCalledTimes(1);
    const rlResult: RateLimitResult = onBlocked.mock.calls[0][0];
    expect(rlResult.toolName).toBe("createDeal");
    expect(rlResult.tier).toBe("crm-write");
    expect(rlResult.allowed).toBe(false);
    expect(typeof rlResult.remaining).toBe("number");
    expect(typeof rlResult.resetMs).toBe("number");
  });

  // AC-1: blocked result contains toolName and resetMs (user-facing error info)
  it("AC-1: error result from blocked call includes toolName and resetMs", async () => {
    const resetMs = Date.now() + 30_000;
    mockLimitFn.mockResolvedValue(blockedLimitResponse(resetMs));
    const tools = { sendSlackMessage: makeTool("sendSlackMessage") };
    const wrapped = attachRateLimiter(tools, "user-1", onBlocked);

    const result = await wrapped.sendSlackMessage.execute!({}, {});

    expect(result).toHaveProperty("toolName", "sendSlackMessage");
    // resetMs must be present so callers can surface a retry-after
    expect(result).toHaveProperty("resetMs");
  });

  // AC-5: tools without execute are passed through unchanged
  it("AC-5: preserves tool object when it has no execute function", () => {
    const noExecTool = { description: "no exec" };
    const tools = { delegateResearch: noExecTool as any };
    const wrapped = attachRateLimiter(tools, "user-1", onBlocked);

    // Tool is still present in the wrapped map
    expect(wrapped).toHaveProperty("delegateResearch");
    // No rate-limit overhead — getToolRateLimiter was never called at wrap time
    expect(mockGetToolRateLimiter).not.toHaveBeenCalled();
  });

  // AC-5: tools without a rate-limit config entry pass through normally
  it("AC-5: calls execute without rate-limit check for tools not in TOOL_RATE_LIMITS", async () => {
    const unknownTool = makeTool("unknownTool");
    const tools = { unknownTool };
    const wrapped = attachRateLimiter(tools, "user-1", onBlocked);

    const result = await wrapped.unknownTool.execute!({}, {});

    expect(unknownTool.execute).toHaveBeenCalledTimes(1);
    expect(mockLimitFn).not.toHaveBeenCalled();
    expect(onBlocked).not.toHaveBeenCalled();
    expect(result).toEqual({ success: true, toolName: "unknownTool" });
  });

  // AC-12: Redis error during wrapped execute → fail-closed (execute does NOT run)
  it("AC-12: blocks tool and fires onBlocked when rate-limit check throws (fail-closed)", async () => {
    mockLimitFn.mockRejectedValue(new Error("Upstash timeout"));
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const tools = { listDeals: makeTool("listDeals") };
    const wrapped = attachRateLimiter(tools, "user-1", onBlocked);

    const result = await wrapped.listDeals.execute!({}, {});

    expect(tools.listDeals.execute).not.toHaveBeenCalled();
    expect(onBlocked).toHaveBeenCalledTimes(1);
    expect(consoleSpy).toHaveBeenCalled();
    expect(result).toHaveProperty("error");
    expect(result).toHaveProperty("toolName", "listDeals");

    consoleSpy.mockRestore();
  });

  // AC-12: getToolRateLimiter throws inside wrapped execute → fail-closed
  it("AC-12: blocks tool and fires onBlocked when getToolRateLimiter throws inside wrapped execute (fail-closed)", async () => {
    mockGetToolRateLimiter.mockImplementation(() => {
      throw new Error("Redis init failed during execute");
    });
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const tools = { draftEmail: makeTool("draftEmail") };
    const wrapped = attachRateLimiter(tools, "user-1", onBlocked);

    const result = await wrapped.draftEmail.execute!({}, {});

    expect(tools.draftEmail.execute).not.toHaveBeenCalled();
    expect(onBlocked).toHaveBeenCalledTimes(1);
    expect(consoleSpy).toHaveBeenCalled();
    expect(result).toHaveProperty("error");
    expect(result).toHaveProperty("toolName", "draftEmail");

    consoleSpy.mockRestore();
  });

  // Property preservation — non-execute properties are kept intact
  it("preserves non-execute properties on wrapped tools", () => {
    const tool = {
      description: "Check the calendar",
      parameters: { type: "object" },
      execute: vi.fn().mockResolvedValue({}),
    };
    const wrapped = attachRateLimiter({ checkCalendar: tool as any }, "user-1", onBlocked);

    expect(wrapped.checkCalendar.description).toBe("Check the calendar");
    expect((wrapped.checkCalendar as any).parameters).toEqual({ type: "object" });
  });
});

// ---------------------------------------------------------------------------
// RequestToolCounter
// ---------------------------------------------------------------------------

describe("RequestToolCounter", () => {
  it("returns breached:false for counts 1 through 15 (default limit)", () => {
    const counter = new RequestToolCounter();
    for (let i = 1; i <= 15; i++) {
      const result = counter.increment();
      expect(result.breached).toBe(false);
      expect(result.count).toBe(i);
      expect(result.limit).toBe(15);
    }
  });

  it("returns breached:true on the 16th increment (exceeds default limit of 15)", () => {
    const counter = new RequestToolCounter();
    for (let i = 0; i < 15; i++) {
      counter.increment();
    }
    const result = counter.increment();
    expect(result.breached).toBe(true);
    expect(result.count).toBe(16);
  });

  it("returns breached:false at the limit boundary (count === limit)", () => {
    const counter = new RequestToolCounter();
    let last = counter.increment();
    for (let i = 1; i < 15; i++) {
      last = counter.increment();
    }
    // 15th call — exactly at limit, not yet over
    expect(last.breached).toBe(false);
    expect(last.count).toBe(15);
  });

  it("getCount() tracks the running total accurately", () => {
    const counter = new RequestToolCounter();
    expect(counter.getCount()).toBe(0);
    counter.increment();
    counter.increment();
    counter.increment();
    expect(counter.getCount()).toBe(3);
  });

  it("custom limit: breaches at limit + 1 (custom limit = 3)", () => {
    const counter = new RequestToolCounter(3);
    counter.increment(); // 1 — ok
    counter.increment(); // 2 — ok
    counter.increment(); // 3 — ok (at limit, not over)
    const result = counter.increment(); // 4 — breached
    expect(result.breached).toBe(true);
    expect(result.count).toBe(4);
    expect(result.limit).toBe(3);
  });

  it("getCount() reflects the true count after breaching the limit", () => {
    const counter = new RequestToolCounter(2);
    counter.increment(); // 1
    counter.increment(); // 2
    counter.increment(); // 3 — breached
    counter.increment(); // 4
    expect(counter.getCount()).toBe(4);
  });

  it("custom limit: allows calls within custom limit without breaching", () => {
    const counter = new RequestToolCounter(5);
    for (let i = 1; i <= 5; i++) {
      const result = counter.increment();
      expect(result.breached).toBe(false);
    }
  });
});
