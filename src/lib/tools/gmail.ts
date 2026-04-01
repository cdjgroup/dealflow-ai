import { tool } from "ai";
import { z } from "zod";
import { getAccessTokenFromTokenVault } from "@auth0/ai-vercel";
import { withGmail } from "@/lib/auth0-ai";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const draftEmail = (withGmail as any)(
  tool({
    description:
      "Draft an email in the user's Gmail account. Use this when the user wants to send a follow-up email, reach out to a contact, or compose any email. The email is saved as a draft — NOT sent automatically.",
    inputSchema: z.object({
      to: z.string().describe("Recipient email address"),
      subject: z.string().describe("Email subject line"),
      body: z.string().describe("Email body text (plain text)"),
    }),
    execute: async ({ to, subject, body }) => {
      const accessToken = getAccessTokenFromTokenVault();

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
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            message: { raw: encodedMessage },
          }),
        }
      );

      if (!response.ok) {
        const err = await response.text();
        return { error: `Gmail API error: ${response.status}`, details: err };
      }

      const draft = await response.json();
      return {
        success: true,
        draftId: draft.id,
        message: `Draft email created to ${to} with subject "${subject}". Open Gmail to review and send.`,
      };
    },
  })
);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const searchEmails = (withGmail as any)(
  tool({
    description:
      "Search the user's Gmail inbox for emails matching a query. Use this to find recent correspondence with a contact or about a deal.",
    inputSchema: z.object({
      query: z
        .string()
        .describe(
          "Gmail search query (e.g., 'from:sarah@meridian.io' or 'subject:proposal')"
        ),
      maxResults: z
        .number()
        .optional()
        .default(5)
        .describe("Maximum number of results to return"),
    }),
    execute: async ({ query, maxResults }) => {
      const accessToken = getAccessTokenFromTokenVault();

      const response = await fetch(
        `https://www.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=${maxResults}`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );

      if (!response.ok) {
        const err = await response.text();
        return { error: `Gmail API error: ${response.status}`, details: err };
      }

      const data = await response.json();
      if (!data.messages || data.messages.length === 0) {
        return { results: [], message: "No emails found matching that query." };
      }

      const emails = await Promise.all(
        data.messages.slice(0, maxResults).map(async (msg: { id: string }) => {
          const detail = await fetch(
            `https://www.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
            { headers: { Authorization: `Bearer ${accessToken}` } }
          );
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

      return { results: emails, count: emails.length };
    },
  })
);
