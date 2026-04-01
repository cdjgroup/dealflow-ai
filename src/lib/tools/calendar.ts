import { tool } from "ai";
import { z } from "zod";
import { getAccessTokenFromTokenVault } from "@auth0/ai-vercel";
import { withGoogleCalendar } from "@/lib/auth0-ai";

// Type cast needed: @auth0/ai-vercel was built for AI SDK v5 types
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const checkCalendar = (withGoogleCalendar as any)(
  tool({
    description:
      "Check the user's Google Calendar for events or availability on a specific date. Use this when the user asks about their schedule or wants to find free time for a meeting.",
    inputSchema: z.object({
      date: z
        .string()
        .describe("The date to check in YYYY-MM-DD format"),
    }),
    execute: async ({ date }: { date: string }) => {
      const accessToken = getAccessTokenFromTokenVault();
      const timeMin = new Date(`${date}T00:00:00Z`).toISOString();
      const timeMax = new Date(`${date}T23:59:59Z`).toISOString();

      const response = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events?` +
          `timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}&singleEvents=true&orderBy=startTime`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );

      if (!response.ok) {
        const err = await response.text();
        return { error: `Calendar API error: ${response.status}`, details: err };
      }

      const data = await response.json();
      const events = (data.items || []).map(
        (event: { summary?: string; start?: { dateTime?: string; date?: string }; end?: { dateTime?: string; date?: string } }) => ({
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
  })
);
