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
}
