import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";
import { getActions, createAction, clearAllActions } from "@/lib/data/actions";
import { checkCsrf } from "@/lib/api-guard";
import { z } from "zod";
import type { ActionStatus } from "@/lib/types/actions";
import { draftSchema } from "@/lib/schemas/action-draft";

const statusValues = [
  "pending", "approved", "dismissed", "executing", "sent", "failed",
] as const;
const statusFilterSchema = z.enum(statusValues).optional();

export async function GET(req: Request) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  const { searchParams } = new URL(req.url);
  const rawStatus = searchParams.get("status") ?? undefined;
  const statusResult = statusFilterSchema.safeParse(rawStatus);
  if (!statusResult.success) {
    return NextResponse.json({ error: "Invalid status filter" }, { status: 400 });
  }
  const filter = statusResult.data
    ? { status: statusResult.data as ActionStatus }
    : undefined;

  const actions = await getActions(auth.userId, filter);
  return NextResponse.json({ actions });
}

const createSchema = z.object({
  type: z.enum(["email", "calendar", "slack"]),
  priority: z.enum(["high", "medium", "low"]),
  dealId: z.string(),
  dealName: z.string(),
  contactName: z.string(),
  justification: z.string().max(2000),
  draft: draftSchema,
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

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid action data", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const action = await createAction(auth.userId, { ...parsed.data, status: "pending" });
  return NextResponse.json({ action }, { status: 201 });
}

export async function DELETE(req: Request) {
  const csrfError = checkCsrf(req);
  if (csrfError) return csrfError;

  const auth = await requireAuth();
  if (auth.error) return auth.error;

  const cleared = await clearAllActions(auth.userId);
  return NextResponse.json({ cleared });
}
