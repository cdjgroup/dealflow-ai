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
  parameterConstraints?: Record<string, ParameterConstraint[]>;
  createdAt: string;
  updatedAt: string;
  lastUsedAt?: string;
}

export interface ParameterConstraint {
  param: string;         // Parameter name to constrain (e.g., "query")
  pattern: string;       // Regex pattern the parameter value must match
  description?: string;  // Human-readable explanation (e.g., "Only acme.com emails")
}

export interface McpClientCreateInput {
  name: string;
  description?: string;
  allowedTools?: string[];
  trustTier?: TrustTier;
  rateLimit?: number;
  parameterConstraints?: Record<string, ParameterConstraint[]>;
}
