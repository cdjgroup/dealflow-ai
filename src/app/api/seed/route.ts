import { requireAuth } from "@/lib/auth-guard";
import { seedDemoData } from "@/lib/data/crm";
import { getRateLimiter } from "@/lib/rate-limit";
import { checkCsrf } from "@/lib/api-guard";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const csrfError = checkCsrf(req);
  if (csrfError) return csrfError;

  const auth = await requireAuth();
  if (auth.error) return auth.error;

  const { success } = await getRateLimiter().limit(auth.userId);
  if (!success) {
    return NextResponse.json(
      { error: "Rate limit exceeded" },
      { status: 429 }
    );
  }

  try {
    const result = await seedDemoData(auth.userId);
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    console.error("Seed data error:", err);
    return NextResponse.json(
      { error: "Failed to seed data" },
      { status: 500 }
    );
  }
}
