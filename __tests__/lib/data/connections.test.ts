import { describe, it, expect, vi, beforeEach } from "vitest";

const mockRedis = {
  sismember: vi.fn(),
  sadd: vi.fn(),
  srem: vi.fn(),
  smembers: vi.fn(),
};

vi.mock("@/lib/redis", () => ({
  getRedis: () => mockRedis,
}));

import {
  isConnectionDisabled,
  disableConnection,
  enableConnection,
  getDisabledConnections,
} from "@/lib/data/connections";

describe("connection flags", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("isConnectionDisabled returns true when flag is set", async () => {
    mockRedis.sismember.mockResolvedValue(1);

    const result = await isConnectionDisabled("user1", "google-oauth2");

    expect(result).toBe(true);
    expect(mockRedis.sismember).toHaveBeenCalledWith(
      "user1:disabled-connections",
      "google-oauth2"
    );
  });

  it("isConnectionDisabled returns false when flag is not set", async () => {
    mockRedis.sismember.mockResolvedValue(0);

    const result = await isConnectionDisabled("user1", "google-oauth2");

    expect(result).toBe(false);
  });

  it("disableConnection adds to set", async () => {
    mockRedis.sadd.mockResolvedValue(1);

    await disableConnection("user1", "google-oauth2");

    expect(mockRedis.sadd).toHaveBeenCalledWith(
      "user1:disabled-connections",
      "google-oauth2"
    );
  });

  it("enableConnection removes from set", async () => {
    mockRedis.srem.mockResolvedValue(1);

    await enableConnection("user1", "google-oauth2");

    expect(mockRedis.srem).toHaveBeenCalledWith(
      "user1:disabled-connections",
      "google-oauth2"
    );
  });

  it("getDisabledConnections returns all disabled", async () => {
    mockRedis.smembers.mockResolvedValue(["google-oauth2", "sign-in-with-slack"]);

    const result = await getDisabledConnections("user1");

    expect(result).toEqual(["google-oauth2", "sign-in-with-slack"]);
  });
});
