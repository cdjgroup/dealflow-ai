import { tool } from "ai";
import { z } from "zod";
import { exchangeToken, sanitizeApiError } from "@/lib/token-exchange";

interface GmailMessageRef {
  id: string;
}

interface GmailHeader {
  name: string;
  value?: string;
}

export const draftEmail = tool({
  description:
    "Draft an email in the user's Gmail account. Use this when the user wants to send a follow-up email, reach out to a contact, or compose any email. The email is saved as a draft — NOT sent automatically.",
  inputSchema: z.object({
    to: z.string().describe("Recipient email address"),
    subject: z.string().describe("Email subject line"),
    body: z.string().describe("Email body text (plain text)"),
  }),
  execute: async ({ to, subject, body }: { to: string; subject: string; body: string }) => {
    const result = await exchangeToken("google-oauth2");
    if ("error" in result) {
      return { error: "Gmail not connected", action: "Click 'Connect Google Account' in the sidebar.", details: result.error };
    }

    const rawMessage = [
      `To: ${to}`,
      `Subject: ${subject}`,
      `Content-Type: text/plain; charset=utf-8`,
      "",
      body,
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
        body: JSON.stringify({
          message: { raw: encodedMessage },
        }),
      }
    );

    if (!response.ok) {
      return { error: sanitizeApiError(response.status, "Gmail draft") };
    }

    const draft = await response.json();
    return {
      success: true,
      draftId: draft.id,
      message: `Draft email created to ${to} with subject "${subject}". Open Gmail to review and send.`,
    };
  },
});

export const searchEmails = tool({
  description:
    "Search the user's Gmail inbox for emails matching a query. Use this to find recent correspondence with a contact or about a deal.",
  inputSchema: z.object({
    query: z
      .string()
      .describe("Gmail search query (e.g., 'from:sarah@meridian.io' or 'subject:proposal')"),
    maxResults: z
      .number()
      .int()
      .min(1)
      .max(20)
      .optional()
      .default(5)
      .describe("Maximum number of results to return (1-20)"),
  }),
  execute: async ({ query, maxResults }: { query: string; maxResults?: number }) => {
    const result = await exchangeToken("google-oauth2");
    if ("error" in result) {
      return { error: "Gmail not connected", action: "Click 'Connect Google Account' in the sidebar.", details: result.error };
    }

    const max = maxResults || 5;
    const response = await fetch(
      `https://www.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=${max}`,
      {
        headers: { Authorization: `Bearer ${result.token}` },
      }
    );

    if (!response.ok) {
      return { error: sanitizeApiError(response.status, "Gmail search") };
    }

    const data = await response.json();
    if (!data.messages || data.messages.length === 0) {
      return { results: [], message: "No emails found matching that query." };
    }

    const emails = await Promise.all(
      data.messages.slice(0, max).map(async (msg: GmailMessageRef) => {
        const detail = await fetch(
          `https://www.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
          { headers: { Authorization: `Bearer ${result.token}` } }
        );
        if (!detail.ok) return null;
        const d = await detail.json();
        const headers: GmailHeader[] = d.payload?.headers || [];
        return {
          id: msg.id,
          from: headers.find((h) => h.name === "From")?.value,
          subject: headers.find((h) => h.name === "Subject")?.value,
          date: headers.find((h) => h.name === "Date")?.value,
          snippet: d.snippet,
        };
      })
    );

    return { results: emails.filter(Boolean), count: emails.filter(Boolean).length };
  },
});
