import { describe, it, expect, vi, beforeEach } from "vitest";
import { checkCalendar, createCalendarEvent } from "@/lib/tools/calendar";

// Mock Auth0 session
vi.mock("@/lib/auth0", () => ({
  auth0: {
    getSession: vi.fn().mockResolvedValue({
      tokenSet: { refreshToken: "test-refresh-token" },
    }),
  },
}));

// Mock exchangeToken returning the new TokenExchangeSuccess shape (AC-1)
const mockExchangeToken = vi.fn();
vi.mock("@/lib/token-exchange", () => ({
  exchangeToken: (...args: unknown[]) => mockExchangeToken(...args),
  sanitizeApiError: (status: number, label: string) => `${label}: request failed (status ${status})`,
  buildTokenMeta: (result: Record<string, unknown>, minScope: string) => ({
    scope: result.scope,
    expiresIn: result.expiresIn,
    connection: result.connection,
    exchangedAt: result.exchangedAt,
    minScope,
  }),
}));

// Mock fetch for Google Calendar API
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

const MOCK_TOKEN_SUCCESS = {
  token: "google-access-token",
  scope: "https://www.googleapis.com/auth/calendar.readonly",
  expiresIn: 3600,
  connection: "google-oauth2",
  exchangedAt: "2026-04-03T12:00:00.000Z",
};

const MOCK_CALENDAR_EVENTS = {
  items: [
    {
      summary: "Team Standup",
      start: { dateTime: "2026-04-03T09:00:00Z" },
      end: { dateTime: "2026-04-03T09:30:00Z" },
    },
  ],
};

