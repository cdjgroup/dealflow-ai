import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";
import { checkCsrf } from "@/lib/api-guard";
import { rotateApiKey, toClientResponse } from "@/lib/data/mcp-clients";

type RouteContext = { params: Promise<{ clientId: string }> };

export async function POST(req: Request, ctx: RouteContext) {
  const csrf = checkCsrf(req);
  if (csrf) return csrf;

  const auth = await requireAuth();
  if (auth.error) return auth.error;

  const { clientId } = await ctx.params;
  const result = await rotateApiKey(auth.userId, clientId);
  if (!result) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ client: toClientResponse(result.client), rawApiKey: result.rawApiKey });
}
