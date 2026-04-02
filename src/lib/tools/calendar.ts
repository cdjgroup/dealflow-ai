import { tool } from "ai";
import { z } from "zod";
import { auth0 } from "@/lib/auth0";

interface CalendarEvent {
  summary?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
}

interface EventSlot {
  title: string;
  start: string | undefined;
  end: string | undefined;
}

function computeFreeSlots(events: EventSlot[], date: string): string {
  if (events.length === 0) return "The entire day appears free.";

  const dayStart = `${date}T09:00:00`;
  const dayEnd = `${date}T17:00:00`;
  const slots: string[] = [];

  const sorted = events
    .filter((e) => e.start && e.end)
    .sort((a, b) => (a.start! < b.start! ? -1 : 1));

  let cursor = dayStart;
  for (const event of sorted) {
    if (event.start! > cursor) {
      slots.push(`${cursor.substring(11, 16)} - ${event.start!.substring(11, 16)}`);
    }
    if (event.end! > cursor) cursor = event.end!;
  }
  if (cursor < dayEnd) {
    slots.push(`${cursor.substring(11, 16)} - ${dayEnd.substring(11, 16)}`);
  }

  return slots.length > 0
    ? `Free slots (business hours): ${slots.join(", ")}`
    : "No free slots during business hours (09:00-17:00).";
}

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

export const checkCalendar = tool({
  description:
    "Check the user's Google Calendar for events or availability on a specific date. Use this when the user asks about their schedule or wants to find free time for a meeting.",
  inputSchema: z.object({
    date: z.string().describe("The date to check in YYYY-MM-DD format"),
  }),
  execute: async ({ date }: { date: string }) => {
    const result = await getGoogleToken();
    if ("error" in result) {
      return {
        error: "Google Calendar not connected",
        details: result.error,
        action: "Click 'Connect Google Account' in the sidebar, then try again.",
      };
    }

    const timeMin = new Date(`${date}T00:00:00Z`).toISOString();
    const timeMax = new Date(`${date}T23:59:59Z`).toISOString();

    const calResponse = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?` +
        `timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}&singleEvents=true&orderBy=startTime`,
      {
        headers: { Authorization: `Bearer ${result.token}` },
      }
    );

    if (!calResponse.ok) {
      const status = calResponse.status;
      if (status === 401 || status === 403) {
        return { error: "Calendar: authorization failed — token may be expired" };
      }
      return { error: `Calendar: request failed (status ${status})` };
    }

    const data = await calResponse.json();
    const events: EventSlot[] = (data.items || []).map(
      (event: CalendarEvent) => ({
        title: event.summary || "Busy",
        start: event.start?.dateTime || event.start?.date,
        end: event.end?.dateTime || event.end?.date,
      })
    );

    return {
      date,
      eventCount: events.length,
      events,
      freeSlots: computeFreeSlots(events, date),
    };
  },
});
