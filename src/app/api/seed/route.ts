import { auth0, getUser } from "@/lib/auth0";
import { seedDemoData } from "@/lib/data/crm";
import { getRateLimiter } from "@/lib/rate-limit";
import { NextResponse } from "next/server";

export async function POST() {
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

  const limiter = getRateLimiter();
  if (limiter) {
    const { success } = await limiter.limit(userId);
    if (!success) {
      return NextResponse.json(
        { error: "Rate limit exceeded" },
        { status: 429 }
      );
    }
  }

  try {
    await seedDemoData(userId);
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to seed data", details: String(err) },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    deals: 4,
    contacts: 4,
    activities: 5,
  });
}
