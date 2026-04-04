import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";
import { pollCiba } from "@/lib/ciba/poll";
import { getRedis } from "@/lib/redis";
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

  // Verify the requesting user owns this CIBA session
  const redis = getRedis();
  const keys = await redis.keys(`ciba:${auth.userId}:*`);
  let ownsSession = false;
  for (const key of keys) {
    const raw = await redis.get<string>(key);
    if (!raw) continue;
    try {
      const session = typeof raw === "string" ? JSON.parse(raw) : raw;
      if (session.authReqId === authReqId) {
        ownsSession = true;
        break;
      }
    } catch {
      continue;
    }
  }
  if (!ownsSession) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
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
