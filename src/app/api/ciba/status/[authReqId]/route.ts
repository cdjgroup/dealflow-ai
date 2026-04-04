import { NextResponse } from "next/server";
import { auth0 } from "@/lib/auth0";
import { pollCiba } from "@/lib/ciba/poll";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ authReqId: string }> }
) {
  const session = await auth0.getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { authReqId } = await params;
  if (!authReqId) {
    return NextResponse.json({ error: "authReqId is required" }, { status: 400 });
  }

  try {
    const result = await pollCiba(authReqId);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "CIBA poll failed";
    return NextResponse.json({ error: message, status: "error" }, { status: 502 });
  }
}
