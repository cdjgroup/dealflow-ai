import { NextResponse } from "next/server";
import { auth0, getUser } from "@/lib/auth0";
import { getAction, updateAction } from "@/lib/data/actions";
import { checkCsrf } from "@/lib/api-guard";
import { z } from "zod";
import { draftSchema } from "@/lib/schemas/action-draft";

const updateSchema = z.object({
  status: z.enum(["approved", "dismissed"]).optional(),
  draft: draftSchema.optional(),
}).refine((data) => data.status !== undefined || data.draft !== undefined, {
  message: "At least one of status or draft must be provided",
});

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
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

  const { id } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid update data", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const existing = await getAction(user.sub, id);
  if (!existing) {
    return NextResponse.json({ error: "Action not found" }, { status: 404 });
  }

  const updated = await updateAction(user.sub, id, parsed.data as Parameters<typeof updateAction>[2]);
  return NextResponse.json({ action: updated });
}
