import { getRedis } from "@/lib/redis";
import { generateApiKey, hashApiKey } from "@/lib/crypto";
import { TRUST_TIER_TOOLS, MCP_SAFE_TOOLS } from "@/lib/constants/tools";
import type { McpClient, McpClientCreateInput, TrustTier } from "@/lib/types/policy";

function genId(): string {
  return crypto.randomUUID().replace(/-/g, "").substring(0, 12);
}

function now(): string {
  return new Date().toISOString();
}

function parse<T>(raw: string | null): T | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "object") return raw as T;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function clientKey(userId: string, clientId: string): string {
  return `${userId}:mcp-client:${clientId}`;
}

function clientIndexKey(userId: string): string {
  return `${userId}:mcp-clients`;
}

function apiKeyLookupKey(hash: string): string {
  return `mcp:apikey:${hash}`;
}

export async function createMcpClient(
  userId: string,
  input: McpClientCreateInput
): Promise<{ client: McpClient; rawApiKey: string }> {
  const redis = getRedis();
  const { raw, hash, prefix } = generateApiKey();
  const trustTier: TrustTier = input.trustTier ?? "standard";
  // Clamp to MCP-safe tools only — TRUST_TIER_TOOLS may include write tools
  // that aren't registered in MCP. Prevents privilege escalation if MCP surface expands.
  const rawTools = input.allowedTools ?? TRUST_TIER_TOOLS[trustTier] ?? [];
  const allowedTools = rawTools.filter((t) => MCP_SAFE_TOOLS.has(t));

  const client: McpClient = {
    id: genId(),
    userId,
    name: input.name,
    description: input.description,
    allowedTools,
    trustTier,
    rateLimit: input.rateLimit ?? 60,
    parameterConstraints: input.parameterConstraints,
    apiKeyHash: hash,
    apiKeyPrefix: prefix,
    createdAt: now(),
    updatedAt: now(),
  };

  await redis.set(clientKey(userId, client.id), JSON.stringify(client));
  await redis.set(
    apiKeyLookupKey(hash),
    JSON.stringify({ userId, clientId: client.id })
  );
  await redis.sadd(clientIndexKey(userId), client.id);

  return { client, rawApiKey: raw };
}

/** Strip apiKeyHash from client before returning to API consumers */
export function toClientResponse(client: McpClient): Omit<McpClient, "apiKeyHash"> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { apiKeyHash, ...safe } = client;
  return safe;
}

export async function getMcpClient(
  userId: string,
  clientId: string
): Promise<McpClient | null> {
  const redis = getRedis();
  const raw = await redis.get<string>(clientKey(userId, clientId));
  return parse<McpClient>(raw);
}

export async function listMcpClients(userId: string): Promise<McpClient[]> {
  const redis = getRedis();
  const ids = await redis.smembers(clientIndexKey(userId));
  if (ids.length === 0) return [];

  const keys = ids.map((id) => clientKey(userId, id));
  const raws = await redis.mget<string[]>(...keys);

  const clients: McpClient[] = [];
  for (const raw of raws) {
    const client = parse<McpClient>(raw);
    if (client) clients.push(client);
  }
  return clients;
}

export async function updateMcpClient(
  userId: string,
  clientId: string,
  data: Partial<Pick<McpClient, "name" | "description" | "allowedTools" | "trustTier" | "rateLimit" | "parameterConstraints">>
): Promise<McpClient | null> {
  const redis = getRedis();
  const existing = await getMcpClient(userId, clientId);
  if (!existing) return null;

  const updated: McpClient = {
    ...existing,
    ...data,
    updatedAt: now(),
  };

  await redis.set(clientKey(userId, clientId), JSON.stringify(updated));
  return updated;
}

export async function deleteMcpClient(
  userId: string,
  clientId: string
): Promise<boolean> {
  const redis = getRedis();
  const existing = await getMcpClient(userId, clientId);
  if (!existing) return false;

  await redis.del(clientKey(userId, clientId));
  await redis.del(apiKeyLookupKey(existing.apiKeyHash));
  await redis.srem(clientIndexKey(userId), clientId);

  return true;
}

export async function rotateApiKey(
  userId: string,
  clientId: string
): Promise<{ client: McpClient; rawApiKey: string } | null> {
  const redis = getRedis();
  const existing = await getMcpClient(userId, clientId);
  if (!existing) return null;

  const { raw, hash, prefix } = generateApiKey();

  // Store new key lookup BEFORE deleting old — brief window of both keys
  // working is safer than brief window of neither working (permanent lockout)
  await redis.set(
    apiKeyLookupKey(hash),
    JSON.stringify({ userId, clientId })
  );

  // Delete old key lookup
  await redis.del(apiKeyLookupKey(existing.apiKeyHash));

  const updated: McpClient = {
    ...existing,
    apiKeyHash: hash,
    apiKeyPrefix: prefix,
    updatedAt: now(),
  };

  await redis.set(clientKey(userId, clientId), JSON.stringify(updated));

  return { client: updated, rawApiKey: raw };
}

export async function lookupByApiKey(
  rawKey: string
): Promise<{ userId: string; clientId: string } | null> {
  const redis = getRedis();
  const hash = hashApiKey(rawKey);
  const raw = await redis.get<string>(apiKeyLookupKey(hash));
  return parse<{ userId: string; clientId: string }>(raw);
}
