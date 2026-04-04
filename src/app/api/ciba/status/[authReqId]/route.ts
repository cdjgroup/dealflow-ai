import { NextResponse } from "next/server";
import { auth0, getUser } from "@/lib/auth0";
import { pollCiba } from "@/lib/ciba/poll";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ authReqId: string }> }
) {
  const session = await auth0.getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const user = await getUser();
  if (!user?.sub) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { authReqId } = await params;
  if (!authReqId) {
    return NextResponse.json({ error: "authReqId is required" }, { status: 400 });
  }

  try {
    const result = await pollCiba(authReqId);
    // Never expose access tokens to the client — strip before returning
    const { accessToken: _stripped, ...safeResult } = result;
    return NextResponse.json(safeResult);
  } catch (err) {
    console.error("CIBA poll failed:", err);
    return NextResponse.json({ error: "CIBA status check failed", status: "error" }, { status: 502 });
  }
}
