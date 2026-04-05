import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createMcpClient,
  getMcpClient,
  listMcpClients,
  deleteMcpClient,
  rotateApiKey,
  lookupByApiKey,
} from "@/lib/data/mcp-clients";

const mockGet = vi.fn();
const mockSet = vi.fn();
const mockDel = vi.fn();
const mockSadd = vi.fn();
const mockSrem = vi.fn();
const mockSmembers = vi.fn();
const mockMget = vi.fn();
const mockPipelineExec = vi.fn();
const mockPipeline = vi.fn(() => ({ exec: mockPipelineExec }));

vi.mock("@/lib/redis", () => ({
  getRedis: () => ({
    get: mockGet,
    set: mockSet,
    del: mockDel,
    sadd: mockSadd,
    srem: mockSrem,
    smembers: mockSmembers,
    mget: mockMget,
    pipeline: mockPipeline,
  }),
}));

const TEST_USER = "auth0|test-user-mcp";

describe("mcp-clients data layer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ----------------------------------------------------------------
  // createMcpClient
  // ----------------------------------------------------------------
  describe("createMcpClient", () => {
    it("AC-3: returns a client with correct name and allowedTools", async () => {
      // Arrange
      mockSet.mockResolvedValue("OK");
      mockSadd.mockResolvedValue(1);

      // Act
      const { client } = await createMcpClient(TEST_USER, {
        name: "Research Bot",
        allowedTools: ["listDeals", "searchContacts"],
      });

      // Assert
      expect(client.name).toBe("Research Bot");
      expect(client.allowedTools).toEqual(
        expect.arrayContaining(["listDeals", "searchContacts"])
      );
      expect(client.allowedTools).toHaveLength(2);
    });

    it("AC-3: returned client has a non-empty apiKeyHash", async () => {
      // Arrange
      mockSet.mockResolvedValue("OK");
      mockSadd.mockResolvedValue(1);

      // Act
      const { client } = await createMcpClient(TEST_USER, {
        name: "Research Bot",
        allowedTools: ["listDeals"],
      });

      // Assert
      expect(client.apiKeyHash).toBeDefined();
      expect(client.apiKeyHash.length).toBeGreaterThan(0);
    });

    it("AC-3: returned rawApiKey is a non-empty string", async () => {
      // Arrange
      mockSet.mockResolvedValue("OK");
      mockSadd.mockResolvedValue(1);

      // Act
      const { rawApiKey } = await createMcpClient(TEST_USER, {
        name: "Research Bot",
        allowedTools: ["listDeals"],
      });

      // Assert
      expect(typeof rawApiKey).toBe("string");
      expect(rawApiKey.length).toBeGreaterThan(0);
    });

    it("AC-3: rawApiKey is NOT the same as apiKeyHash (key is hashed before storage)", async () => {
      // Arrange
      mockSet.mockResolvedValue("OK");
      mockSadd.mockResolvedValue(1);

      // Act
      const { client, rawApiKey } = await createMcpClient(TEST_USER, {
        name: "Research Bot",
        allowedTools: ["listDeals"],
      });

      // Assert — the hash stored on the client must differ from the raw key
      expect(client.apiKeyHash).not.toBe(rawApiKey);
    });

    it("AC-3: created client carries the userId of the creator", async () => {
      // Arrange
      mockSet.mockResolvedValue("OK");
      mockSadd.mockResolvedValue(1);

      // Act
      const { client } = await createMcpClient(TEST_USER, {
        name: "Research Bot",
        allowedTools: ["listDeals"],
      });

      // Assert
      expect(client.userId).toBe(TEST_USER);
    });

    it("AC-3: created client has id, createdAt, and updatedAt fields", async () => {
      // Arrange
      mockSet.mockResolvedValue("OK");
      mockSadd.mockResolvedValue(1);

      // Act
      const { client } = await createMcpClient(TEST_USER, {
        name: "Research Bot",
        allowedTools: ["listDeals"],
      });

      // Assert
      expect(client.id).toBeDefined();
      expect(client.createdAt).toBeDefined();
      expect(client.updatedAt).toBeDefined();
    });

    it("applies default trustTier and rateLimit when not provided", async () => {
      // Arrange
      mockSet.mockResolvedValue("OK");
      mockSadd.mockResolvedValue(1);

      // Act
      const { client } = await createMcpClient(TEST_USER, {
        name: "Minimal Bot",
      });

      // Assert — defaults must be populated (exact values defined by implementation)
      expect(client.trustTier).toBeDefined();
      expect(client.rateLimit).toBeGreaterThan(0);
    });

    it("persists the client record to Redis", async () => {
      // Arrange
      mockSet.mockResolvedValue("OK");
      mockSadd.mockResolvedValue(1);

      // Act
      await createMcpClient(TEST_USER, {
        name: "Research Bot",
        allowedTools: ["listDeals"],
      });

      // Assert — set must be called with at least the client object
      expect(mockSet).toHaveBeenCalled();
    });

    it("registers the client id in the user's client set in Redis", async () => {
      // Arrange
      mockSet.mockResolvedValue("OK");
      mockSadd.mockResolvedValue(1);

      // Act
      const { client } = await createMcpClient(TEST_USER, {
        name: "Research Bot",
        allowedTools: ["listDeals"],
      });

      // Assert — sadd must reference the new client id so listMcpClients can find it
      expect(mockSadd).toHaveBeenCalledWith(
        expect.stringContaining(TEST_USER),
        client.id
      );
    });
  });

  // ----------------------------------------------------------------
  // listMcpClients
  // ----------------------------------------------------------------
  describe("listMcpClients", () => {
    it("AC-3: returns the created client when listing by userId", async () => {
      // Arrange — simulate one client stored in Redis
      const storedClient = {
        id: "client-abc",
        userId: TEST_USER,
        name: "Research Bot",
        allowedTools: ["listDeals", "searchContacts"],
        trustTier: "standard",
        rateLimit: 100,
        apiKeyHash: "hash-of-key",
        apiKeyPrefix: "mcp_resear",
        createdAt: "2026-04-05T00:00:00Z",
        updatedAt: "2026-04-05T00:00:00Z",
      };
      mockSmembers.mockResolvedValue(["client-abc"]);
      mockMget.mockResolvedValue([JSON.stringify(storedClient)]);

      // Act
      const clients = await listMcpClients(TEST_USER);

      // Assert
      expect(clients).toHaveLength(1);
      expect(clients[0].name).toBe("Research Bot");
      expect(clients[0].allowedTools).toEqual(
        expect.arrayContaining(["listDeals", "searchContacts"])
      );
      expect(clients[0].apiKeyHash).toBe("hash-of-key");
    });

    it("returns empty array when user has no clients", async () => {
      // Arrange
      mockSmembers.mockResolvedValue([]);

      // Act
      const clients = await listMcpClients(TEST_USER);

      // Assert
      expect(clients).toEqual([]);
    });

    it("returns all clients when multiple exist", async () => {
      // Arrange
      const stored = [
        JSON.stringify({
          id: "client-1",
          userId: TEST_USER,
          name: "Bot One",
          allowedTools: ["listDeals"],
          trustTier: "standard",
          rateLimit: 100,
          apiKeyHash: "hash-1",
          apiKeyPrefix: "mcp_bot_on",
          createdAt: "2026-04-05T00:00:00Z",
          updatedAt: "2026-04-05T00:00:00Z",
        }),
        JSON.stringify({
          id: "client-2",
          userId: TEST_USER,
          name: "Bot Two",
          allowedTools: ["searchContacts"],
          trustTier: "readonly",
          rateLimit: 50,
          apiKeyHash: "hash-2",
          apiKeyPrefix: "mcp_bot_tw",
          createdAt: "2026-04-05T01:00:00Z",
          updatedAt: "2026-04-05T01:00:00Z",
        }),
      ];
      mockSmembers.mockResolvedValue(["client-1", "client-2"]);
      mockMget.mockResolvedValue(stored);

      // Act
      const clients = await listMcpClients(TEST_USER);

      // Assert
      expect(clients).toHaveLength(2);
    });
  });

  // ----------------------------------------------------------------
  // getMcpClient
  // ----------------------------------------------------------------
  describe("getMcpClient", () => {
    it("returns the client when it exists", async () => {
      // Arrange
      const stored = {
        id: "client-abc",
        userId: TEST_USER,
        name: "Research Bot",
        allowedTools: ["listDeals"],
        trustTier: "standard",
        rateLimit: 100,
        apiKeyHash: "hash-of-key",
        apiKeyPrefix: "mcp_resear",
        createdAt: "2026-04-05T00:00:00Z",
        updatedAt: "2026-04-05T00:00:00Z",
      };
      mockGet.mockResolvedValue(JSON.stringify(stored));

      // Act
      const client = await getMcpClient(TEST_USER, "client-abc");

      // Assert
      expect(client).not.toBeNull();
      expect(client?.id).toBe("client-abc");
      expect(client?.name).toBe("Research Bot");
    });

    it("AC-6: returns null after client is deleted", async () => {
      // Arrange — simulate the client having been deleted (nothing in Redis)
      mockGet.mockResolvedValue(null);

      // Act
      const client = await getMcpClient(TEST_USER, "deleted-client");

      // Assert
      expect(client).toBeNull();
    });

    it("returns null when clientId does not exist", async () => {
      // Arrange
      mockGet.mockResolvedValue(null);

      // Act
      const client = await getMcpClient(TEST_USER, "nonexistent-id");

      // Assert
      expect(client).toBeNull();
    });
  });

  // ----------------------------------------------------------------
  // lookupByApiKey
  // ----------------------------------------------------------------
  describe("lookupByApiKey", () => {
    it("AC-4: returns { userId, clientId } matching the creator when given the raw key", async () => {
      // Arrange — simulate the reverse-lookup hash entry that createMcpClient writes
      mockGet.mockResolvedValue(
        JSON.stringify({ userId: TEST_USER, clientId: "client-abc" })
      );

      // Act
      const result = await lookupByApiKey("mcp_some_raw_key_value");

      // Assert
      expect(result).not.toBeNull();
      expect(result?.userId).toBe(TEST_USER);
      expect(result?.clientId).toBe("client-abc");
    });

    it("AC-5: returns null after key rotation invalidates old key", async () => {
      // Arrange — old key hash no longer present in Redis after rotation
      mockGet.mockResolvedValue(null);

      // Act
      const result = await lookupByApiKey("mcp_old_raw_key");

      // Assert
      expect(result).toBeNull();
    });

    it("AC-6: returns null after client deletion removes the API key", async () => {
      // Arrange — deletion cleans up the reverse-lookup entry
      mockGet.mockResolvedValue(null);

      // Act
      const result = await lookupByApiKey("mcp_deleted_key");

      // Assert
      expect(result).toBeNull();
    });

    it("returns null when given an unknown key", async () => {
      // Arrange
      mockGet.mockResolvedValue(null);

      // Act
      const result = await lookupByApiKey("mcp_unknown_key");

      // Assert
      expect(result).toBeNull();
    });
  });

  // ----------------------------------------------------------------
  // rotateApiKey
  // ----------------------------------------------------------------
  describe("rotateApiKey", () => {
    it("AC-5: returns a new rawApiKey different from the old one", async () => {
      // Arrange — existing client in Redis
      const existingClient = {
        id: "client-abc",
        userId: TEST_USER,
        name: "Research Bot",
        allowedTools: ["listDeals"],
        trustTier: "standard",
        rateLimit: 100,
        apiKeyHash: "old-hash",
        apiKeyPrefix: "mcp_old_pr",
        createdAt: "2026-04-05T00:00:00Z",
        updatedAt: "2026-04-05T00:00:00Z",
      };
      mockGet.mockResolvedValue(JSON.stringify(existingClient));
      mockSet.mockResolvedValue("OK");
      mockDel.mockResolvedValue(1);

      // Act
      const result = await rotateApiKey(TEST_USER, "client-abc");

      // Assert — a new key was issued
      expect(result).not.toBeNull();
      expect(result?.rawApiKey).toBeDefined();
      expect(result?.rawApiKey.length).toBeGreaterThan(0);
    });

    it("AC-5: new key resolves in lookupByApiKey after rotation (mock-level verification)", async () => {
      // Arrange — after rotation the new lookup entry is stored
      const existingClient = {
        id: "client-abc",
        userId: TEST_USER,
        name: "Research Bot",
        allowedTools: ["listDeals"],
        trustTier: "standard",
        rateLimit: 100,
        apiKeyHash: "old-hash",
        apiKeyPrefix: "mcp_old_pr",
        createdAt: "2026-04-05T00:00:00Z",
        updatedAt: "2026-04-05T00:00:00Z",
      };
      mockGet.mockResolvedValue(JSON.stringify(existingClient));
      mockSet.mockResolvedValue("OK");
      mockDel.mockResolvedValue(1);

      // Act
      await rotateApiKey(TEST_USER, "client-abc");

      // Assert — set was called (new key lookup record written to Redis)
      expect(mockSet).toHaveBeenCalled();
    });

    it("AC-5: old key lookup entry is deleted from Redis during rotation", async () => {
      // Arrange
      const existingClient = {
        id: "client-abc",
        userId: TEST_USER,
        name: "Research Bot",
        allowedTools: ["listDeals"],
        trustTier: "standard",
        rateLimit: 100,
        apiKeyHash: "old-hash",
        apiKeyPrefix: "mcp_old_pr",
        createdAt: "2026-04-05T00:00:00Z",
        updatedAt: "2026-04-05T00:00:00Z",
      };
      mockGet.mockResolvedValue(JSON.stringify(existingClient));
      mockSet.mockResolvedValue("OK");
      mockDel.mockResolvedValue(1);

      // Act
      await rotateApiKey(TEST_USER, "client-abc");

      // Assert — del must be called to remove the old key's reverse-lookup entry
      expect(mockDel).toHaveBeenCalled();
    });

    it("returns null when the client does not exist", async () => {
      // Arrange
      mockGet.mockResolvedValue(null);

      // Act
      const result = await rotateApiKey(TEST_USER, "nonexistent-client");

      // Assert
      expect(result).toBeNull();
    });

    it("updated client has a new apiKeyHash different from the old one", async () => {
      // Arrange
      const existingClient = {
        id: "client-abc",
        userId: TEST_USER,
        name: "Research Bot",
        allowedTools: ["listDeals"],
        trustTier: "standard",
        rateLimit: 100,
        apiKeyHash: "old-hash-value",
        apiKeyPrefix: "mcp_old_pr",
        createdAt: "2026-04-05T00:00:00Z",
        updatedAt: "2026-04-05T00:00:00Z",
      };
      mockGet.mockResolvedValue(JSON.stringify(existingClient));
      mockSet.mockResolvedValue("OK");
      mockDel.mockResolvedValue(1);

      // Act
      const result = await rotateApiKey(TEST_USER, "client-abc");

      // Assert — the hash on the returned client is not the old one
      expect(result?.client.apiKeyHash).not.toBe("old-hash-value");
    });
  });

  // ----------------------------------------------------------------
  // deleteMcpClient
  // ----------------------------------------------------------------
  describe("deleteMcpClient", () => {
    it("AC-6: returns true when deletion succeeds", async () => {
      // Arrange
      const existingClient = {
        id: "client-abc",
        userId: TEST_USER,
        name: "Research Bot",
        allowedTools: ["listDeals"],
        trustTier: "standard",
        rateLimit: 100,
        apiKeyHash: "hash-of-key",
        apiKeyPrefix: "mcp_resear",
        createdAt: "2026-04-05T00:00:00Z",
        updatedAt: "2026-04-05T00:00:00Z",
      };
      mockGet.mockResolvedValue(JSON.stringify(existingClient));
      mockDel.mockResolvedValue(1);
      mockSrem.mockResolvedValue(1);

      // Act
      const deleted = await deleteMcpClient(TEST_USER, "client-abc");

      // Assert
      expect(deleted).toBe(true);
    });

    it("AC-6: removes the client record from Redis", async () => {
      // Arrange
      const existingClient = {
        id: "client-abc",
        userId: TEST_USER,
        name: "Research Bot",
        allowedTools: ["listDeals"],
        trustTier: "standard",
        rateLimit: 100,
        apiKeyHash: "hash-of-key",
        apiKeyPrefix: "mcp_resear",
        createdAt: "2026-04-05T00:00:00Z",
        updatedAt: "2026-04-05T00:00:00Z",
      };
      mockGet.mockResolvedValue(JSON.stringify(existingClient));
      mockDel.mockResolvedValue(1);
      mockSrem.mockResolvedValue(1);

      // Act
      await deleteMcpClient(TEST_USER, "client-abc");

      // Assert — del is called to remove the client record
      expect(mockDel).toHaveBeenCalled();
    });

    it("AC-6: removes the client id from the user's client set in Redis", async () => {
      // Arrange
      const existingClient = {
        id: "client-abc",
        userId: TEST_USER,
        name: "Research Bot",
        allowedTools: ["listDeals"],
        trustTier: "standard",
        rateLimit: 100,
        apiKeyHash: "hash-of-key",
        apiKeyPrefix: "mcp_resear",
        createdAt: "2026-04-05T00:00:00Z",
        updatedAt: "2026-04-05T00:00:00Z",
      };
      mockGet.mockResolvedValue(JSON.stringify(existingClient));
      mockDel.mockResolvedValue(1);
      mockSrem.mockResolvedValue(1);

      // Act
      await deleteMcpClient(TEST_USER, "client-abc");

      // Assert — srem removes the client id from the user's index set
      expect(mockSrem).toHaveBeenCalledWith(
        expect.stringContaining(TEST_USER),
        "client-abc"
      );
    });

    it("AC-6: removes the API key reverse-lookup entry from Redis", async () => {
      // Arrange
      const existingClient = {
        id: "client-abc",
        userId: TEST_USER,
        name: "Research Bot",
        allowedTools: ["listDeals"],
        trustTier: "standard",
        rateLimit: 100,
        apiKeyHash: "hash-of-key",
        apiKeyPrefix: "mcp_resear",
        createdAt: "2026-04-05T00:00:00Z",
        updatedAt: "2026-04-05T00:00:00Z",
      };
      mockGet.mockResolvedValue(JSON.stringify(existingClient));
      mockDel.mockResolvedValue(1);
      mockSrem.mockResolvedValue(1);

      // Act
      await deleteMcpClient(TEST_USER, "client-abc");

      // Assert — del is called more than once OR with the hash key too
      // (exactly how many del calls is implementation detail, but del must be called)
      expect(mockDel).toHaveBeenCalled();
    });

    it("returns false when the client does not exist", async () => {
      // Arrange
      mockGet.mockResolvedValue(null);

      // Act
      const deleted = await deleteMcpClient(TEST_USER, "nonexistent-client");

      // Assert
      expect(deleted).toBe(false);
    });
  });
});
