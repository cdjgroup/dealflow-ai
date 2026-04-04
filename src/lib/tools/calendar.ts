import { tool } from "ai";
import { z } from "zod";
import { exchangeToken, sanitizeApiError, buildTokenMeta } from "@/lib/token-exchange";
import { TOOL_SCOPE_CONFIG } from "@/lib/tools/scope-map";

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

function toHHMM(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function computeFreeSlots(events: EventSlot[], date: string): string {
  if (events.length === 0) return "The entire day appears free.";

  const dayStart = new Date(`${date}T09:00:00`);
  const dayEnd = new Date(`${date}T17:00:00`);
  const slots: string[] = [];

  const sorted = events
    .filter((e) => e.start && e.end)
    .sort((a, b) => new Date(a.start!).getTime() - new Date(b.start!).getTime());

  let cursor = dayStart;
  for (const event of sorted) {
    const eventStart = new Date(event.start!);
    const eventEnd = new Date(event.end!);
    if (eventStart > cursor) {
      slots.push(`${toHHMM(cursor)} - ${toHHMM(eventStart)}`);
    }
    if (eventEnd > cursor) cursor = eventEnd;
  }
  if (cursor < dayEnd) {
    slots.push(`${toHHMM(cursor)} - ${toHHMM(dayEnd)}`);
  }

  return slots.length > 0
    ? `Free slots (business hours): ${slots.join(", ")}`
    : "No free slots during business hours (09:00-17:00).";
}

export const checkCalendar = tool({
  description:
    "Check the user's Google Calendar for events or availability on a specific date. Use this when the user asks about their schedule or wants to find free time for a meeting.",
  inputSchema: z.object({
    date: z.string().describe("The date to check in YYYY-MM-DD format"),
  }),
  execute: async ({ date }: { date: string }) => {
    const result = await exchangeToken("google-oauth2");
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
      return { error: sanitizeApiError(calResponse.status, "Calendar") };
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
      _tokenMeta: buildTokenMeta(result, TOOL_SCOPE_CONFIG["checkCalendar"].minScope),
    };
  },
});
