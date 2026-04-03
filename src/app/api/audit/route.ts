import { NextResponse } from "next/server";
import { auth0, getUser } from "@/lib/auth0";
import { getAuditLog } from "@/lib/data/audit";

export async function GET(req: Request) {
  const session = await auth0.getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const user = await getUser();
  if (!user?.sub) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const rawLimit = parseInt(url.searchParams.get("limit") || "50", 10);
  const limit = isNaN(rawLimit) || rawLimit < 1 ? 50 : Math.min(rawLimit, 200);

  const log = await getAuditLog(user.sub, { limit });
  return NextResponse.json(log);
}
