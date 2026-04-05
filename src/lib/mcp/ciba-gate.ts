import { initiateCiba } from "@/lib/ciba/authorize";
import { pollCiba } from "@/lib/ciba/poll";

type CibaGateSuccess = { approved: true };
type CibaGateFailure = {
  approved: false;
  error: string;
  status: "denied" | "expired" | "error" | "timeout";
};
type CibaGateResult = CibaGateSuccess | CibaGateFailure;

export async function cibaGate(
  userId: string,
  toolName: string,
  bindingMessage: string,
  maxWaitMs = 50000
): Promise<CibaGateResult> {
  let initiateResponse;
  try {
    initiateResponse = await initiateCiba(userId, bindingMessage);
  } catch (err) {
    return {
      approved: false,
      error: err instanceof Error ? err.message : String(err),
      status: "error",
    };
  }

  const { authReqId, interval } = initiateResponse;
  const intervalMs = interval * 1000;
  const deadline = Date.now() + maxWaitMs;

  return new Promise<CibaGateResult>((resolve) => {
    let settled = false;

    function settle(result: CibaGateResult) {
      if (!settled) {
        settled = true;
        resolve(result);
      }
    }

    async function doPoll() {
      if (settled) return;

      if (Date.now() >= deadline) {
        settle({
          approved: false,
          error: `Approval timed out for ${toolName}`,
          status: "timeout",
        });
        return;
      }

      let pollResult;
      try {
        pollResult = await pollCiba(authReqId);
      } catch (err) {
        settle({
          approved: false,
          error: `Poll error for ${toolName}: ${err instanceof Error ? err.message : String(err)}`,
          status: "error",
        });
        return;
      }

      if (pollResult.status === "approved") {
        settle({ approved: true });
      } else if (pollResult.status === "denied") {
        settle({
          approved: false,
          error: `User denied approval for ${toolName}`,
          status: "denied",
        });
      } else if (pollResult.status === "expired") {
        settle({
          approved: false,
          error: `Authorization expired for ${toolName}`,
          status: "expired",
        });
      } else if (pollResult.status === "error") {
        settle({
          approved: false,
          error: `Authorization error for ${toolName}: ${pollResult.error ?? "unknown"}`,
          status: "error",
        });
      } else {
        // pending — schedule next poll after interval
        setTimeout(doPoll, intervalMs);
      }
    }

    // Set a hard timeout
    setTimeout(() => {
      settle({
        approved: false,
        error: `Approval timed out for ${toolName}`,
        status: "timeout",
      });
    }, maxWaitMs);

    // First poll is immediate
    doPoll();
  });
}

/** Strip characters not allowed in Auth0 CIBA binding messages.
 * Auth0 allows: alphanumerics, whitespace, +-_.,:#@ */
function sanitizeCiba(s: string): string {
  return s.replace(/[^\w\s+\-_.,:#@]/g, "").trim();
}

export function buildMcpBindingMessage(
  toolName: string,
  params: Record<string, unknown>,
  clientName?: string
): string {
  let action: string;

  if (toolName === "draftEmail") {
    const to = params.to ? sanitizeCiba(String(params.to)) : "";
    action = `draft email to ${to}`;
  } else if (toolName === "createCalendarEvent") {
    const summary = params.summary ? sanitizeCiba(String(params.summary)) : "";
    action = `calendar "${summary}"`;
  } else if (toolName === "sendSlackMessage") {
    const channel = params.channel ? sanitizeCiba(String(params.channel)) : "";
    const text = params.text ? sanitizeCiba(String(params.text)) : "";
    action = `slack #${channel} "${text}"`;
  } else {
    action = toolName;
  }

  const prefix = clientName ? `${sanitizeCiba(clientName)} - ` : "MCP: ";
  return `${prefix}${action}`.slice(0, 64);
}
