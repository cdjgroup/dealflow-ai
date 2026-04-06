import { describe, it, expect, vi, beforeEach } from "vitest";
import type { JsonRpcResponse } from "@/lib/mcp/client";

// Mock global.fetch before importing the module under test.
// vi.stubGlobal must run before the dynamic import so the module
// captures the stubbed reference at evaluation time.
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

/** Helper to build a mock Response with headers.get() support. */
function mockResponse(ok: boolean, jsonBody: unknown, status = 200) {
  return {
    ok,
    status,
    headers: { get: (name: string) => (name === "content-type" ? "application/json" : null) },
    json: async () => jsonBody,
  };
}

// Dynamic import so the vi.stubGlobal above is in place first.
const { mcpCall } = await import("@/lib/mcp/client");

describe("mcpCall", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -----------------------------------------------------------------------
  // Happy path: correct JSON-RPC body
  // -----------------------------------------------------------------------
  it("should send correct JSON-RPC body with method, params, and jsonrpc version", async () => {
    // Arrange
    const successResponse: JsonRpcResponse = {
      jsonrpc: "2.0",
      id: 1,
      result: { ok: true },
    };
    mockFetch.mockResolvedValue(mockResponse(true, successResponse));

    // Act
    await mcpCall("tools/list", { filter: "all" }, "test-api-key");

    // Assert — inspect the body sent to fetch
    expect(mockFetch).toHaveBeenCalledOnce();
    const [_url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.jsonrpc).toBe("2.0");
    expect(body.method).toBe("tools/list");
    expect(body.params).toEqual({ filter: "all" });
    expect(typeof body.id).toBe("number");
  });

  // -----------------------------------------------------------------------
  // Happy path: correct headers
  // -----------------------------------------------------------------------
  it("should send Content-Type application/json and Authorization Bearer header", async () => {
    // Arrange
    mockFetch.mockResolvedValue(mockResponse(true, { jsonrpc: "2.0", id: 1, result: null } satisfies JsonRpcResponse));

    // Act
    await mcpCall("ping", {}, "my-secret-key");

    // Assert
    const [_url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers["Content-Type"]).toBe("application/json");
    expect(headers["Authorization"]).toBe("Bearer my-secret-key");
  });

  // -----------------------------------------------------------------------
  // Happy path: correct endpoint URL
  // -----------------------------------------------------------------------
  it("should POST to /api/mcp", async () => {
    // Arrange
    mockFetch.mockResolvedValue(mockResponse(true, { jsonrpc: "2.0", id: 1, result: "pong" } satisfies JsonRpcResponse));

    // Act
    await mcpCall("ping", {}, "key");

    // Assert
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/mcp");
    expect(init.method).toBe("POST");
  });

  // -----------------------------------------------------------------------
  // Happy path: returns parsed JSON response
  // -----------------------------------------------------------------------
  it("should return the parsed JSON response on a successful call", async () => {
    // Arrange
    const expected: JsonRpcResponse = {
      jsonrpc: "2.0",
      id: 1,
      result: { deals: ["ACME Corp"], count: 1 },
    };
    mockFetch.mockResolvedValue(mockResponse(true, expected));

    // Act
    const response = await mcpCall("crm/list-deals", {}, "api-key");

    // Assert
    expect(response).toEqual(expected);
  });

  // -----------------------------------------------------------------------
  // JSON-RPC error response: server-level error in the result
  // -----------------------------------------------------------------------
  it("should return a JSON-RPC error response when the server embeds an error object", async () => {
    // Arrange
    const errorResponse: JsonRpcResponse = {
      jsonrpc: "2.0",
      id: 1,
      error: { code: -32601, message: "Method not found" },
    };
    mockFetch.mockResolvedValue(mockResponse(true, errorResponse));

    // Act
    const response = await mcpCall("tools/unknown-method", {}, "api-key");

    // Assert — caller receives the error envelope, not a thrown exception
    expect(response).toEqual(errorResponse);
    expect(response.error).toBeDefined();
    expect(response.error?.code).toBe(-32601);
    expect(response.error?.message).toBe("Method not found");
  });

  // -----------------------------------------------------------------------
  // Edge case: JSON-RPC error with optional data field
  // -----------------------------------------------------------------------
  it("should return error response with data field when server includes it", async () => {
    // Arrange
    const errorResponse: JsonRpcResponse = {
      jsonrpc: "2.0",
      id: 1,
      error: { code: -32602, message: "Invalid params", data: { field: "method" } },
    };
    mockFetch.mockResolvedValue(mockResponse(true, errorResponse));

    // Act
    const response = await mcpCall("tools/call", { name: 42 }, "api-key");

    // Assert
    expect(response.error?.data).toEqual({ field: "method" });
  });

  // -----------------------------------------------------------------------
  // Error case: non-ok HTTP status 401
  // -----------------------------------------------------------------------
  it("should throw when the HTTP response status is 401 Unauthorized", async () => {
    // Arrange
    mockFetch.mockResolvedValue(mockResponse(false, { error: "unauthorized" }, 401));

    // Act & Assert
    await expect(mcpCall("tools/list", {}, "bad-key")).rejects.toThrow();
  });

  // -----------------------------------------------------------------------
  // Error case: non-ok HTTP status 500
  // -----------------------------------------------------------------------
  it("should throw when the HTTP response status is 500 Internal Server Error", async () => {
    // Arrange
    mockFetch.mockResolvedValue(mockResponse(false, { error: "server error" }, 500));

    // Act & Assert
    await expect(mcpCall("tools/call", { name: "listDeals" }, "api-key")).rejects.toThrow();
  });

  // -----------------------------------------------------------------------
  // Error case: network failure (fetch itself throws)
  // -----------------------------------------------------------------------
  it("should throw when fetch rejects due to a network error", async () => {
    // Arrange
    mockFetch.mockRejectedValue(new Error("Failed to fetch: network error"));

    // Act & Assert
    await expect(mcpCall("tools/list", {}, "api-key")).rejects.toThrow();
  });

  // -----------------------------------------------------------------------
  // Timeout: default of 55000ms when not specified
  // -----------------------------------------------------------------------
  it("should use a 55000ms AbortSignal timeout when timeoutMs is not specified", async () => {
    // Arrange
    const abortTimeoutSpy = vi.spyOn(AbortSignal, "timeout");
    mockFetch.mockResolvedValue(mockResponse(true, { jsonrpc: "2.0", id: 1, result: null } satisfies JsonRpcResponse));

    // Act
    await mcpCall("ping", {}, "api-key");

    // Assert
    expect(abortTimeoutSpy).toHaveBeenCalledWith(55000);
    abortTimeoutSpy.mockRestore();
  });

  // -----------------------------------------------------------------------
  // Timeout: custom timeoutMs is forwarded to AbortSignal.timeout
  // -----------------------------------------------------------------------
  it("should use the provided timeoutMs for the AbortSignal when specified", async () => {
    // Arrange
    const abortTimeoutSpy = vi.spyOn(AbortSignal, "timeout");
    mockFetch.mockResolvedValue(mockResponse(true, { jsonrpc: "2.0", id: 1, result: "ok" } satisfies JsonRpcResponse));

    // Act
    await mcpCall("tools/list", {}, "api-key", 10000);

    // Assert
    expect(abortTimeoutSpy).toHaveBeenCalledWith(10000);
    abortTimeoutSpy.mockRestore();
  });

  // -----------------------------------------------------------------------
  // Edge case: AbortSignal passed into fetch init
  // -----------------------------------------------------------------------
  it("should pass the AbortSignal as the signal option in the fetch init", async () => {
    // Arrange
    const fakeSignal = {} as AbortSignal;
    vi.spyOn(AbortSignal, "timeout").mockReturnValue(fakeSignal);
    mockFetch.mockResolvedValue(mockResponse(true, { jsonrpc: "2.0", id: 1, result: null } satisfies JsonRpcResponse));

    // Act
    await mcpCall("ping", {}, "api-key");

    // Assert
    const [_url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(init.signal).toBe(fakeSignal);

    vi.restoreAllMocks();
  });
});
