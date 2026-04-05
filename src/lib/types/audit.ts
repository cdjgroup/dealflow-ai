export interface TokenMeta {
  connection: string;
  provider: string;
  requestedScope: string | null;
  grantedScope: string | null;
  expiresIn: number | null;
  apiEndpoint: string;
}

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
  tokenMeta?: TokenMeta;
  consentAction?: "auto" | "approved" | "denied" | "always-allowed";
  cibaAuthReqId?: string;
  surface?: "chat" | "mcp" | "actions";
  mcpClientId?: string;
  mcpClientName?: string;
}

export interface AuditFilters {
  toolName?: string;
  result?: "success" | "error";
  surface?: "chat" | "mcp" | "actions";
  startDate?: string; // ISO 8601
  endDate?: string; // ISO 8601
}
