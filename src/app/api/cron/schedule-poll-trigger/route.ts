import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";
import {
  getAllActiveScheduledSessions,
  removeScheduledCibaSession,
} from "@/lib/data/scheduled-ciba";
import { pollCiba } from "@/lib/ciba/poll";
import {
  getAction,
  updateAction,
} from "@/lib/data/actions";
import { getScheduleRefreshToken } from "@/lib/data/schedule-tokens";
import { exchangeTokenWithRefresh } from "@/lib/token-exchange";
import { executeActionWithToken } from "@/lib/actions/executor";
import { writeAuditEntry } from "@/lib/data/audit";
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
    throw new Error(
      `Could not obtain ${action.type} access token. Re-enable the connection in Permissions.`
    );
  }
  return result.token;
}

/**
 * On-demand poll for per-action CIBA sessions.
 * Checks all active sessions for the current user and processes
 * approved/denied ones individually.
 */
export async function GET(_req: Request) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  const userId = auth.userId;

  const allSessions = await getAllActiveScheduledSessions();
  const userSessions = allSessions.filter((s) => s.userId === userId);

  if (userSessions.length === 0) {
    return NextResponse.json({ status: "no-sessions", results: [] });
  }

  let refreshToken: string | null = null;
  const results: Array<{
    actionId: string;
    status: string;
    error?: string;
  }> = [];
  let anyPending = false;

  for (const session of userSessions) {
    const actionId = session.actionIds[0];
    const pollResult = await pollCiba(session.authReqId);

    if (pollResult.status === "pending") {
      if (new Date(session.expiresAt) < new Date()) {
        await updateAction(userId, actionId, { status: "pending" });
        await removeScheduledCibaSession(userId, session.batchId);
        results.push({ actionId, status: "expired" });
      } else {
        anyPending = true;
        results.push({ actionId, status: "pending" });
      }
      continue;
    }

    if (
      pollResult.status === "denied" ||
      pollResult.status === "expired" ||
      pollResult.status === "error"
    ) {
      await updateAction(userId, actionId, { status: "pending" });
      await removeScheduledCibaSession(userId, session.batchId);
      results.push({ actionId, status: pollResult.status });
      continue;
    }

    if (pollResult.status === "approved") {
      if (!refreshToken) {
        refreshToken = await getScheduleRefreshToken(userId);
      }
      if (!refreshToken) {
        await updateAction(userId, actionId, { status: "failed" });
        await removeScheduledCibaSession(userId, session.batchId);
        results.push({ actionId, status: "error", error: "No refresh token" });
        continue;
      }

      const action = await getAction(userId, actionId);
      if (!action) {
        await removeScheduledCibaSession(userId, session.batchId);
        results.push({ actionId, status: "error", error: "Action not found" });
        continue;
      }

      await updateAction(userId, actionId, { status: "executing" });

      try {
        const token = await getTokenForAction(action, refreshToken);
        await executeActionWithToken(action, token);
        await updateAction(userId, actionId, { status: "sent" });
        results.push({ actionId, status: "executed" });

        writeAuditEntry(userId, {
          threadId: `scheduled:${session.batchId}`,
          toolName: `action:${action.type}`,
          input: action.draft as unknown as Record<string, unknown>,
          result: "success",
          durationMs: 0,
        }).catch(() => {});
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Execution failed";
        await updateAction(userId, actionId, {
          status: "failed",
          errorMessage,
        });
        results.push({ actionId, status: "error", error: errorMessage });

        writeAuditEntry(userId, {
          threadId: `scheduled:${session.batchId}`,
          toolName: `action:${action.type}`,
          input: action.draft as unknown as Record<string, unknown>,
          result: "error",
          durationMs: 0,
        }).catch(() => {});
      }

      await removeScheduledCibaSession(userId, session.batchId);
    }
  }

  const executed = results.filter((r) => r.status === "executed").length;
  const denied = results.filter((r) => r.status === "denied").length;
  const failed = results.filter((r) => r.status === "error").length;

  // Overall status: done if nothing pending, otherwise still polling
  const overallStatus = anyPending ? "pending" : "done";

  return NextResponse.json({
    status: overallStatus,
    executed,
    denied,
    failed,
    pending: anyPending ? results.filter((r) => r.status === "pending").length : 0,
    results,
  });
}
