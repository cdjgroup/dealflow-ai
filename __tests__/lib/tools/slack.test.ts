import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock token exchange before importing tools
vi.mock("@/lib/token-exchange", () => ({
  exchangeToken: vi.fn(),
  sanitizeApiError: vi.fn(
    (status: number, label: string) => `${label}: request failed (status ${status})`
  ),
}));

import { listSlackChannels, sendSlackMessage } from "@/lib/tools/slack";
import { exchangeToken } from "@/lib/token-exchange";

const mockExchangeToken = vi.mocked(exchangeToken);

// Helper to create a mock Response
function mockFetchResponse(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => body,
  } as Response;
}

describe("listSlackChannels", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn());
  });

  it("returns error when token exchange fails", async () => {
    mockExchangeToken.mockResolvedValue({ error: "access_denied" });

    const result = await listSlackChannels.execute({}, { toolCallId: "1", messages: [] });

    expect(result).toMatchObject({
      error: "Slack not connected",
      details: "access_denied",
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("returns error on HTTP failure", async () => {
    mockExchangeToken.mockResolvedValue({ token: "xoxb-test" });
    vi.mocked(fetch).mockResolvedValue(mockFetchResponse(null, false, 401));

    const result = await listSlackChannels.execute({}, { toolCallId: "1", messages: [] });

    expect(result).toMatchObject({
      error: expect.stringContaining("Slack channels"),
    });
  });

  it("returns error on Slack API error", async () => {
    mockExchangeToken.mockResolvedValue({ token: "xoxb-test" });
    vi.mocked(fetch).mockResolvedValue(
      mockFetchResponse({ ok: false, error: "invalid_auth" })
    );

    const result = await listSlackChannels.execute({}, { toolCallId: "1", messages: [] });

    expect(result).toMatchObject({
      error: "Slack API error: invalid_auth",
    });
  });

  it("returns channels on success", async () => {
    mockExchangeToken.mockResolvedValue({ token: "xoxb-test" });
    vi.mocked(fetch).mockResolvedValue(
      mockFetchResponse({
        ok: true,
        channels: [
          { id: "C123", name: "general", num_members: 50 },
          { id: "C456", name: "sales", num_members: 10 },
        ],
      })
    );

    const result = await listSlackChannels.execute({}, { toolCallId: "1", messages: [] });

    expect(result).toMatchObject({
      channelCount: 2,
      channels: [
        { id: "C123", name: "general", members: 50 },
        { id: "C456", name: "sales", members: 10 },
      ],
    });
  });
});

describe("sendSlackMessage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn());
  });

  it("returns error when token exchange fails", async () => {
    mockExchangeToken.mockResolvedValue({ error: "access_denied" });

    const result = await sendSlackMessage.execute(
      { channel: "general", text: "hello" },
      { toolCallId: "1", messages: [] }
    );

    expect(result).toMatchObject({
      error: "Slack not connected",
    });
  });

  it("skips channel lookup when channel starts with C", async () => {
    mockExchangeToken.mockResolvedValue({ token: "xoxb-test" });
    vi.mocked(fetch).mockResolvedValue(
      mockFetchResponse({ ok: true, channel: "C123", ts: "1234.5678" })
    );

    const result = await sendSlackMessage.execute(
      { channel: "C123", text: "hello" },
      { toolCallId: "1", messages: [] }
    );

    // Should only call fetch once (postMessage), not twice (list + postMessage)
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ success: true });
  });

  it("returns error when channel lookup HTTP fails", async () => {
    mockExchangeToken.mockResolvedValue({ token: "xoxb-test" });
    vi.mocked(fetch).mockResolvedValue(mockFetchResponse(null, false, 500));

    const result = await sendSlackMessage.execute(
      { channel: "general", text: "hello" },
      { toolCallId: "1", messages: [] }
    );

    expect(result).toMatchObject({
      error: expect.stringContaining("Slack channel lookup"),
    });
  });

  it("returns error when channel lookup Slack API fails", async () => {
    mockExchangeToken.mockResolvedValue({ token: "xoxb-test" });
    vi.mocked(fetch).mockResolvedValue(
      mockFetchResponse({ ok: false, error: "token_revoked" })
    );

    const result = await sendSlackMessage.execute(
      { channel: "general", text: "hello" },
      { toolCallId: "1", messages: [] }
    );

    expect(result).toMatchObject({
      error: expect.stringContaining("channel lookup: token_revoked"),
    });
  });

  it("returns error when channel not found", async () => {
    mockExchangeToken.mockResolvedValue({ token: "xoxb-test" });
    vi.mocked(fetch).mockResolvedValue(
      mockFetchResponse({ ok: true, channels: [{ id: "C999", name: "other" }] })
    );

    const result = await sendSlackMessage.execute(
      { channel: "nonexistent", text: "hello" },
      { toolCallId: "1", messages: [] }
    );

    expect(result).toMatchObject({
      error: expect.stringContaining('"nonexistent" not found'),
    });
  });

  it("resolves channel name and sends message", async () => {
    mockExchangeToken.mockResolvedValue({ token: "xoxb-test" });
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        mockFetchResponse({
          ok: true,
          channels: [{ id: "C123", name: "general" }],
        })
      )
      .mockResolvedValueOnce(
        mockFetchResponse({ ok: true, channel: "C123", ts: "1234.5678" })
      );

    const result = await sendSlackMessage.execute(
      { channel: "general", text: "hello team" },
      { toolCallId: "1", messages: [] }
    );

    expect(result).toMatchObject({ success: true, channel: "C123" });
    // Second call should be postMessage with resolved channel ID
    const postCall = vi.mocked(fetch).mock.calls[1];
    expect(postCall[0]).toBe("https://slack.com/api/chat.postMessage");
    expect(JSON.parse(postCall[1]!.body as string)).toMatchObject({
      channel: "C123",
      text: "hello team",
    });
  });

  it("returns error when postMessage HTTP fails", async () => {
    mockExchangeToken.mockResolvedValue({ token: "xoxb-test" });
    vi.mocked(fetch).mockResolvedValue(mockFetchResponse(null, false, 429));

    const result = await sendSlackMessage.execute(
      { channel: "C123", text: "hello" },
      { toolCallId: "1", messages: [] }
    );

    expect(result).toMatchObject({
      error: expect.stringContaining("Slack message"),
    });
  });

  it("returns friendly error for known Slack errors", async () => {
    mockExchangeToken.mockResolvedValue({ token: "xoxb-test" });
    vi.mocked(fetch).mockResolvedValue(
      mockFetchResponse({ ok: false, error: "not_in_channel" })
    );

    const result = await sendSlackMessage.execute(
      { channel: "C123", text: "hello" },
      { toolCallId: "1", messages: [] }
    );

    expect(result).toMatchObject({
      error: expect.stringContaining("not in channel"),
    });
  });

  it("strips # prefix when resolving channel name", async () => {
    mockExchangeToken.mockResolvedValue({ token: "xoxb-test" });
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        mockFetchResponse({
          ok: true,
          channels: [{ id: "C123", name: "general" }],
        })
      )
      .mockResolvedValueOnce(
        mockFetchResponse({ ok: true, channel: "C123", ts: "1234.5678" })
      );

    const result = await sendSlackMessage.execute(
      { channel: "#general", text: "hello" },
      { toolCallId: "1", messages: [] }
    );

    expect(result).toMatchObject({ success: true });
  });
});
