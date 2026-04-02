import { describe, it, expect, vi, beforeEach } from "vitest";
import { logToolExecution } from "@/lib/audit-log";

describe("Audit Log", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  it("should log JSON to console.log", () => {
    logToolExecution({
      userId: "user1",
      tool: "checkCalendar",
      params: { date: "2026-04-01" },
      success: true,
      durationMs: 150,
    });

    expect(console.log).toHaveBeenCalledOnce();
    const logged = JSON.parse(
      (console.log as ReturnType<typeof vi.fn>).mock.calls[0][0]
    );
    expect(logged).toMatchObject({
      type: "tool_execution",
      userId: "user1",
      tool: "checkCalendar",
      params: { date: "2026-04-01" },
      success: true,
      durationMs: 150,
    });
  });

  it("should include all required fields", () => {
    logToolExecution({
      userId: "user1",
      tool: "draftEmail",
      params: { to: "jane@example.com" },
      success: true,
      durationMs: 200,
    });

    const logged = JSON.parse(
      (console.log as ReturnType<typeof vi.fn>).mock.calls[0][0]
    );
    expect(logged).toHaveProperty("type");
    expect(logged).toHaveProperty("timestamp");
    expect(logged).toHaveProperty("userId");
    expect(logged).toHaveProperty("tool");
    expect(logged).toHaveProperty("params");
    expect(logged).toHaveProperty("success");
    expect(logged).toHaveProperty("durationMs");
  });

  it("should include a valid ISO timestamp", () => {
    logToolExecution({
      userId: "user1",
      tool: "searchEmails",
      params: {},
      success: true,
      durationMs: 50,
    });

    const logged = JSON.parse(
      (console.log as ReturnType<typeof vi.fn>).mock.calls[0][0]
    );
    expect(new Date(logged.timestamp).toISOString()).toBe(logged.timestamp);
  });

  it("should include error field when provided", () => {
    logToolExecution({
      userId: "user1",
      tool: "checkCalendar",
      params: {},
      success: false,
      durationMs: 100,
      error: "Token expired",
    });

    const logged = JSON.parse(
      (console.log as ReturnType<typeof vi.fn>).mock.calls[0][0]
    );
    expect(logged.error).toBe("Token expired");
  });

  it("should not include error field when not provided", () => {
    logToolExecution({
      userId: "user1",
      tool: "checkCalendar",
      params: {},
      success: true,
      durationMs: 100,
    });

    const logged = JSON.parse(
      (console.log as ReturnType<typeof vi.fn>).mock.calls[0][0]
    );
    expect(logged).not.toHaveProperty("error");
  });
});
