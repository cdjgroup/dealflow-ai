import { exchangeToken, sanitizeApiError } from "@/lib/token-exchange";
import { buildRawEmail, resolveSlackChannelId } from "@/lib/api-utils";
import { CONNECTION_MAP } from "@/lib/constants/tools";
import { getRedis } from "@/lib/redis";
import type {
  SuggestedAction,
  EmailDraft,
  CalendarDraft,
  SlackDraft,
} from "@/lib/types/actions";

export interface ExecutionResult {
  success: boolean;
  message: string;
  [key: string]: unknown;
}

const CONNECTION_ERRORS: Record<string, string> = {
  email: "Gmail not connected. Connect your Google Account in Permissions.",
  calendar: "Google Calendar not connected. Connect your Google Account in Permissions.",
  slack: "Slack not connected. Connect your Slack account in Permissions.",
};

/**
 * Per-action execution lock. Prevents duplicate sends regardless of which
 * code path triggers execution (individual execute, cron poll, Run Now, etc.).
 * Returns true if the lock was acquired; false if another execution is in-flight.
 */
async function claimActionLock(actionId: string): Promise<boolean> {
  const redis = getRedis();
  const result = await redis.set(
    `action:lock:${actionId}`,
    Date.now().toString(),
    { ex: 300, nx: true }
  );
  return result === "OK";
}

async function releaseActionLock(actionId: string): Promise<void> {
  const redis = getRedis();
  await redis.del(`action:lock:${actionId}`);
}

export async function executeAction(
  action: SuggestedAction
): Promise<ExecutionResult> {
  if (!await claimActionLock(action.id)) {
    console.warn(`[executor] BLOCKED duplicate execution: action=${action.id} type=${action.type}`);
    throw new Error("Action is already being executed");
  }
  console.log(`[executor] Executing action=${action.id} type=${action.type} via session token exchange`);

  try {
    const connection = CONNECTION_MAP[action.type];
    const result = await exchangeToken(connection);
    if ("error" in result) {
      throw new Error(CONNECTION_ERRORS[action.type]);
    }
    const execResult = await executeWithToken(action, result.token);
    console.log(`[executor] SUCCESS action=${action.id} type=${action.type}`);
    return execResult;
  } catch (err) {
    // Release lock on failure so retries work
    await releaseActionLock(action.id);
    throw err;
  }
}

export async function executeActionWithToken(
  action: SuggestedAction,
  token: string
): Promise<ExecutionResult> {
  if (!await claimActionLock(action.id)) {
    console.warn(`[executor] BLOCKED duplicate execution: action=${action.id} type=${action.type}`);
    throw new Error("Action is already being executed");
  }
  console.log(`[executor] Executing action=${action.id} type=${action.type} via provided token`);

  try {
    const execResult = await executeWithToken(action, token);
    console.log(`[executor] SUCCESS action=${action.id} type=${action.type}`);
    return execResult;
  } catch (err) {
    // Release lock on failure so retries work
    await releaseActionLock(action.id);
    throw err;
  }
}

function executeWithToken(
  action: SuggestedAction,
  token: string
): Promise<ExecutionResult> {
  switch (action.type) {
    case "email":
      return executeEmail(action.draft as EmailDraft, token);
    case "calendar":
      return executeCalendar(action.draft as CalendarDraft, token);
    case "slack":
      return executeSlack(action.draft as SlackDraft, token);
    default:
      throw new Error(`Unknown action type: ${action.type}`);
  }
}

async function executeEmail(
  draft: EmailDraft,
  token: string
): Promise<ExecutionResult> {
  const encodedMessage = buildRawEmail(draft.to, draft.subject, draft.body);

  const response = await fetch(
    "https://www.googleapis.com/gmail/v1/users/me/drafts",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ message: { raw: encodedMessage } }),
    }
  );

  if (!response.ok) {
    throw new Error(sanitizeApiError(response.status, "Gmail draft"));
  }

  const data = await response.json();
  return {
    success: true,
    message: `Draft email created to ${draft.to} with subject "${draft.subject}". Open Gmail to review and send.`,
    draftId: data.id,
  };
}

async function executeCalendar(
  draft: CalendarDraft,
  token: string
): Promise<ExecutionResult> {
  const startDateTime = `${draft.date}T${draft.time}:00`;
  // Compute end time by adding duration to the naive start time string.
  // Both start and end use the same naive format — Google Calendar
  // interprets both using the timeZone field, keeping them consistent.
  const [h, m] = draft.time.split(":").map(Number);
  const totalMinutes = h * 60 + m + draft.duration;
  const endH = String(Math.floor(totalMinutes / 60) % 24).padStart(2, "0");
  const endM = String(totalMinutes % 60).padStart(2, "0");
  const endDateTime = `${draft.date}T${endH}:${endM}:00`;

  const timeZone = draft.timeZone || "UTC";
  const event = {
    summary: draft.title,
    start: { dateTime: startDateTime, timeZone },
    end: { dateTime: endDateTime, timeZone },
    attendees: draft.attendees.map((email) => ({ email })),
    description: draft.notes || "",
  };

  const response = await fetch(
    "https://www.googleapis.com/calendar/v3/calendars/primary/events?sendUpdates=none",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(event),
    }
  );

  if (!response.ok) {
    throw new Error(sanitizeApiError(response.status, "Calendar event"));
  }

  const data = await response.json();
  return {
    success: true,
    message: `Calendar event "${draft.title}" created for ${draft.date} at ${draft.time}`,
    eventId: data.id,
    htmlLink: data.htmlLink,
  };
}

async function executeSlack(
  draft: SlackDraft,
  token: string
): Promise<ExecutionResult> {
  const resolved = await resolveSlackChannelId(draft.channel, token);
  if ("error" in resolved) {
    throw new Error(resolved.error);
  }

  const response = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ channel: resolved.id, text: draft.message }),
  });

  if (!response.ok) {
    throw new Error(sanitizeApiError(response.status, "Slack message"));
  }

  const data = await response.json();
  if (!data.ok) {
    const friendly: Record<string, string> = {
      not_in_channel: `You are not a member of #${draft.channel}. Join the channel in Slack first — Token Vault posts as you, not as a bot.`,
      channel_not_found: `Slack channel #${draft.channel} not found or was deleted`,
      not_authed: "Slack token expired. Reconnect Slack in Permissions.",
      invalid_auth: "Slack token invalid. Reconnect Slack in Permissions.",
      missing_scope: "Slack connection is missing required permissions. Disconnect and reconnect Slack in Permissions to grant the correct scopes.",
    };
    throw new Error(friendly[data.error] || `Slack API error: ${data.error}`);
  }

  return {
    success: true,
    message: `Message sent to #${draft.channel}`,
    channel: data.channel,
    timestamp: data.ts,
  };
}
