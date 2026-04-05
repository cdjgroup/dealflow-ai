const PII_FIELDS = new Set(["to", "body", "text", "subject", "email", "phone", "name"]);

function redactParams(params: Record<string, unknown>): Record<string, unknown> {
  const redacted: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(params)) {
    if (PII_FIELDS.has(key) && typeof value === "string") {
      redacted[key] = value.length > 4
        ? `${value.slice(0, 2)}***${value.slice(-2)}`
        : "***";
    } else {
      redacted[key] = value;
    }
  }
  return redacted;
}

export function logToolExecution(entry: {
  userId: string;
  tool: string;
  params: Record<string, unknown>;
  success: boolean;
  durationMs: number;
  error?: string;
}): void {
  const record = {
    type: "tool_execution",
    timestamp: new Date().toISOString(),
    ...entry,
    params: redactParams(entry.params),
  };
  console.log(JSON.stringify(record));
}
