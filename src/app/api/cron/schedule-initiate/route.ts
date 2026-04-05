import { NextResponse } from "next/server";
import {
  getUsersForScheduleHour,
  getUserSettings,
} from "@/lib/data/settings";
import { getActions, batchUpdateStatus } from "@/lib/data/actions";
import { initiateCiba } from "@/lib/ciba/authorize";
import {
  storeScheduledCibaSession,
  getScheduledCibaSession,
} from "@/lib/data/scheduled-ciba";
import { verifyCronSecret } from "@/lib/cron-auth";
import type { SuggestedAction } from "@/lib/types/actions";

const MAX_USERS_PER_HOUR = 50;

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

function sanitizeBindingMessage(msg: string): string {
  return msg.replace(/[^\w\s+\-_.,:#]/g, "").trim().slice(0, 64);
}

function buildBindingMessage(actions: SuggestedAction[]): string {
  const counts: Record<string, number> = {};
  for (const a of actions) {
    counts[a.type] = (counts[a.type] || 0) + 1;
  }
  const parts = Object.entries(counts)
    .map(([type, count]) => `${count} ${type}`)
    .join(", ");
  return sanitizeBindingMessage(`DealFlow: run ${actions.length} actions - ${parts}`);
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

      const pendingActions = await getActions(userId, { status: "pending" });
      if (pendingActions.length === 0) {
        results.push({ userId, status: "skipped-no-actions" });
        continue;
      }

      // AC-13: Idempotency — skip if session already exists for this batch window
      const existing = await getScheduledCibaSession(userId, batchId);
      if (existing) {
        results.push({ userId, status: "skipped-existing-session" });
        continue;
      }

      const actionIds = pendingActions.map((a) => a.id);
      const msg = buildBindingMessage(pendingActions);

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
          actionCount: actionIds.length,
        });
      } catch (err) {
        console.error(`CIBA initiation failed for ${userId}:`, err);
        results.push({ userId, status: "error" });
      }
    }
  }

  return NextResponse.json({ batchId, results });
}
