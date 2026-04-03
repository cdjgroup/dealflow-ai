import { NextResponse } from "next/server";
import { auth0, getUser } from "@/lib/auth0";
import { getAction, updateAction } from "@/lib/data/actions";
import { writeAuditEntry } from "@/lib/data/audit";
import { checkCsrf } from "@/lib/api-guard";
import { executeAction } from "@/lib/actions/executor";

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

  if (action.status !== "approved" && action.status !== "failed") {
    return NextResponse.json(
      { error: "Action must be approved before execution" },
      { status: 400 }
    );
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
