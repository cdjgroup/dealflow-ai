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
  batchUpdateStatus,
} from "@/lib/data/actions";
import { getScheduleRefreshToken } from "@/lib/data/schedule-tokens";
import { exchangeTokenWithRefresh } from "@/lib/token-exchange";
import { executeActionWithToken } from "@/lib/actions/executor";
import { writeAuditEntry } from "@/lib/data/audit";
import { CONNECTION_MAP } from "@/lib/constants/tools";
import type { SuggestedAction } from "@/lib/types/actions";

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
 * On-demand poll for batch CIBA consent.
 * After approval, executes ALL actions in the batch within the
 * token's time-boxed window.
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

  const pollResult = await pollCiba(session.authReqId);

  if (pollResult.status === "pending") {
    if (new Date(session.expiresAt) < new Date()) {
      await batchUpdateStatus(userId, session.actionIds, "pending");
      await removeScheduledCibaSession(userId, session.batchId);
      return NextResponse.json({ status: "expired" });
    }
    return NextResponse.json({ status: "pending" });
  }

  if (
    pollResult.status === "denied" ||
    pollResult.status === "expired" ||
    pollResult.status === "error"
  ) {
    await batchUpdateStatus(userId, session.actionIds, "pending");
    await removeScheduledCibaSession(userId, session.batchId);
    return NextResponse.json({ status: pollResult.status });
  }

  if (pollResult.status === "approved") {
    const refreshToken = await getScheduleRefreshToken(userId);
    if (!refreshToken) {
      await batchUpdateStatus(userId, session.actionIds, "failed");
      await removeScheduledCibaSession(userId, session.batchId);
      return NextResponse.json({ status: "error", error: "No refresh token" });
    }

    let executed = 0;
    let failed = 0;

    for (const actionId of session.actionIds) {
      const action = await getAction(userId, actionId);
      if (!action) continue;

      await updateAction(userId, actionId, { status: "executing" });

      try {
        const token = await getTokenForAction(action, refreshToken);
        await executeActionWithToken(action, token);
        await updateAction(userId, actionId, { status: "sent" });
        executed++;

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
        failed++;

        writeAuditEntry(userId, {
          threadId: `scheduled:${session.batchId}`,
          toolName: `action:${action.type}`,
          input: action.draft as unknown as Record<string, unknown>,
          result: "error",
          durationMs: 0,
        }).catch(() => {});
      }
    }

    await removeScheduledCibaSession(userId, session.batchId);
    return NextResponse.json({ status: "executed", executed, failed });
  }

  return NextResponse.json({ status: pollResult.status });
}
