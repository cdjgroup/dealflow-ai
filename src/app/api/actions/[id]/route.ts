import { NextResponse } from "next/server";
import { auth0, getUser } from "@/lib/auth0";
import { getAction, updateAction } from "@/lib/data/actions";
import { getUserSettings } from "@/lib/data/settings";
import { checkCsrf } from "@/lib/api-guard";
import { z } from "zod";
import { draftSchema } from "@/lib/schemas/action-draft";
import type { ActionType } from "@/lib/types/actions";

const ACTION_CAPABILITY_MAP: Record<ActionType, { tool: string; capability: "gmail" | "calendar" | "slack" }> = {
  email: { tool: "draftEmail", capability: "gmail" },
  calendar: { tool: "checkCalendar", capability: "calendar" },
  slack: { tool: "sendSlackMessage", capability: "slack" },
};

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

  // Block approval if capability is disabled or trust is "never"
  if (parsed.data.status === "approved") {
    const settings = await getUserSettings(user.sub);
    const mapping = ACTION_CAPABILITY_MAP[existing.type];
    if (!settings.capabilities[mapping.capability]) {
      return NextResponse.json(
        { error: `Cannot approve: ${mapping.capability} is disabled. Enable it in Permissions.` },
        { status: 403 }
      );
    }
    if (settings.toolTrust?.[mapping.tool] === "never") {
      return NextResponse.json(
        { error: `Cannot approve: ${mapping.tool} is blocked by your trust settings.` },
        { status: 403 }
      );
    }
  }

  const updated = await updateAction(user.sub, id, parsed.data as Parameters<typeof updateAction>[2]);
  return NextResponse.json({ action: updated });
}
