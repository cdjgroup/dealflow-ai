import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";
import { pollCiba } from "@/lib/ciba/poll";
import { getSessionOwner, getSessionByAuthReqId, updateCibaSessionStatus } from "@/lib/ciba/session";
import { getPollingLimiter } from "@/lib/rate-limit";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ authReqId: string }> }
) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  const { success } = await getPollingLimiter().limit(auth.userId);
  if (!success) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  const { authReqId } = await params;
  if (!authReqId) {
    return NextResponse.json({ error: "authReqId is required" }, { status: 400 });
  }

  // O(1) ownership check via lookup index (replaces KEYS scan)
  const owner = await getSessionOwner(authReqId);
  if (!owner || owner !== auth.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const result = await pollCiba(authReqId);

    // Persist terminal statuses to Redis so the execute endpoint doesn't
    // re-poll a consumed auth_req_id (Auth0 CIBA tokens are single-use).
    if (result.status === "approved" || result.status === "denied" || result.status === "expired") {
      const session = await getSessionByAuthReqId(authReqId);
      if (session) {
        await updateCibaSessionStatus(auth.userId, session.toolName, result.status);
      }
    }

    // Never expose access tokens to the client — strip before returning
    const { accessToken: _stripped, ...safeResult } = result;
    return NextResponse.json(safeResult);
  } catch (err) {
    console.error("CIBA poll failed:", err);
    return NextResponse.json({ error: "CIBA status check failed", status: "error" }, { status: 502 });
  }
}
