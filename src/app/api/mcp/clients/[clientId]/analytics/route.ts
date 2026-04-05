import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";
import { getMcpAnalytics } from "@/lib/data/mcp-analytics";

type RouteContext = { params: Promise<{ clientId: string }> };

export async function GET(req: Request, ctx: RouteContext) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  const { clientId } = await ctx.params;
  const url = new URL(req.url);
  const rawDays = parseInt(url.searchParams.get("days") || "7", 10);
  const days = Math.min(Math.max(isNaN(rawDays) ? 7 : rawDays, 1), 90);

  const analytics = await getMcpAnalytics(auth.userId, clientId, days);
  return NextResponse.json(analytics);
}
