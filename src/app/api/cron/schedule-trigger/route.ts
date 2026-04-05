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
  return msg.replace(/[^\w\s+\-_.,:#@]/g, "").trim().slice(0, 64);
}

function buildActionMessage(action: SuggestedAction): string {
  const prio = action.priority === "high" ? "HIGH" : "MED";
  const draft = action.draft;

  switch (action.type) {
    case "email": {
      const d = draft as EmailDraft;
      return sanitize(`${prio}: Email ${d.to} - ${d.subject}`);
    }
    case "calendar": {
      const d = draft as CalendarDraft;
      return sanitize(`${prio}: Meeting ${d.title} on ${d.date}`);
    }
    case "slack": {
      const d = draft as SlackDraft;
      return sanitize(`${prio}: Slack #${d.channel} - ${d.message}`);
    }
    default:
      return sanitize(`${prio}: ${action.type} for ${action.dealName}`);
  }
}

/**
 * On-demand trigger for per-action CIBA consent.
 * Sends one Guardian push per high/medium-priority pending action,
 * each with a descriptive binding message.
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

  const now = new Date();
  const results: Array<{
    actionId: string;
    type: string;
    priority: string;
    status: string;
    authReqId?: string;
    bindingMessage?: string;
  }> = [];

  for (const action of eligible) {
    const batchId = `action:${action.id}:${now.toISOString()}`;
    const msg = buildActionMessage(action);

    try {
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

      results.push({
        actionId: action.id,
        type: action.type,
        priority: action.priority,
        status: "initiated",
        authReqId: cibaResult.authReqId,
        bindingMessage: msg,
      });
    } catch (err) {
      console.error(`CIBA initiation failed for action ${action.id}:`, err);
      results.push({
        actionId: action.id,
        type: action.type,
        priority: action.priority,
        status: "error",
      });
    }
  }

  const initiated = results.filter((r) => r.status === "initiated");
  return NextResponse.json({
    status: "initiated",
    actionCount: initiated.length,
    skippedLowPriority: pendingActions.length - eligible.length,
    results,
    interval: 5,
  });
}
