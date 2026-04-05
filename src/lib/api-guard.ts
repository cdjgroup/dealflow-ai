import { NextResponse } from "next/server";

export function checkCsrf(req: Request): NextResponse | null {
  if (req.headers.get("x-requested-with") !== "XMLHttpRequest") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}

// Max number of messages in a single chat request
const MAX_MESSAGES = 100;
// Max characters per message content string
const MAX_MESSAGE_LENGTH = 10_000;

const ALLOWED_ROLES = new Set(["user", "assistant"]);

export function validateMessages(
  messages: unknown[]
): NextResponse | null {
  if (messages.length > MAX_MESSAGES) {
    return NextResponse.json(
      { error: `Too many messages (max ${MAX_MESSAGES})` },
      { status: 400 }
    );
  }

  for (const msg of messages) {
    if (typeof msg !== "object" || msg === null) continue;

    // Reject messages with disallowed roles (prevents system prompt injection)
    if ("role" in msg) {
      const role = (msg as { role: unknown }).role;
      if (typeof role === "string" && !ALLOWED_ROLES.has(role)) {
        return NextResponse.json(
          { error: `Invalid message role: "${role}"` },
          { status: 400 }
        );
      }
    }

    if ("content" in msg) {
      const content = (msg as { content: unknown }).content;
      if (typeof content === "string" && content.length > MAX_MESSAGE_LENGTH) {
        return NextResponse.json(
          { error: `Message too long (max ${MAX_MESSAGE_LENGTH} characters)` },
          { status: 400 }
        );
      }
      // Handle multi-part content arrays (AI SDK format)
      if (Array.isArray(content)) {
        let totalLength = 0;
        for (const part of content) {
          if (typeof part === "object" && part !== null && "text" in part) {
            totalLength += String((part as { text: unknown }).text).length;
          }
        }
        if (totalLength > MAX_MESSAGE_LENGTH) {
          return NextResponse.json(
            { error: `Message too long (max ${MAX_MESSAGE_LENGTH} characters)` },
            { status: 400 }
          );
        }
      }
    }
  }

  return null;
}
