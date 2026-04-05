import { NextResponse } from "next/server";
import {
  getAllActiveScheduledSessions,
  removeScheduledCibaSession,
} from "@/lib/data/scheduled-ciba";
import { pollCiba } from "@/lib/ciba/poll";
import {
  getAction,
  updateAction,
  batchUpdateStatus,
} from "@/lib/data/actions";
import { getScheduleRefreshToken } from "@/lib/data/schedule-tokens";
import { exchangeTokenWithRefresh } from "@/lib/token-exchange";
import { executeActionWithToken } from "@/lib/actions/executor";
import { writeAuditEntry } from "@/lib/data/audit";
import { verifyCronSecret } from "@/lib/cron-auth";
import { getRedis } from "@/lib/redis";
import type { SuggestedAction } from "@/lib/types/actions";

const CONNECTION_MAP: Record<string, string> = {
  email: "google-oauth2",
  calendar: "google-oauth2",
  slack: "sign-in-with-slack",
};

async function getTokenForAction(
  action: SuggestedAction,
  refreshToken: string
): Promise<string> {
  const connection = CONNECTION_MAP[action.type];
  const result = await exchangeTokenWithRefresh(connection, refreshToken);
  if ("error" in result) {
    console.error(`Token exchange failed for connection ${connection}:`, result.error);
    throw new Error(
      `Could not obtain ${action.type} access token. Re-enable the connection in Permissions.`
    );
  }
  return result.token;
}

/**
 * Claim exclusive execution of a batch using Redis SET NX.
 * Prevents duplicate execution from overlapping cron invocations.
 */
async function claimExecution(
  userId: string,
  batchId: string
): Promise<boolean> {
  const redis = getRedis();
  const result = await redis.set(
    `ciba:executing:${userId}:${batchId}`,
    "1",
    { ex: 120, nx: true }
  );
  return result === "OK";
}

export async function GET(req: Request) {
  if (!verifyCronSecret(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sessions = await getAllActiveScheduledSessions();
  const results: Array<{
    userId: string;
    batchId: string;
    status: string;
  }> = [];

  for (const session of sessions) {
    const pick = { userId: session.userId, batchId: session.batchId };

    try {
      const pollResult = await pollCiba(session.authReqId);

      if (pollResult.status === "approved") {
        // Distributed lock: prevent duplicate execution from overlapping cron ticks
        const claimed = await claimExecution(session.userId, session.batchId);
        if (!claimed) {
          results.push({ ...pick, status: "already-executing" });
          continue;
        }

        const refreshToken = await getScheduleRefreshToken(session.userId);
        if (!refreshToken) {
          await batchUpdateStatus(
            session.userId,
            session.actionIds,
            "failed"
          );
          await removeScheduledCibaSession(session.userId, session.batchId);
          results.push({ ...pick, status: "error-no-token" });
          continue;
        }

        for (const actionId of session.actionIds) {
          const action = await getAction(session.userId, actionId);
          if (!action) {
            console.warn(
              "Action %s not found during scheduled execution for user %s",
              actionId,
              session.userId
            );
            continue;
          }

          await updateAction(session.userId, actionId, {
            status: "executing",
          });

          try {
            const token = await getTokenForAction(action, refreshToken);
            await executeActionWithToken(action, token);
            await updateAction(session.userId, actionId, {
              status: "sent",
            });

            writeAuditEntry(session.userId, {
              threadId: `scheduled:${session.batchId}`,
              toolName: `action:${action.type}`,
              input: action.draft as unknown as Record<string, unknown>,
              result: "success",
              durationMs: 0,
              surface: "actions",
              policyReason: "CIBA: approved by user via Guardian push",
            }).catch((err) =>
              console.error("Audit write failed for action", actionId, err)
            );
          } catch (err) {
            const errorMessage =
              err instanceof Error ? err.message : "Execution failed";
            await updateAction(session.userId, actionId, {
              status: "failed",
              errorMessage,
            });

            writeAuditEntry(session.userId, {
              threadId: `scheduled:${session.batchId}`,
              toolName: `action:${action.type}`,
              input: action.draft as unknown as Record<string, unknown>,
              result: "error",
              durationMs: 0,
              surface: "actions",
              policyReason: "CIBA: approved but execution failed",
            }).catch((err) =>
              console.error("Audit write failed for action", actionId, err)
            );
          }
        }

        await removeScheduledCibaSession(session.userId, session.batchId);
        results.push({ ...pick, status: "executed" });
      } else if (
        pollResult.status === "denied" ||
        pollResult.status === "expired" ||
        pollResult.status === "error"
      ) {
        await batchUpdateStatus(
          session.userId,
          session.actionIds,
          "pending"
        );
        await removeScheduledCibaSession(session.userId, session.batchId);
        results.push({ ...pick, status: pollResult.status });
      } else {
        // Still pending — check if expired by time
        if (new Date(session.expiresAt) < new Date()) {
          await batchUpdateStatus(
            session.userId,
            session.actionIds,
            "pending"
          );
          await removeScheduledCibaSession(session.userId, session.batchId);
          results.push({ ...pick, status: "expired-by-time" });
        } else {
          results.push({ ...pick, status: "still-pending" });
        }
      }
    } catch (err) {
      console.error(
        `Poll failed for ${session.userId}/${session.batchId}:`,
        err
      );
      results.push({ ...pick, status: "poll-error" });
    }
  }

  return NextResponse.json({ processed: sessions.length, results });
}
