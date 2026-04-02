import { tool } from "ai";
import { z } from "zod";
import { auth0 } from "@/lib/auth0";

export const checkCalendar = tool({
  description:
    "Check the user's Google Calendar for events or availability on a specific date. Use this when the user asks about their schedule or wants to find free time for a meeting.",
  inputSchema: z.object({
    date: z.string().describe("The date to check in YYYY-MM-DD format"),
  }),
  execute: async ({ date }: { date: string }) => {
    // Get Google access token via Auth0 Token Vault (direct exchange)
    let accessToken: string;
    try {
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
            subject_token_type:
              "urn:ietf:params:oauth:token-type:refresh_token",
            subject_token: refreshToken,
            connection: "google-oauth2",
            requested_token_type:
              "http://auth0.com/oauth/token-type/federated-connection-access-token",
          }),
        }
      );

      if (!response.ok) {
        const err = await response.json();
        console.log("[CALENDAR] Token exchange failed:", JSON.stringify(err));
        return {
          error: "Google Calendar not connected",
          details: err.error_description || err.error,
          action: "Click 'Connect Google Account' in the sidebar, then try again.",
        };
      }

      const tokenData = await response.json();
      accessToken = tokenData.access_token;
      console.log("[CALENDAR] Got Google token:", accessToken.substring(0, 20) + "...");
    } catch (err) {
      console.log("[CALENDAR] Token exchange error:", err);
      return { error: "Failed to get Google access token", details: String(err) };
    }

    const timeMin = new Date(`${date}T00:00:00Z`).toISOString();
    const timeMax = new Date(`${date}T23:59:59Z`).toISOString();

    const calResponse = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?` +
        `timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}&singleEvents=true&orderBy=startTime`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    if (!calResponse.ok) {
      const err = await calResponse.text();
      console.log("[CALENDAR] Google API error:", calResponse.status, err.substring(0, 300));
      return { error: `Calendar API error: ${calResponse.status}`, details: err };
    }

    const data = await calResponse.json();
    const events = (data.items || []).map(
      (event: {
        summary?: string;
        start?: { dateTime?: string; date?: string };
        end?: { dateTime?: string; date?: string };
      }) => ({
        title: event.summary || "Busy",
        start: event.start?.dateTime || event.start?.date,
        end: event.end?.dateTime || event.end?.date,
      })
    );

    return {
      date,
      eventCount: events.length,
      events,
      freeSlots:
        events.length === 0
          ? "The entire day appears free."
          : `${events.length} event(s) found. Check gaps between events for availability.`,
    };
  },
});
