import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";
import { checkCsrf } from "@/lib/api-guard";
import { listConversations, deleteConversation } from "@/lib/data/conversations";

export async function GET() {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  const conversations = await listConversations(auth.userId, 10);
  return NextResponse.json(conversations);
}

export async function DELETE(req: Request) {
  const csrfError = checkCsrf(req);
  if (csrfError) return csrfError;

  const auth = await requireAuth();
  if (auth.error) return auth.error;

  const conversations = await listConversations(auth.userId, 100);
  await Promise.all(
    conversations.map((c) => deleteConversation(auth.userId, c.id))
  );
  return NextResponse.json({ deleted: conversations.length });
}
