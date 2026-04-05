import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";
import { checkCsrf } from "@/lib/api-guard";
import { getActions, batchUpdateStatus } from "@/lib/data/actions";
import { initiateCiba } from "@/lib/ciba/authorize";
import { storeScheduledCibaSession } from "@/lib/data/scheduled-ciba";
import type { SuggestedAction } from "@/lib/types/actions";

function sanitize(msg: string): string {
  return msg.replace(/[^\w\s+\-_.,:#]/g, "").trim().slice(0, 64);
}

function buildBatchMessage(actions: SuggestedAction[]): string {
  const counts: Record<string, number> = {};
  for (const a of actions) {
    counts[a.type] = (counts[a.type] || 0) + 1;
  }
  const parts = Object.entries(counts)
    .map(([type, count]) => `${count} ${type}`)
    .join(", ");
  return sanitize(`DealFlow: ${actions.length} actions - ${parts}`);
}

/**
 * On-demand trigger for batch CIBA consent.
 * Sends ONE Guardian push for all high/medium-priority pending actions.
 * Approval grants a time-boxed execution window.
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
  const batchId = `manual:${now.toISOString()}`;
  const actionIds = eligible.map((a) => a.id);
  const msg = buildBatchMessage(eligible);

  try {
    const cibaResult = await initiateCiba(userId, msg);

    await storeScheduledCibaSession({
      batchId,
      userId,
      authReqId: cibaResult.authReqId,
      actionIds,
      bindingMessage: msg,
      expiresAt: new Date(
        Date.now() + cibaResult.expiresIn * 1000
      ).toISOString(),
      interval: cibaResult.interval,
      createdAt: now.toISOString(),
    });

    await batchUpdateStatus(userId, actionIds, "ciba-pending");

    return NextResponse.json({
      status: "initiated",
      actionCount: eligible.length,
      skippedLowPriority: pendingActions.length - eligible.length,
      bindingMessage: msg,
      interval: cibaResult.interval,
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: errorMsg },
      { status: 502 }
    );
  }
}
