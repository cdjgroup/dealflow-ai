import { describe, it, expect, vi, beforeEach } from "vitest";
import { checkCsrf, validateMessages } from "@/lib/api-guard";

describe("API Guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("checkCsrf", () => {
    it("should return null when X-Requested-With header is present", () => {
      const req = new Request("http://localhost/api/chat", {
        method: "POST",
        headers: { "X-Requested-With": "XMLHttpRequest" },
      });

      const result = checkCsrf(req);

      expect(result).toBeNull();
    });

    it("should return 403 when X-Requested-With header is missing", async () => {
      const req = new Request("http://localhost/api/chat", {
        method: "POST",
      });

      const result = checkCsrf(req);

      expect(result).not.toBeNull();
      expect(result!.status).toBe(403);
      const body = await result!.json();
      expect(body.error).toBe("Forbidden");
    });

    it("should return 403 when X-Requested-With header has wrong value", async () => {
      const req = new Request("http://localhost/api/chat", {
        method: "POST",
        headers: { "X-Requested-With": "fetch" },
      });

      const result = checkCsrf(req);

      expect(result).not.toBeNull();
      expect(result!.status).toBe(403);
    });
  });

  describe("validateMessages", () => {
    it("should return null for valid messages", () => {
      const messages = [
        { content: "Hello" },
        { content: "World" },
      ];

      const result = validateMessages(messages);

      expect(result).toBeNull();
    });

    it("should return 400 when messages exceed max count (100)", async () => {
      const messages = Array.from({ length: 101 }, (_, i) => ({
        content: `msg ${i}`,
      }));

      const result = validateMessages(messages);

      expect(result).not.toBeNull();
      expect(result!.status).toBe(400);
      const body = await result!.json();
      expect(body.error).toContain("Too many messages");
    });

    it("should return null for exactly 100 messages", () => {
      const messages = Array.from({ length: 100 }, (_, i) => ({
        content: `msg ${i}`,
      }));

      const result = validateMessages(messages);

      expect(result).toBeNull();
    });

    it("should return 400 when a message content exceeds 10000 chars", async () => {
      const messages = [
        { content: "a".repeat(10_001) },
      ];

      const result = validateMessages(messages);

      expect(result).not.toBeNull();
      expect(result!.status).toBe(400);
      const body = await result!.json();
      expect(body.error).toContain("Message too long");
    });

    it("should return null for message content at exactly 10000 chars", () => {
      const messages = [
        { content: "a".repeat(10_000) },
      ];

      const result = validateMessages(messages);

      expect(result).toBeNull();
    });

    it("should skip messages without content property", () => {
      const messages = [
        { role: "system" },
        { content: "Hello" },
      ];

      const result = validateMessages(messages);

      expect(result).toBeNull();
    });

    it("should skip messages with non-string content", () => {
      const messages = [
        { content: 12345 },
        { content: ["array content"] },
      ];

      const result = validateMessages(messages);

      expect(result).toBeNull();
    });
  });
});
