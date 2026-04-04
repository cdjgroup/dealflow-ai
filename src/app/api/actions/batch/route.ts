import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";
import { batchUpdateStatus } from "@/lib/data/actions";
import { checkCsrf } from "@/lib/api-guard";
import { z } from "zod";

const batchSchema = z.object({
  actionIds: z.array(z.string()).min(1).max(50),
  status: z.enum(["approved", "dismissed"]),
});

export async function POST(req: Request) {
  const csrfError = checkCsrf(req);
  if (csrfError) return csrfError;

  const auth = await requireAuth();
  if (auth.error) return auth.error;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = batchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid batch data", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const actions = await batchUpdateStatus(
    auth.userId,
    parsed.data.actionIds,
    parsed.data.status
  );
  return NextResponse.json({ actions });
}
