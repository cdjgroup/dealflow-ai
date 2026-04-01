import { describe, it, expect, vi, beforeEach } from "vitest";
import { UpstashStore } from "@/lib/stores/upstash-store";

const mockGet = vi.fn();
const mockSet = vi.fn();
const mockDel = vi.fn();

vi.mock("@upstash/redis", () => ({
  Redis: class {
    get = mockGet;
    set = mockSet;
    del = mockDel;
  },
}));

function getMockRedis() {
  return { get: mockGet, set: mockSet, del: mockDel };
}

describe("UpstashStore", () => {
  let store: UpstashStore;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.UPSTASH_REDIS_REST_URL = "https://test.upstash.io";
    process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";
    store = new UpstashStore();
  });

  describe("get", () => {
    it("should return value for existing key", async () => {
      const mockRedis = getMockRedis();
      mockRedis.get.mockResolvedValue({ accessToken: "test-token" });

      const result = await store.get(["ns1", "ns2"], "mykey");

      expect(result).toEqual({ accessToken: "test-token" });
      expect(mockRedis.get).toHaveBeenCalledWith("ns1:ns2:mykey");
    });

    it("should return undefined for missing key", async () => {
      const mockRedis = getMockRedis();
      mockRedis.get.mockResolvedValue(null);

      const result = await store.get(["ns1"], "missing");

      expect(result).toBeUndefined();
    });

    it("should handle empty namespace array", async () => {
      const mockRedis = getMockRedis();
      mockRedis.get.mockResolvedValue("value");

      const result = await store.get([], "key");

      expect(result).toBe("value");
      expect(mockRedis.get).toHaveBeenCalledWith("key");
    });
  });

  describe("put", () => {
    it("should store value without TTL", async () => {
      const mockRedis = getMockRedis();
      mockRedis.set.mockResolvedValue("OK");

      await store.put(["ns1", "ns2"], "mykey", { token: "abc" });

      expect(mockRedis.set).toHaveBeenCalledWith(
        "ns1:ns2:mykey",
        JSON.stringify({ token: "abc" })
      );
    });

    it("should store value with TTL (expiresIn in ms)", async () => {
      const mockRedis = getMockRedis();
      mockRedis.set.mockResolvedValue("OK");

      await store.put(["ns1"], "mykey", "data", { expiresIn: 60000 });

      expect(mockRedis.set).toHaveBeenCalledWith(
        "ns1:mykey",
        JSON.stringify("data"),
        { ex: 60 }
      );
    });

    it("should handle zero TTL as no expiry", async () => {
      const mockRedis = getMockRedis();
      mockRedis.set.mockResolvedValue("OK");

      await store.put(["ns1"], "key", "val", { expiresIn: 0 });

      expect(mockRedis.set).toHaveBeenCalledWith(
        "ns1:key",
        JSON.stringify("val")
      );
    });
  });

  describe("delete", () => {
    it("should delete key", async () => {
      const mockRedis = getMockRedis();
      mockRedis.del.mockResolvedValue(1);

      await store.delete(["ns1", "ns2"], "mykey");

      expect(mockRedis.del).toHaveBeenCalledWith("ns1:ns2:mykey");
    });
  });

  describe("key construction", () => {
    it("should join namespace parts with colons", async () => {
      const mockRedis = getMockRedis();
      mockRedis.get.mockResolvedValue(null);

      await store.get(["a", "b", "c"], "d");

      expect(mockRedis.get).toHaveBeenCalledWith("a:b:c:d");
    });
  });
});
