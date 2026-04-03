import { auth0, getUser } from "@/lib/auth0";
import { seedDemoData } from "@/lib/data/crm";
import { seedActions } from "@/lib/data/actions";
import { getRateLimiter } from "@/lib/rate-limit";
import { checkCsrf } from "@/lib/api-guard";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const csrfError = checkCsrf(req);
  if (csrfError) return csrfError;

  const session = await auth0.getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await getUser();
  if (!user?.sub) {
    return NextResponse.json(
      { error: "Invalid session: missing user ID" },
      { status: 401 }
    );
  }
  const userId = user.sub;

  const { success } = await getRateLimiter().limit(userId);
  if (!success) {
    return NextResponse.json(
      { error: "Rate limit exceeded" },
      { status: 429 }
    );
  }

  try {
    const result = await seedDemoData(userId);
    const actionCount = await seedActions(userId);
    return NextResponse.json({ success: true, ...result, actions: actionCount });
  } catch (err) {
    console.error("Seed data error:", err);
    return NextResponse.json(
      { error: "Failed to seed data" },
      { status: 500 }
    );
  }
}
