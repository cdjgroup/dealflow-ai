import { NextResponse } from "next/server";
import { auth0, getUser } from "@/lib/auth0";
import { getAction, updateAction } from "@/lib/data/actions";
import { getDeal } from "@/lib/data/crm";
import { writeAuditEntry } from "@/lib/data/audit";
import { getUserSettings } from "@/lib/data/settings";
import { checkCsrf } from "@/lib/api-guard";
import { executeAction } from "@/lib/actions/executor";
import { initiateCiba } from "@/lib/ciba/authorize";
import { pollCiba } from "@/lib/ciba/poll";
import { getCibaSession, storeCibaSession, deleteCibaSession } from "@/lib/ciba/session";
import type { ActionType } from "@/lib/types/actions";

// Map action types to the tool names used in capability/trust settings
const ACTION_TOOL_MAP: Record<ActionType, { tool: string; capability: "gmail" | "calendar" | "slack" }> = {
  email: { tool: "draftEmail", capability: "gmail" },
  calendar: { tool: "checkCalendar", capability: "calendar" },
  slack: { tool: "sendSlackMessage", capability: "slack" },
};

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const csrfError = checkCsrf(req);
  if (csrfError) return csrfError;

  const session = await auth0.getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const user = await getUser();
  if (!user?.sub) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const action = await getAction(user.sub, id);
  if (!action) {
    return NextResponse.json({ error: "Action not found" }, { status: 404 });
  }

  if (action.status !== "approved" && action.status !== "failed" && action.status !== "ciba-pending") {
    return NextResponse.json(
      { error: "Action must be approved before execution" },
      { status: 400 }
    );
  }

  // Check capability toggle and trust level (same controls as chat tools)
  const settings = await getUserSettings(user.sub);
  const mapping = ACTION_TOOL_MAP[action.type];
  if (!settings.capabilities[mapping.capability]) {
    return NextResponse.json(
      { error: `${mapping.capability} capability is disabled. Enable it in Permissions.` },
      { status: 403 }
    );
  }
  if (settings.toolTrust?.[mapping.tool] === "never") {
    return NextResponse.json(
      { error: `${mapping.tool} is blocked by your trust settings. Update in Permissions.` },
      { status: 403 }
    );
  }

  // C1: CIBA step-up check for high-value actions
  const HIGH_VALUE_THRESHOLD = 50_000;
  const deal = action.dealId ? await getDeal(user.sub, action.dealId) : null;
  const dealValue = deal?.value ?? 0;
  const cibaRequired = dealValue > HIGH_VALUE_THRESHOLD;

  if (cibaRequired) {
    // Include action ID to prevent session key collision across actions
    const cibaToolKey = `action:${action.type}:${id}`;

    // Check for existing CIBA session
    const existing = await getCibaSession(user.sub, cibaToolKey);

    if (existing?.status === "approved") {
      await deleteCibaSession(user.sub, cibaToolKey);
      // Fall through to execution
    } else if (existing?.status === "pending") {
      const pollResult = await pollCiba(existing.authReqId);
      if (pollResult.status === "approved") {
        await deleteCibaSession(user.sub, cibaToolKey);
        // Fall through to execution
      } else if (pollResult.status === "pending") {
        const remainingSeconds = Math.max(0, Math.floor(
          (new Date(existing.expiresAt).getTime() - Date.now()) / 1000
        ));
        return NextResponse.json({
          cibaRequired: true,
          authReqId: existing.authReqId,
          bindingMessage: existing.bindingMessage,
          expiresIn: remainingSeconds,
          interval: existing.interval,
          status: "ciba-pending",
        });
      } else {
        // Denied/expired/error — clean up and report
        await deleteCibaSession(user.sub, cibaToolKey);
        await updateAction(user.sub, id, {
          status: "failed",
          errorMessage: `CIBA authorization ${pollResult.status}: ${pollResult.error || ""}`,
        });
        return NextResponse.json(
          { error: `CIBA authorization ${pollResult.status}` },
          { status: 403 }
        );
      }
    } else {
      // No session, or stale (denied/expired/error) — always initiate new CIBA
      if (existing) await deleteCibaSession(user.sub, cibaToolKey);

      try {
        const dealName = deal?.name || action.dealName || "deal";
        const bindingMessage = `Approve ${action.type} for $${dealValue.toLocaleString()} deal: ${dealName}`.slice(0, 64);
        const cibaResult = await initiateCiba(user.sub, bindingMessage);

        await storeCibaSession({
          authReqId: cibaResult.authReqId,
          userId: user.sub,
          bindingMessage: cibaResult.bindingMessage,
          toolName: cibaToolKey,
          expiresAt: new Date(Date.now() + cibaResult.expiresIn * 1000).toISOString(),
          interval: cibaResult.interval,
          status: "pending",
          createdAt: new Date().toISOString(),
        });

        await updateAction(user.sub, id, { status: "ciba-pending" as "approved" });

        return NextResponse.json({
          cibaRequired: true,
          authReqId: cibaResult.authReqId,
          bindingMessage: cibaResult.bindingMessage,
          expiresIn: cibaResult.expiresIn,
          interval: cibaResult.interval,
          status: "ciba-pending",
        });
      } catch (err) {
        console.error("Action CIBA initiation failed:", err);
        const raw = err instanceof Error ? err.message : "";
        const msg = raw.includes("not enrolled")
          ? "Device verification requires Auth0 Guardian enrollment"
          : "Step-up authentication unavailable";
        return NextResponse.json({ error: msg }, { status: 502 });
      }
    }
  }

  // Mark as executing
  await updateAction(user.sub, id, { status: "executing" });

  const startTime = Date.now();
  try {
    const result = await executeAction(action);

    const updated = await updateAction(user.sub, id, {
      status: "sent",
    });

    // Fire-and-forget audit entry
    writeAuditEntry(user.sub, {
      threadId: `action:${action.id}`,
      toolName: `action:${action.type}`,
      input: action.draft as unknown as Record<string, unknown>,
      result: "success",
      durationMs: Date.now() - startTime,
    }).catch(() => {});

    return NextResponse.json({ action: updated, result });
  } catch (err) {
    const errorMessage =
      err instanceof Error ? err.message : "Execution failed";

    const updated = await updateAction(user.sub, id, {
      status: "failed",
      errorMessage,
    });

    writeAuditEntry(user.sub, {
      threadId: `action:${action.id}`,
      toolName: `action:${action.type}`,
      input: action.draft as unknown as Record<string, unknown>,
      result: "error",
      errorMessage,
      durationMs: Date.now() - startTime,
    }).catch(() => {});

    return NextResponse.json(
      { action: updated, error: errorMessage },
      { status: 502 }
    );
  }
}
