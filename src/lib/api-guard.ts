import { NextResponse } from "next/server";

/**
 * Validates that a POST request includes the X-Requested-With header.
 * This is a lightweight CSRF mitigation — browsers won't add custom headers
 * to cross-origin requests without a preflight, which the server won't approve.
 */
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

/**
 * Validates chat message array bounds to prevent denial-of-wallet attacks
 * (excessively large inputs driving up API costs).
 */
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
    if (typeof msg === "object" && msg !== null && "content" in msg) {
      const content = (msg as { content: unknown }).content;
      if (typeof content === "string" && content.length > MAX_MESSAGE_LENGTH) {
        return NextResponse.json(
          { error: `Message too long (max ${MAX_MESSAGE_LENGTH} characters)` },
          { status: 400 }
        );
      }
    }
  }

  return null;
}
