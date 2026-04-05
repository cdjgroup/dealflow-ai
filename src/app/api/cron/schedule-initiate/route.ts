import { NextResponse } from "next/server";
import {
  getUsersForScheduleHour,
  getUserSettings,
} from "@/lib/data/settings";
import { getActions, updateAction } from "@/lib/data/actions";
import { initiateCiba } from "@/lib/ciba/authorize";
import { storeScheduledCibaSession } from "@/lib/data/scheduled-ciba";
import { verifyCronSecret } from "@/lib/cron-auth";
import type {
  SuggestedAction,
  EmailDraft,
  CalendarDraft,
  SlackDraft,
} from "@/lib/types/actions";

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

export async function GET(req: Request) {
  if (!verifyCronSecret(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
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
      const eligible = pendingActions.filter(
        (a) => a.priority === "high" || a.priority === "medium"
      );

      if (eligible.length === 0) {
        results.push({ userId, status: "skipped-no-eligible-actions" });
        continue;
      }

      let initiated = 0;
      for (const action of eligible) {
        const batchId = `cron:${action.id}:${now.toISOString()}`;
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
          initiated++;
        } catch (err) {
          console.error(
            `CIBA initiation failed for action ${action.id} (user ${userId}):`,
            err
          );
        }
      }

      results.push({
        userId,
        status: initiated > 0 ? "initiated" : "error",
        actionCount: initiated,
      });
    }
  }

  return NextResponse.json({ results });
}
