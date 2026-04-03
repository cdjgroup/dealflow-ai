import { NextResponse } from "next/server";
import { auth0, getUser } from "@/lib/auth0";
import { getActions, createAction } from "@/lib/data/actions";
import { checkCsrf } from "@/lib/api-guard";
import { z } from "zod";
import type { ActionDraft, ActionStatus } from "@/lib/types/actions";

export async function GET(req: Request) {
  const session = await auth0.getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const user = await getUser();
  if (!user?.sub) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") as ActionStatus | null;
  const filter = status ? { status } : undefined;

  const actions = await getActions(user.sub, filter);
  return NextResponse.json({ actions });
}

const createSchema = z.object({
  type: z.enum(["email", "calendar", "slack"]),
  status: z.enum(["pending", "approved", "dismissed", "executing", "sent", "failed"]),
  priority: z.enum(["high", "medium", "low"]),
  dealId: z.string(),
  dealName: z.string(),
  contactName: z.string(),
  justification: z.string(),
  draft: z.record(z.string(), z.unknown()).transform((v) => v as unknown as ActionDraft),
});

export async function POST(req: Request) {
  const csrfError = checkCsrf(req);
  if (csrfError) return csrfError;

  const session = await auth0.getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const user = await getUser();
  if (!user?.sub) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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

  const action = await createAction(user.sub, parsed.data);
  return NextResponse.json({ action }, { status: 201 });
}
