import { getRedis } from "@/lib/redis";
import type { ConversationMeta, StoredConversation } from "@/lib/types/conversation";

const CONVERSATION_TTL = 30 * 24 * 60 * 60; // 30 days
const MAX_STORED_MESSAGES = 100;

function threadKey(userId: string, id: string): string {
  return `${userId}:thread:${id}`;
}

function messagesKey(userId: string, id: string): string {
  return `${userId}:messages:${id}`;
}

function indexKey(userId: string): string {
  return `${userId}:threads`;
}

function titleFromMessages(messages: unknown[]): string {
  for (const msg of messages) {
    if (
      typeof msg === "object" &&
      msg !== null &&
      "role" in msg &&
      (msg as { role: string }).role === "user" &&
      "content" in msg
    ) {
      const content = (msg as { content: unknown }).content;
      if (typeof content === "string") {
        return content.length > 50 ? content.slice(0, 50) + "…" : content;
      }
    }
  }
  return "New conversation";
}

export async function saveConversation(
  userId: string,
  conversationId: string,
  messages: unknown[]
): Promise<void> {
  const redis = getRedis();
  const nowStr = new Date().toISOString();
  const nowScore = Date.now();

  // Check if meta exists for createdAt
  const existing = await redis.get<ConversationMeta>(
    threadKey(userId, conversationId)
  );

  const trimmed = messages.slice(-MAX_STORED_MESSAGES);

  const meta: ConversationMeta = {
    id: conversationId,
    title: existing?.title ?? titleFromMessages(messages),
    createdAt: existing?.createdAt ?? nowStr,
    updatedAt: nowStr,
    messageCount: trimmed.length,
  };

  const p = redis.pipeline();
  p.set(threadKey(userId, conversationId), JSON.stringify(meta), { ex: CONVERSATION_TTL });
  p.set(messagesKey(userId, conversationId), JSON.stringify(trimmed), { ex: CONVERSATION_TTL });
  p.zadd(indexKey(userId), { score: nowScore, member: conversationId });
  p.expire(indexKey(userId), CONVERSATION_TTL);
  try {
    await p.exec();
  } catch (err) {
    console.error("Conversation save pipeline failed:", err);
    throw err;
  }
}

export async function loadConversation(
  userId: string,
  conversationId: string
): Promise<StoredConversation | null> {
  const redis = getRedis();
  const meta = await redis.get<ConversationMeta>(
    threadKey(userId, conversationId)
  );
  if (!meta) return null;

  const messages = await redis.get<unknown[]>(
    messagesKey(userId, conversationId)
  );

  return {
    meta: typeof meta === "string" ? JSON.parse(meta) : meta,
    messages: Array.isArray(messages) ? messages : [],
  };
}

export async function listConversations(
  userId: string,
  limit = 20
): Promise<ConversationMeta[]> {
  const redis = getRedis();
  // Get most recent conversation IDs (highest score = most recent)
  const ids = await redis.zrange<string[]>(indexKey(userId), 0, limit - 1, {
    rev: true,
  });

  if (ids.length === 0) return [];

  const keys = ids.map((id) => threadKey(userId, id));
  const values = await redis.mget<(ConversationMeta | string | null)[]>(
    ...keys
  );

  return values
    .map((v) => {
      if (!v) return null;
      if (typeof v === "string") {
        try {
          return JSON.parse(v) as ConversationMeta;
        } catch {
          return null;
        }
      }
      return v as ConversationMeta;
    })
    .filter((m): m is ConversationMeta => m !== null);
}

export async function deleteConversation(
  userId: string,
  conversationId: string
): Promise<void> {
  const redis = getRedis();
  await redis.del(threadKey(userId, conversationId));
  await redis.del(messagesKey(userId, conversationId));
  await redis.zrem(indexKey(userId), conversationId);
}
