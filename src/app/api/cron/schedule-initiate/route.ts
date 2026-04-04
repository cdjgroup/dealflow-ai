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

function verifyCronSecret(req: Request): boolean {
  return (
    req.headers.get("authorization") ===
    `Bearer ${process.env.CRON_SECRET}`
  );
}

function getHourInTimezone(date: Date, timezone: string): number {
  const formatter = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    hour12: false,
    timeZone: timezone,
  });
  return parseInt(formatter.format(date), 10);
}

function sanitizeBindingMessage(msg: string): string {
  return msg.replace(/[^\w\s+\-_.,:#]/g, "").trim().slice(0, 64);
}

export async function GET(req: Request) {
  if (!verifyCronSecret(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const batchId = now.toISOString();
  const results: Array<{
    userId: string;
    status: string;
    actionCount?: number;
  }> = [];

  for (const targetHour of [8, 12, 17]) {
    const userIds = await getUsersForScheduleHour(targetHour);

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
      const hourKey = `${now.toISOString().slice(0, 13)}:00:00.000Z`;
      const existing = await getScheduledCibaSession(userId, hourKey);
      if (existing) {
        results.push({ userId, status: "skipped-existing-session" });
        continue;
      }

      const actionIds = pendingActions.map((a) => a.id);
      const msg = sanitizeBindingMessage(
        `Execute ${pendingActions.length} pending actions?`
      );

      try {
        const cibaResult = await initiateCiba(userId, msg);

        await storeScheduledCibaSession({
          batchId: hourKey,
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
