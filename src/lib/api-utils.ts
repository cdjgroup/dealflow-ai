/**
 * Shared utilities for Gmail and Slack API interactions.
 * Single source of truth — used by both AI tools and Action Center executor.
 */

/**
 * Build an RFC 2822 raw email message and encode it as base64url
 * for the Gmail API drafts endpoint.
 */
export function buildRawEmail(to: string, subject: string, body: string): string {
  const rawMessage = [
    `To: ${to}`,
    `Subject: ${subject}`,
    `Content-Type: text/plain; charset=utf-8`,
    "",
    body,
  ].join("\r\n");

  return Buffer.from(rawMessage)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Resolve a Slack channel name to its ID using the conversations.list API.
 * Returns the channel ID if found, or null if not found.
 */
export async function resolveSlackChannelId(
  channelName: string,
  token: string
): Promise<{ id: string } | { error: string }> {
  const name = channelName.replace(/^#/, "");

  const listRes = await fetch(
    "https://slack.com/api/conversations.list?types=public_channel&limit=200",
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (!listRes.ok) {
    return { error: `Slack channel lookup failed (status ${listRes.status})` };
  }

  const listData = await listRes.json();
  if (!listData.ok) {
    return { error: `Slack API error: ${listData.error}` };
  }

  const found = (listData.channels || []).find(
    (ch: { name: string }) => ch.name === name
  );

  if (!found) {
    return { error: `Slack channel "${channelName}" not found` };
  }

  return { id: found.id };
}
