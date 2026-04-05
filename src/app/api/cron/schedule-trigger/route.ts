import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";
import { checkCsrf } from "@/lib/api-guard";
import { getActions, updateAction } from "@/lib/data/actions";
import { initiateCiba } from "@/lib/ciba/authorize";
import { storeScheduledCibaSession } from "@/lib/data/scheduled-ciba";
import type {
  SuggestedAction,
  EmailDraft,
  CalendarDraft,
  SlackDraft,
} from "@/lib/types/actions";

function sanitize(msg: string): string {
  return msg.replace(/[^\w\s+\-_.,:#]/g, "").trim().slice(0, 64);
}

export function buildActionMessage(action: SuggestedAction): string {
  const prio = action.priority === "high" ? "HIGH" : "MED";
  const draft = action.draft;

  switch (action.type) {
    case "email": {
      const d = draft as EmailDraft;
      return sanitize(`${prio}: Email ${action.contactName} - ${d.subject}`);
    }
    case "calendar": {
      const d = draft as CalendarDraft;
      return sanitize(`${prio}: Meeting ${d.title} on ${d.date}`);
    }
    case "slack": {
      const d = draft as SlackDraft;
      return sanitize(`${prio}: Slack ${d.channel} - ${action.dealName}`);
    }
    default:
      return sanitize(`${prio}: ${action.type} for ${action.dealName}`);
  }
}

/**
 * Initiate CIBA for a single action. Returns the session details.
 */
export async function initiateActionCiba(
  userId: string,
  action: SuggestedAction
): Promise<{ authReqId: string; interval: number }> {
  const now = new Date();
  const batchId = `action:${action.id}:${now.toISOString()}`;
  const msg = buildActionMessage(action);

  const cibaResult = await initiateCiba(userId, msg);

  await storeScheduledCibaSession({
    batchId,
    userId,
    authReqId: cibaResult.authReqId,
    actionIds: [action.id],
    bindingMessage: msg,
    expiresAt: new Date(
      Date.now() + cibaResult.expiresIn * 1000
    ).toISOString(),
    interval: cibaResult.interval,
    createdAt: now.toISOString(),
  });

  await updateAction(userId, action.id, { status: "ciba-pending" });

  return { authReqId: cibaResult.authReqId, interval: cibaResult.interval };
}

/**
 * On-demand trigger for sequential CIBA consent.
 * Initiates Guardian push for the FIRST high/medium-priority pending action.
 * After approval+execution, the poll-trigger initiates the next one.
 */
export async function POST(req: Request) {
  const csrfError = checkCsrf(req);
  if (csrfError) return csrfError;

  const auth = await requireAuth();
  if (auth.error) return auth.error;
  const userId = auth.userId;

  const pendingActions = await getActions(userId, { status: "pending" });
  const eligible = pendingActions.filter(
    (a) => a.priority === "high" || a.priority === "medium"
  );

  if (eligible.length === 0) {
    return NextResponse.json(
      { error: "No high/medium priority pending actions" },
      { status: 400 }
    );
  }

  const first = eligible[0];

  try {
    const result = await initiateActionCiba(userId, first);

    return NextResponse.json({
      status: "initiated",
      actionCount: 1,
      totalEligible: eligible.length,
      skippedLowPriority: pendingActions.length - eligible.length,
      action: {
        id: first.id,
        type: first.type,
        priority: first.priority,
        bindingMessage: buildActionMessage(first),
      },
      interval: result.interval,
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: errorMsg },
      { status: 502 }
    );
  }
}
