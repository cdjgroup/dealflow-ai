export type Surface = "chat" | "actions" | "mcp";

export type TrustTier = "full" | "standard" | "restricted" | "readonly";

export interface SurfacePolicy {
  surface: Surface;
  requiresApproval: boolean;
  requiresCiba: boolean;
  allowedToolCategories: string[];
}

export interface McpClient {
  id: string;
  userId: string;
  name: string;
  description?: string;
  allowedTools: string[];
  trustTier: TrustTier;
  rateLimit: number;
  apiKeyHash: string;
  apiKeyPrefix: string;
  createdAt: string;
  updatedAt: string;
  lastUsedAt?: string;
}

export interface McpClientCreateInput {
  name: string;
  description?: string;
  allowedTools?: string[];
  trustTier?: TrustTier;
  rateLimit?: number;
}
