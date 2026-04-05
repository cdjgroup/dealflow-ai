import { NextResponse } from "next/server";
import {
  getUsersForScheduleHour,
  getUserSettings,
} from "@/lib/data/settings";
import { getActions, batchUpdateStatus, updateAction } from "@/lib/data/actions";
import { initiateCiba } from "@/lib/ciba/authorize";
import {
  storeScheduledCibaSession,
  getScheduledCibaSession,
} from "@/lib/data/scheduled-ciba";
import { verifyCronSecret } from "@/lib/cron-auth";
import { getDeal } from "@/lib/data/crm";
import { getScheduleRefreshToken } from "@/lib/data/schedule-tokens";
import { exchangeTokenWithRefresh } from "@/lib/token-exchange";
import { executeActionWithToken } from "@/lib/actions/executor";
import { writeAuditEntry } from "@/lib/data/audit";
import { isConnectionDisabled } from "@/lib/data/connections";
import type { SuggestedAction } from "@/lib/types/actions";

const CAPABILITY_MAP: Record<string, "gmail" | "calendar" | "slack"> = {
  email: "gmail",
  calendar: "calendar",
  slack: "slack",
};

const MAX_USERS_PER_HOUR = 50;
const HIGH_VALUE_THRESHOLD = 50_000;

const CONNECTION_MAP: Record<string, string> = {
  email: "google-oauth2",
  calendar: "google-oauth2",
  slack: "sign-in-with-slack",
};

function getHourInTimezone(date: Date, timezone: string): number {
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      hour12: false,
      timeZone: timezone,
    });
    return parseInt(formatter.format(date), 10);
  } catch {
    return -1; // Invalid timezone — no match
  }
}

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

async function executeActionsDirectly(
  userId: string,
  actions: SuggestedAction[],
  settings: { capabilities: Record<string, boolean> },
  batchId: string
): Promise<{ executed: number; failed: number }> {
  const refreshToken = await getScheduleRefreshToken(userId);
  if (!refreshToken) {
    await batchUpdateStatus(userId, actions.map((a) => a.id), "failed");
    return { executed: 0, failed: actions.length };
  }

  let executed = 0;
  let failed = 0;

  for (const action of actions) {
    // Respect user capability toggles and connection state
    const capability = CAPABILITY_MAP[action.type];
    if (capability && !settings.capabilities[capability]) {
      await updateAction(userId, action.id, { status: "failed", errorMessage: `${capability} capability is disabled` });
      failed++;
      continue;
    }

    const connection = CONNECTION_MAP[action.type];
    const disabled = await isConnectionDisabled(userId, connection);
    if (disabled) {
      await updateAction(userId, action.id, { status: "failed", errorMessage: "Connection disabled by user" });
      failed++;
      continue;
    }

    await updateAction(userId, action.id, { status: "executing" });

    try {
      const result = await exchangeTokenWithRefresh(connection, refreshToken);
      if ("error" in result) {
        throw new Error(`Token exchange failed for ${action.type}`);
      }
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

      writeAuditEntry(userId, {
        threadId: `auto:${batchId}`,
        toolName: `action:${action.type}`,
        input: action.draft as unknown as Record<string, unknown>,
        result: "error",
        durationMs: 0,
      }).catch(() => {});
    }
  }

  return { executed, failed };
}

export async function GET(req: Request) {
  if (!verifyCronSecret(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const batchId = `${now.toISOString().slice(0, 13)}:00:00.000Z`;
  const results: Array<{
    userId: string;
    status: string;
    actionCount?: number;
    executed?: number;
    failed?: number;
  }> = [];

  for (const targetHour of [8, 12, 17]) {
    const allUserIds = await getUsersForScheduleHour(targetHour);
    const userIds = allUserIds.slice(0, MAX_USERS_PER_HOUR);

    for (const userId of userIds) {
      const settings = await getUserSettings(userId);
      if (!settings.schedule?.enabled) continue;

      const userLocalHour = getHourInTimezone(now, settings.schedule.timezone);
      if (userLocalHour !== targetHour) {
        results.push({ userId, status: "skipped-wrong-hour" });
        continue;
      }

      // Level 2+ actions are auto-approved at creation; level 1 are pending
      const targetStatus = settings.autonomyLevel >= 2 ? "approved" : "pending";
      const allActions = await getActions(userId, { status: targetStatus });
      // Filter by priority AND confidence — low-confidence actions stay for manual review
      const requireReview = settings.confidenceThresholds?.requireReview ?? 0.5;
      const eligible = allActions.filter(
        (a) =>
          (a.priority === "high" || a.priority === "medium") &&
          (a.confidence === undefined || a.confidence > requireReview)
      );

      if (eligible.length === 0) {
        results.push({ userId, status: "skipped-no-eligible-actions" });
        continue;
      }

      // Idempotency — skip if session already exists for this batch window
      const existing = await getScheduledCibaSession(userId, batchId);
      if (existing) {
        results.push({ userId, status: "skipped-existing-session" });
        continue;
      }

      // Level 3: partition by deal value — routine actions auto-execute, high-value get CIBA
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

        // Auto-execute routine actions directly (no CIBA)
        if (routineActions.length > 0) {
          const execResult = await executeActionsDirectly(userId, routineActions, settings, batchId);
          results.push({
            userId,
            status: "auto-executed",
            actionCount: routineActions.length,
            executed: execResult.executed,
            failed: execResult.failed,
          });
        }

        // High-value actions still require CIBA
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

            results.push({
              userId,
              status: "initiated",
              actionCount: highValueActions.length,
            });
          } catch (err) {
            console.error(`CIBA initiation failed for ${userId}:`, err);
            results.push({ userId, status: "error" });
          }
        }

        continue; // Done with level 3 user
      }

      // Level 1 & 2: standard CIBA flow for all eligible actions
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

        results.push({
          userId,
          status: "initiated",
          actionCount: eligible.length,
        });
      } catch (err) {
        console.error(`CIBA initiation failed for ${userId}:`, err);
        results.push({ userId, status: "error" });
      }
    }
  }

  return NextResponse.json({ batchId, results });
}