describe("calendar tools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("checkCalendar", () => {
    it("AC-3: should include _tokenMeta in result on successful execution", async () => {
      // Arrange
      mockExchangeToken.mockResolvedValue(MOCK_TOKEN_SUCCESS);
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => MOCK_CALENDAR_EVENTS,
      });

      // Act
      const result = await checkCalendar.execute(
        { date: "2026-04-03" },
        { toolCallId: "test", messages: [], abortSignal: undefined as unknown as AbortSignal }
      );

      // Assert — _tokenMeta must be present
      expect(result).toHaveProperty("_tokenMeta");
    });

    it("AC-3: _tokenMeta should contain scope, expiresIn, connection, exchangedAt, and minScope", async () => {
      // Arrange
      mockExchangeToken.mockResolvedValue(MOCK_TOKEN_SUCCESS);
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => MOCK_CALENDAR_EVENTS,
      });

      // Act
      const result = await checkCalendar.execute(
        { date: "2026-04-03" },
        { toolCallId: "test", messages: [], abortSignal: undefined as unknown as AbortSignal }
      );

      // Assert — each required sub-field
      const meta = (result as Record<string, unknown>)["_tokenMeta"] as Record<string, unknown>;
      expect(meta).toHaveProperty("scope");
      expect(meta).toHaveProperty("expiresIn");
      expect(meta).toHaveProperty("connection");
      expect(meta).toHaveProperty("exchangedAt");
      expect(meta).toHaveProperty("minScope");
    });

    it("AC-3: _tokenMeta values should match the enriched token exchange response", async () => {
      // Arrange
      mockExchangeToken.mockResolvedValue(MOCK_TOKEN_SUCCESS);
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => MOCK_CALENDAR_EVENTS,
      });

      // Act
      const result = await checkCalendar.execute(
        { date: "2026-04-03" },
        { toolCallId: "test", messages: [], abortSignal: undefined as unknown as AbortSignal }
      );

      // Assert — values flow from token exchange
      const meta = (result as Record<string, unknown>)["_tokenMeta"] as Record<string, unknown>;
      expect(meta.scope).toBe(MOCK_TOKEN_SUCCESS.scope);
      expect(meta.expiresIn).toBe(MOCK_TOKEN_SUCCESS.expiresIn);
      expect(meta.connection).toBe(MOCK_TOKEN_SUCCESS.connection);
      expect(meta.exchangedAt).toBe(MOCK_TOKEN_SUCCESS.exchangedAt);
    });

    it("AC-3: _tokenMeta.minScope should come from TOOL_SCOPE_CONFIG", async () => {
      // Arrange
      mockExchangeToken.mockResolvedValue(MOCK_TOKEN_SUCCESS);
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => MOCK_CALENDAR_EVENTS,
      });

      // Act
      const result = await checkCalendar.execute(
        { date: "2026-04-03" },
        { toolCallId: "test", messages: [], abortSignal: undefined as unknown as AbortSignal }
      );

      // Assert
      const meta = (result as Record<string, unknown>)["_tokenMeta"] as Record<string, unknown>;
      expect(meta.minScope).toBe("calendar.readonly");
    });

    it("AC-3: error result from token exchange should NOT include _tokenMeta", async () => {
      // Arrange — token exchange fails
      mockExchangeToken.mockResolvedValue({ error: "access_denied" });

      // Act
      const result = await checkCalendar.execute(
        { date: "2026-04-03" },
        { toolCallId: "test", messages: [], abortSignal: undefined as unknown as AbortSignal }
      );

      // Assert
      expect(result).not.toHaveProperty("_tokenMeta");
      expect(result).toHaveProperty("error");
    });

    it("AC-3: error result from Calendar API should NOT include _tokenMeta", async () => {
      // Arrange — token exchange succeeds but Calendar API fails
      mockExchangeToken.mockResolvedValue(MOCK_TOKEN_SUCCESS);
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
      });

      // Act
      const result = await checkCalendar.execute(
        { date: "2026-04-03" },
        { toolCallId: "test", messages: [], abortSignal: undefined as unknown as AbortSignal }
      );

      // Assert
      expect(result).not.toHaveProperty("_tokenMeta");
    });
  });

  describe("createCalendarEvent", () => {
    const eventInput = {
      summary: "Meeting with Acme",
      startDateTime: "2026-04-07T10:00:00-05:00",
      endDateTime: "2026-04-07T11:00:00-05:00",
    };

    const MOCK_CREATED_EVENT = {
      id: "event-123",
      summary: "Meeting with Acme",
      start: { dateTime: "2026-04-07T10:00:00-05:00" },
      end: { dateTime: "2026-04-07T11:00:00-05:00" },
      htmlLink: "https://calendar.google.com/event?eid=event-123",
    };

    it("should create an event and return success with _tokenMeta", async () => {
      mockExchangeToken.mockResolvedValue(MOCK_TOKEN_SUCCESS);
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => MOCK_CREATED_EVENT,
      });

      const result = await createCalendarEvent.execute(
        eventInput,
        { toolCallId: "test", messages: [], abortSignal: undefined as unknown as AbortSignal }
      );

      expect(result).toHaveProperty("success", true);
      expect(result).toHaveProperty("eventId", "event-123");
      expect(result).toHaveProperty("_tokenMeta");
    });

    it("should send POST to Google Calendar API with correct body", async () => {
      mockExchangeToken.mockResolvedValue(MOCK_TOKEN_SUCCESS);
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => MOCK_CREATED_EVENT,
      });

      await createCalendarEvent.execute(
        { ...eventInput, attendees: ["bob@example.com"], description: "Discuss deal" },
        { toolCallId: "test", messages: [], abortSignal: undefined as unknown as AbortSignal }
      );

      expect(mockFetch).toHaveBeenCalledWith(
        "https://www.googleapis.com/calendar/v3/calendars/primary/events",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            Authorization: `Bearer ${MOCK_TOKEN_SUCCESS.token}`,
          }),
        })
      );

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.summary).toBe("Meeting with Acme");
      expect(body.attendees).toEqual([{ email: "bob@example.com" }]);
      expect(body.description).toBe("Discuss deal");
    });

    it("should return error when token exchange fails", async () => {
      mockExchangeToken.mockResolvedValue({ error: "access_denied" });

      const result = await createCalendarEvent.execute(
        eventInput,
        { toolCallId: "test", messages: [], abortSignal: undefined as unknown as AbortSignal }
      );

      expect(result).toHaveProperty("error");
      expect(result).not.toHaveProperty("_tokenMeta");
    });

    it("should return error when Calendar API fails", async () => {
      mockExchangeToken.mockResolvedValue(MOCK_TOKEN_SUCCESS);
      mockFetch.mockResolvedValue({ ok: false, status: 403 });

      const result = await createCalendarEvent.execute(
        eventInput,
        { toolCallId: "test", messages: [], abortSignal: undefined as unknown as AbortSignal }
      );

      expect(result).toHaveProperty("error");
      expect(result).not.toHaveProperty("_tokenMeta");
    });
  });
});
