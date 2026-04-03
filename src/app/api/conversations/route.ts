import { NextResponse } from "next/server";
import { auth0, getUser } from "@/lib/auth0";
import { listConversations } from "@/lib/data/conversations";

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
