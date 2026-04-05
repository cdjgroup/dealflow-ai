import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";
import { getAction, updateAction } from "@/lib/data/actions";
import { getUserSettings, incrementTrustStat, getTrustStats } from "@/lib/data/settings";
import { checkCsrf } from "@/lib/api-guard";
import { z } from "zod";
import { draftSchema } from "@/lib/schemas/action-draft";
import type { ActionType } from "@/lib/types/actions";
import { evaluateTrustGraduation, type TrustNudge } from "@/lib/trust-graduation";

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

  const auth = await requireAuth();
  if (auth.error) return auth.error;

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

  const existing = await getAction(auth.userId, id);
  if (!existing) {
    return NextResponse.json({ error: "Action not found" }, { status: 404 });
  }

  const settings = await getUserSettings(auth.userId);
  const mapping = ACTION_CAPABILITY_MAP[existing.type];

  // Block approval if capability is disabled or trust is "never"
  if (parsed.data.status === "approved") {
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

  const updated = await updateAction(auth.userId, id, parsed.data as Parameters<typeof updateAction>[2]);

  // Track trust calibration + evaluate nudge (upgrade-only, best-effort)
  let nudge: TrustNudge | undefined;
  if (parsed.data.status === "approved") {
    try {
      await incrementTrustStat(auth.userId, existing.type, parsed.data.status);
      const stats = await getTrustStats(auth.userId);
      const currentTrust = settings.toolTrust?.[mapping.tool] ?? "ask";
      const suggested = evaluateTrustGraduation(stats[existing.type], currentTrust);
      if (suggested) {
        nudge = { tool: mapping.tool, actionType: existing.type, currentTrust, suggestedTrust: suggested, stats: stats[existing.type] };
      }
    } catch {
      // Graduation is best-effort — don't break the approve flow
    }
  } else if (parsed.data.status === "dismissed") {
    // Best-effort stat tracking; failures are non-critical
    incrementTrustStat(auth.userId, existing.type, parsed.data.status).catch(() => {});
  }

  return NextResponse.json({ action: updated, ...(nudge ? { nudge } : {}) });
}
