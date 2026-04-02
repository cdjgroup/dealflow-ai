import { tool } from "ai";
import { z } from "zod";
import { auth0 } from "@/lib/auth0";

async function getGoogleToken(): Promise<{ token: string } | { error: string }> {
  const session = await auth0.getSession();
  const refreshToken = session?.tokenSet?.refreshToken;
  if (!refreshToken) {
    return { error: "No session refresh token. Please log out and log back in." };
  }

  const response = await fetch(
    `https://${process.env.AUTH0_DOMAIN}/oauth/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type:
          "urn:auth0:params:oauth:grant-type:token-exchange:federated-connection-access-token",
        client_id: process.env.AUTH0_CLIENT_ID,
        client_secret: process.env.AUTH0_CLIENT_SECRET,
        subject_token_type: "urn:ietf:params:oauth:token-type:refresh_token",
        subject_token: refreshToken,
        connection: "google-oauth2",
        requested_token_type:
          "http://auth0.com/oauth/token-type/federated-connection-access-token",
      }),
    }
  );

  if (!response.ok) {
    const err = await response.json();
    return { error: err.error_description || err.error || "Token exchange failed" };
  }

  const tokenData = await response.json();
  return { token: tokenData.access_token };
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
    const result = await getGoogleToken();
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
      const err = await response.text();
      console.log("[GMAIL] Draft error:", response.status, err.substring(0, 300));
      return { error: `Gmail API error: ${response.status}`, details: err };
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
      .describe("Gmail search query (e.g., 'from:sarah@example.com' or 'subject:proposal')"),
    maxResults: z
      .number()
      .optional()
      .default(5)
      .describe("Maximum number of results to return"),
  }),
  execute: async ({ query, maxResults }: { query: string; maxResults?: number }) => {
    const result = await getGoogleToken();
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
      const err = await response.text();
      console.log("[GMAIL] Search error:", response.status, err.substring(0, 300));
      return { error: `Gmail API error: ${response.status}`, details: err };
    }

    const data = await response.json();
    if (!data.messages || data.messages.length === 0) {
      return { results: [], message: "No emails found matching that query." };
    }

    const emails = await Promise.all(
      data.messages.slice(0, max).map(async (msg: { id: string }) => {
        const detail = await fetch(
          `https://www.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
          { headers: { Authorization: `Bearer ${result.token}` } }
        );
        if (!detail.ok) return null;
        const d = await detail.json();
        const headers = d.payload?.headers || [];
        return {
          id: msg.id,
          from: headers.find((h: { name: string }) => h.name === "From")?.value,
          subject: headers.find((h: { name: string }) => h.name === "Subject")?.value,
          date: headers.find((h: { name: string }) => h.name === "Date")?.value,
          snippet: d.snippet,
        };
      })
    );

    return { results: emails.filter(Boolean), count: emails.filter(Boolean).length };
  },
});
