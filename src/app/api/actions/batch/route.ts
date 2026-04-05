import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";
import { getAction, batchUpdateStatus } from "@/lib/data/actions";
import { getUserSettings, incrementTrustStat } from "@/lib/data/settings";
import { checkCsrf } from "@/lib/api-guard";
import { z } from "zod";
import type { ActionType } from "@/lib/types/actions";

const ACTION_CAPABILITY_MAP: Record<ActionType, { tool: string; capability: "gmail" | "calendar" | "slack" }> = {
  email: { tool: "draftEmail", capability: "gmail" },
  calendar: { tool: "checkCalendar", capability: "calendar" },
  slack: { tool: "sendSlackMessage", capability: "slack" },
};

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

  // For approvals, filter out actions blocked by capability/trust settings
  let allowedIds = parsed.data.actionIds;
  if (parsed.data.status === "approved") {
    const settings = await getUserSettings(auth.userId);
    const checked = await Promise.all(
      parsed.data.actionIds.map(async (id) => {
        const action = await getAction(auth.userId, id);
        if (!action) return null;
        const mapping = ACTION_CAPABILITY_MAP[action.type];
        if (!settings.capabilities[mapping.capability]) return null;
        if (settings.toolTrust?.[mapping.tool] === "never") return null;
        return id;
      })
    );
    allowedIds = checked.filter((id): id is string => id !== null);
  }

  if (allowedIds.length === 0) {
    return NextResponse.json(
      { error: "No actions could be approved — check your capability and trust settings." },
      { status: 403 }
    );
  }

  const actions = await batchUpdateStatus(
    auth.userId,
    allowedIds,
    parsed.data.status
  );

  // Track trust calibration stats per action type
  for (const action of actions) {
    incrementTrustStat(auth.userId, action.type, parsed.data.status).catch(() => {});
  }

  return NextResponse.json({ actions });
}
