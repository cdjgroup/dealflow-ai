import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";
import { checkCsrf } from "@/lib/api-guard";
import { getActions, batchUpdateStatus, updateAction } from "@/lib/data/actions";
import { getUserSettings } from "@/lib/data/settings";
import { initiateCiba } from "@/lib/ciba/authorize";
import { storeScheduledCibaSession } from "@/lib/data/scheduled-ciba";
import { getDeal } from "@/lib/data/crm";
import { getScheduleRefreshToken } from "@/lib/data/schedule-tokens";
import { exchangeTokenWithRefresh } from "@/lib/token-exchange";
import { executeActionWithToken } from "@/lib/actions/executor";
import { writeAuditEntry } from "@/lib/data/audit";
import type { SuggestedAction } from "@/lib/types/actions";

const HIGH_VALUE_THRESHOLD = 50_000;

const CONNECTION_MAP: Record<string, string> = {
  email: "google-oauth2",
  calendar: "google-oauth2",
  slack: "sign-in-with-slack",
};

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
 * On-demand trigger for batch action execution.
 * Behavior varies by autonomy level:
 * - Level 1 & 2: CIBA consent required (Guardian push)
 * - Level 3: Routine actions (<$50K) execute directly; high-value get CIBA
 */
export async function POST(req: Request) {
  const csrfError = checkCsrf(req);
  if (csrfError) return csrfError;

  const auth = await requireAuth();
  if (auth.error) return auth.error;
  const userId = auth.userId;

  const settings = await getUserSettings(userId);

  // Level 2+ actions are auto-approved; level 1 are pending
  const targetStatus = settings.autonomyLevel >= 2 ? "approved" : "pending";
  const allActions = await getActions(userId, { status: targetStatus });
  const eligible = allActions.filter(
    (a) => a.priority === "high" || a.priority === "medium"
  );

  if (eligible.length === 0) {
    return NextResponse.json(
      { error: "No high/medium priority actions available" },
      { status: 400 }
    );
  }

  const now = new Date();
  const batchId = `manual:${now.toISOString()}`;

  // Level 3: partition by deal value — routine auto-execute, high-value get CIBA
  if (settings.autonomyLevel === 3) {
    const routineActions: SuggestedAction[] = [];
    const highValueActions: SuggestedAction[] = [];

    for (const action of eligible) {
      const deal = action.dealId ? await getDeal(userId, action.dealId) : null;
      const dealValue = deal?.value ?? 0;
      if (dealValue > HIGH_VALUE_THRESHOLD) {
        highValueActions.push(action);
      } else {
        routineActions.push(action);
      }
    }

    let executed = 0;
    let failed = 0;

    // Auto-execute routine actions directly
    if (routineActions.length > 0) {
      const refreshToken = await getScheduleRefreshToken(userId);
      if (!refreshToken) {
        await batchUpdateStatus(userId, routineActions.map((a) => a.id), "failed");
        failed += routineActions.length;
      } else {
        for (const action of routineActions) {
          await updateAction(userId, action.id, { status: "executing" });
          try {
            const connection = CONNECTION_MAP[action.type];
            const result = await exchangeTokenWithRefresh(connection, refreshToken);
            if ("error" in result) throw new Error(`Token exchange failed for ${action.type}`);
            await executeActionWithToken(action, result.token);
            await updateAction(userId, action.id, { status: "sent" });
            executed++;

            writeAuditEntry(userId, {
              threadId: `auto:${batchId}`,
              toolName: `action:${action.type}`,
              input: action.draft as unknown as Record<string, unknown>,
              result: "success",
              durationMs: 0,
            }).catch(() => {});
          } catch (err) {
            const errorMessage = err instanceof Error ? err.message : "Execution failed";
            await updateAction(userId, action.id, { status: "failed", errorMessage });
            failed++;
          }
        }
      }
    }

    // High-value actions still need CIBA
    if (highValueActions.length > 0) {
      const actionIds = highValueActions.map((a) => a.id);
      const msg = buildBatchMessage(highValueActions);

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
          status: "partial",
          executed,
          failed,
          cibaRequired: highValueActions.length,
          bindingMessage: msg,
          interval: cibaResult.interval,
        });
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        return NextResponse.json({ error: errorMsg }, { status: 502 });
      }
    }

    return NextResponse.json({
      status: "auto-executed",
      executed,
      failed,
      actionCount: routineActions.length,
    });
  }

  // Level 1 & 2: standard CIBA flow
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
      skippedLowPriority: allActions.length - eligible.length,
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
