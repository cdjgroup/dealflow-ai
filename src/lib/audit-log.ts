/**
 * Structured audit logging for tool executions.
 * Logs to stdout in JSON format for easy ingestion by log aggregators.
 */
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
  };
  console.log(JSON.stringify(record));
}
