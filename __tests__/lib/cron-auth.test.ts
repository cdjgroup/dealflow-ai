import { describe, it, expect, beforeEach } from "vitest";
import { verifyCronSecret } from "@/lib/cron-auth";

describe("verifyCronSecret", () => {
  beforeEach(() => {
    process.env.CRON_SECRET = "test-cron-secret-value";
  });

  it("returns true for correct Bearer token", () => {
    const req = new Request("http://localhost/api/cron/test", {
      headers: { Authorization: "Bearer test-cron-secret-value" },
    });

    expect(verifyCronSecret(req)).toBe(true);
  });

  it("returns false when secret is wrong", () => {
    const req = new Request("http://localhost/api/cron/test", {
      headers: { Authorization: "Bearer wrong-secret" },
    });

    expect(verifyCronSecret(req)).toBe(false);
  });

  it("returns false when Authorization header is missing", () => {
    const req = new Request("http://localhost/api/cron/test");

    expect(verifyCronSecret(req)).toBe(false);
  });

  it("returns false when token length differs (timing-safe guard)", () => {
    const req = new Request("http://localhost/api/cron/test", {
      headers: { Authorization: "Bearer short" },
    });

    expect(verifyCronSecret(req)).toBe(false);
  });

  it("returns false for empty Bearer token", () => {
    const req = new Request("http://localhost/api/cron/test", {
      headers: { Authorization: "Bearer " },
    });

    expect(verifyCronSecret(req)).toBe(false);
  });
});
