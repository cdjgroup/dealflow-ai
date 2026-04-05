/**
 * Shared utilities for Gmail and Slack API interactions.
 * Single source of truth — used by both AI tools and Action Center executor.
 */

/**
 * Build an RFC 2822 raw email message and encode it as base64url
 * for the Gmail API drafts endpoint.
 */
export function buildRawEmail(to: string, subject: string, body: string): string {
  // RFC 2047: encode Subject as MIME encoded-word when it contains non-ASCII
  const encodedSubject = /[^\x00-\x7F]/.test(subject)
    ? `=?UTF-8?B?${Buffer.from(subject).toString("base64")}?=`
    : subject;

  const rawMessage = [
    `To: ${to}`,
    `Subject: ${encodedSubject}`,
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

  // Paginate through all public and private channels (Slack returns max 200 per page)
  let cursor = "";
  const MAX_PAGES = 5; // Safety cap: 1000 channels max
  for (let page = 0; page < MAX_PAGES; page++) {
    const url = `https://slack.com/api/conversations.list?types=public_channel,private_channel&limit=200${cursor ? `&cursor=${cursor}` : ""}`;
    const listRes = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

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
    if (found) {
      return { id: found.id };
    }

    cursor = listData.response_metadata?.next_cursor || "";
    if (!cursor) break;
  }

  return { error: `Slack channel "${channelName}" not found` };
}
