import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";
import { checkCsrf } from "@/lib/api-guard";
import { getActions, batchUpdateStatus } from "@/lib/data/actions";
import { initiateCiba } from "@/lib/ciba/authorize";
import {
  storeScheduledCibaSession,
  getScheduledCibaSession,
} from "@/lib/data/scheduled-ciba";

function sanitizeBindingMessage(msg: string): string {
  return msg.replace(/[^\w\s+\-_.,:#]/g, "").trim().slice(0, 64);
}

/**
 * On-demand trigger for the scheduled CIBA flow.
 * Initiates a Guardian push for all pending actions — same as the cron
 * but callable from the UI without waiting for the next scheduled hour.
 */
export async function POST(req: Request) {
  const csrfError = checkCsrf(req);
  if (csrfError) return csrfError;

  const auth = await requireAuth();
  if (auth.error) return auth.error;
  const userId = auth.userId;

  const pendingActions = await getActions(userId, { status: "pending" });
  if (pendingActions.length === 0) {
    return NextResponse.json(
      { error: "No pending actions to execute" },
      { status: 400 }
    );
  }

  const now = new Date();
  const batchId = `manual:${now.toISOString()}`;

  // Idempotency — don't re-initiate if a session already exists
  const existing = await getScheduledCibaSession(userId, batchId);
  if (existing) {
    return NextResponse.json({ status: "already-initiated", batchId });
  }

  const actionIds = pendingActions.map((a) => a.id);
  const msg = sanitizeBindingMessage(
    `Execute ${pendingActions.length} pending actions?`
  );

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
    batchId,
    actionCount: actionIds.length,
    authReqId: cibaResult.authReqId,
    expiresIn: cibaResult.expiresIn,
  });
}
