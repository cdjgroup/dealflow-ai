import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";
import {
  getAllActiveScheduledSessions,
  removeScheduledCibaSession,
} from "@/lib/data/scheduled-ciba";
import { pollCiba } from "@/lib/ciba/poll";
import {
  getAction,
  getActions,
  updateAction,
} from "@/lib/data/actions";
import { getScheduleRefreshToken } from "@/lib/data/schedule-tokens";
import { exchangeTokenWithRefresh } from "@/lib/token-exchange";
import { executeActionWithToken } from "@/lib/actions/executor";
import { writeAuditEntry } from "@/lib/data/audit";
import { initiateActionCiba } from "@/app/api/cron/schedule-trigger/route";
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
 * On-demand poll for sequential CIBA consent.
 * Checks the current user's active session. If approved, executes the action
 * and initiates the next eligible pending action.
 */
export async function GET(_req: Request) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  const userId = auth.userId;

  const allSessions = await getAllActiveScheduledSessions();
  const session = allSessions.find((s) => s.userId === userId);

  if (!session) {
    return NextResponse.json({ status: "no-sessions" });
  }

  const actionId = session.actionIds[0];
  const pollResult = await pollCiba(session.authReqId);

  if (pollResult.status === "pending") {
    if (new Date(session.expiresAt) < new Date()) {
      await updateAction(userId, actionId, { status: "pending" });
      await removeScheduledCibaSession(userId, session.batchId);
      return NextResponse.json({ status: "expired" });
    }
    return NextResponse.json({
      status: "pending",
      bindingMessage: session.bindingMessage,
    });
  }

  if (
    pollResult.status === "denied" ||
    pollResult.status === "expired" ||
    pollResult.status === "error"
  ) {
    await updateAction(userId, actionId, { status: "pending" });
    await removeScheduledCibaSession(userId, session.batchId);
    return NextResponse.json({ status: pollResult.status });
  }

  if (pollResult.status === "approved") {
    const refreshToken = await getScheduleRefreshToken(userId);
    if (!refreshToken) {
      await updateAction(userId, actionId, { status: "failed" });
      await removeScheduledCibaSession(userId, session.batchId);
      return NextResponse.json({ status: "error", error: "No refresh token" });
    }

    const action = await getAction(userId, actionId);
    if (!action) {
      await removeScheduledCibaSession(userId, session.batchId);
      return NextResponse.json({ status: "error", error: "Action not found" });
    }

    // Execute the approved action
    await updateAction(userId, actionId, { status: "executing" });
    let executed = false;

    try {
      const token = await getTokenForAction(action, refreshToken);
      await executeActionWithToken(action, token);
      await updateAction(userId, actionId, { status: "sent" });
      executed = true;

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

      writeAuditEntry(userId, {
        threadId: `scheduled:${session.batchId}`,
        toolName: `action:${action.type}`,
        input: action.draft as unknown as Record<string, unknown>,
        result: "error",
        durationMs: 0,
      }).catch(() => {});
    }

    await removeScheduledCibaSession(userId, session.batchId);

    // Initiate the NEXT eligible pending action
    const pendingActions = await getActions(userId, { status: "pending" });
    const nextAction = pendingActions.find(
      (a) => a.priority === "high" || a.priority === "medium"
    );

    if (nextAction) {
      try {
        await initiateActionCiba(userId, nextAction);
        return NextResponse.json({
          status: "next",
          executed,
          nextAction: {
            id: nextAction.id,
            type: nextAction.type,
            priority: nextAction.priority,
          },
          remaining: pendingActions.filter(
            (a) => a.priority === "high" || a.priority === "medium"
          ).length - 1,
        });
      } catch (err) {
        console.error("Failed to initiate next CIBA:", err);
        return NextResponse.json({
          status: "done",
          executed,
          error: "Failed to initiate next action",
        });
      }
    }

    return NextResponse.json({ status: "done", executed });
  }

  return NextResponse.json({ status: pollResult.status });
}
