import { exchangeToken, sanitizeApiError } from "@/lib/token-exchange";
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

export async function executeAction(
  action: SuggestedAction
): Promise<ExecutionResult> {
  switch (action.type) {
    case "email":
      return executeEmail(action.draft as EmailDraft);
    case "calendar":
      return executeCalendar(action.draft as CalendarDraft);
    case "slack":
      return executeSlack(action.draft as SlackDraft);
    default:
      throw new Error(`Unknown action type: ${action.type}`);
  }
}

async function executeEmail(draft: EmailDraft): Promise<ExecutionResult> {
  const result = await exchangeToken("google-oauth2");
  if ("error" in result) {
    throw new Error(
      "Gmail not connected. Connect your Google Account in Permissions."
    );
  }

  const rawMessage = [
    `To: ${draft.to}`,
    `Subject: ${draft.subject}`,
    `Content-Type: text/plain; charset=utf-8`,
    "",
    draft.body,
  ].join("\r\n");

  const encodedMessage = Buffer.from(rawMessage)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const response = await fetch(
    "https://www.googleapis.com/gmail/v1/users/me/drafts",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${result.token}`,
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
  draft: CalendarDraft
): Promise<ExecutionResult> {
  const result = await exchangeToken("google-oauth2");
  if ("error" in result) {
    throw new Error(
      "Google Calendar not connected. Connect your Google Account in Permissions."
    );
  }

  const startDateTime = `${draft.date}T${draft.time}:00`;
  const endDate = new Date(
    new Date(startDateTime).getTime() + draft.duration * 60 * 1000
  );
  const endDateTime = endDate.toISOString().replace("Z", "");

  const event = {
    summary: draft.title,
    start: { dateTime: startDateTime, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone },
    end: { dateTime: endDateTime, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone },
    attendees: draft.attendees.map((email) => ({ email })),
    description: draft.notes || "",
  };

  const response = await fetch(
    "https://www.googleapis.com/calendar/v3/calendars/primary/events?sendUpdates=none",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${result.token}`,
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

async function executeSlack(draft: SlackDraft): Promise<ExecutionResult> {
  const result = await exchangeToken("sign-in-with-slack");
  if ("error" in result) {
    throw new Error(
      "Slack not connected. Connect your Slack account in Permissions."
    );
  }

  const channel = draft.channel.replace(/^#/, "");

  // Resolve channel name to ID
  const listRes = await fetch(
    "https://slack.com/api/conversations.list?types=public_channel&limit=200",
    { headers: { Authorization: `Bearer ${result.token}` } }
  );

  if (!listRes.ok) {
    throw new Error(sanitizeApiError(listRes.status, "Slack channel lookup"));
  }

  const listData = await listRes.json();
  if (!listData.ok) {
    throw new Error(`Slack API error: ${listData.error}`);
  }

  const found = (listData.channels || []).find(
    (ch: { name: string }) => ch.name === channel
  );
  if (!found) {
    throw new Error(
      `Slack channel "${draft.channel}" not found. Check the channel name.`
    );
  }

  const response = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${result.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ channel: found.id, text: draft.message }),
  });

  if (!response.ok) {
    throw new Error(sanitizeApiError(response.status, "Slack message"));
  }

  const data = await response.json();
  if (!data.ok) {
    throw new Error(`Slack API error: ${data.error}`);
  }

  return {
    success: true,
    message: `Message sent to #${channel}`,
    channel: data.channel,
    timestamp: data.ts,
  };
}
