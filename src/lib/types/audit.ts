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

export interface AuditFilters {
  toolName?: string;
  result?: "success" | "error";
  startDate?: string; // ISO 8601
  endDate?: string; // ISO 8601
}
