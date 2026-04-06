export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: number;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

export async function mcpCall(
  method: string,
  params: unknown,
  apiKey: string,
  timeoutMs?: number,
  externalSignal?: AbortSignal
): Promise<JsonRpcResponse> {
  const timeoutSignal = AbortSignal.timeout(timeoutMs ?? 55000);
  const signal = externalSignal
    ? AbortSignal.any([timeoutSignal, externalSignal])
    : timeoutSignal;

  const response = await fetch("/api/mcp", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method,
      params,
      id: Math.floor(Math.random() * 2 ** 31),
    }),
    signal,
  });

  if (!response.ok) {
    throw new Error(`MCP request failed with status ${response.status}`);
  }

  const contentType = response.headers.get("content-type") ?? "";

  // Server may respond with JSON directly or SSE stream
  if (contentType.includes("text/event-stream")) {
    const text = await response.text();
    // Extract the last JSON-RPC data line from SSE events
    let lastData: string | undefined;
    for (const line of text.split("\n")) {
      if (line.startsWith("data: ")) {
        lastData = line.slice(6);
      }
    }
    if (!lastData) {
      throw new Error("No data received from MCP server");
    }
    return JSON.parse(lastData) as JsonRpcResponse;
  }

  return response.json() as Promise<JsonRpcResponse>;
}
