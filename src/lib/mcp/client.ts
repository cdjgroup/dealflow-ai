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

  return response.json() as Promise<JsonRpcResponse>;
}
