export interface AuditEntry {
  id: string;
  userId: string;
  threadId: string;
  toolName: string;
  input: Record<string, unknown>;
  result: "success" | "error";
  errorMessage?: string;
  durationMs?: number;
  timestamp: string;
}
