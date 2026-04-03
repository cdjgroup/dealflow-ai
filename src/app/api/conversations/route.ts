import { NextResponse } from "next/server";
import { auth0, getUser } from "@/lib/auth0";
import { checkCsrf } from "@/lib/api-guard";
import { listConversations, deleteConversation } from "@/lib/data/conversations";

export async function GET() {
  const session = await auth0.getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const user = await getUser();
  if (!user?.sub) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const conversations = await listConversations(user.sub, 10);
  return NextResponse.json(conversations);
}

export async function DELETE(req: Request) {
  const csrfError = checkCsrf(req);
  if (csrfError) return csrfError;

  const session = await auth0.getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const user = await getUser();
  if (!user?.sub) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const conversations = await listConversations(user.sub, 100);
  await Promise.all(
    conversations.map((c) => deleteConversation(user.sub!, c.id))
  );
  return NextResponse.json({ deleted: conversations.length });
}
