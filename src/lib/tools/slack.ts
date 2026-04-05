import { tool } from "ai";
import { z } from "zod";
import { exchangeToken, buildTokenMeta } from "@/lib/token-exchange";
import { TOOL_SCOPE_CONFIG } from "@/lib/tools/scope-map";
import { resolveSlackChannelId } from "@/lib/api-utils";

export const listSlackChannels = tool({
  description:
    "List Slack channels the user has access to. Use this when the user asks about available Slack channels or wants to know where to post a message.",
  inputSchema: z.object({}),
  execute: async () => {
    const result = await exchangeToken("sign-in-with-slack");
    if ("error" in result) {
      return {
        error: "Slack not connected",
        details: result.error,
        action:
          "Connect your Slack account in Permissions, then try again.",
      };
    }

    const response = await fetch(
      "https://slack.com/api/conversations.list?types=public_channel&exclude_archived=true&limit=50",
      {
        headers: { Authorization: `Bearer ${result.token}` },
      }
    );

    const data = await response.json();
    if (!data.ok) {
      return { error: `Slack API error: ${data.error}` };
    }

    const channels = (data.channels || []).map(
      (ch: { id: string; name: string; num_members?: number }) => ({
        id: ch.id,
        name: ch.name,
        members: ch.num_members || 0,
      })
    );

    return {
      channelCount: channels.length,
      channels,
      _tokenMeta: buildTokenMeta(result, TOOL_SCOPE_CONFIG["listSlackChannels"].minScope),
    };
  },
});

export const sendSlackMessage = tool({
  description:
    "Send a message to a Slack channel. Use this when the user wants to notify their team about a deal update, share pipeline status, or send a quick message to a channel. Always confirm the channel and message content with the user before sending.",
  inputSchema: z.object({
    channel: z
      .string()
      .describe(
        "The Slack channel name (without #) or channel ID to send the message to"
      ),
    text: z
      .string()
      .describe("The message text to send. Supports Slack markdown formatting."),
  }),
  execute: async ({
    channel,
    text,
  }: {
    channel: string;
    text: string;
  }) => {
    const result = await exchangeToken("sign-in-with-slack");
    if ("error" in result) {
      return {
        error: "Slack not connected",
        details: result.error,
        action:
          "Connect your Slack account in Permissions, then try again.",
      };
    }

    // Validate channel ID format strictly — don't trust LLM-supplied strings
    const SLACK_CHANNEL_ID_RE = /^[CG][A-Z0-9]{8,11}$/;
    let channelId = channel;
    if (!SLACK_CHANNEL_ID_RE.test(channel)) {
      const resolved = await resolveSlackChannelId(channel, result.token);
      if ("error" in resolved) {
        return { error: resolved.error + ". Use listSlackChannels to see available channels." };
      }
      channelId = resolved.id;
    }

    const response = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${result.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ channel: channelId, text }),
    });

    const data = await response.json();
    if (!data.ok) {
      const friendlyErrors: Record<string, string> = {
        channel_not_found: `Channel "${channel}" not found. Check the channel name and try again.`,
        not_in_channel: `The bot is not in channel "${channel}". Invite it first with /invite.`,
        msg_too_long: "Message is too long. Try a shorter message.",
      };
      return {
        error: friendlyErrors[data.error] || `Slack API error: ${data.error}`,
      };
    }

    return {
      success: true,
      channel: data.channel,
      timestamp: data.ts,
      message: `Message sent to #${channel}`,
      _tokenMeta: buildTokenMeta(result, TOOL_SCOPE_CONFIG["sendSlackMessage"].minScope),
    };
  },
});
