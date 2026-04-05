import { TOOL_CATEGORIES } from "@/lib/tools/capability-filter";
import { WRITE_TOOLS } from "@/lib/constants/tools";
import type { UserSettings } from "@/lib/types/settings";

export type SurfaceName = "chat" | "actionCenter" | "mcp";
export type CapabilityCategory = "crmRead" | "crmWrite" | "calendar" | "gmail" | "slack";

export interface SurfacePolicy {
  name: SurfaceName;
  allowedCategories: CapabilityCategory[];
  accessLevel: "read" | "write" | "full";
  rationale: string;
  requiresApproval: boolean;
  requiresSession: boolean;
}

/**
 * Surface Policy Registry — single source of truth for what each surface allows.
 *
 * Each surface filters the tool set by its trust properties. The security
 * constraints adapt per surface: if a surface can't support human consent,
 * write access is revoked. This is the architectural decision encoded in code.
 */
export const SURFACE_POLICIES: Record<SurfaceName, SurfacePolicy> = {
  chat: {
    name: "chat",
    allowedCategories: ["crmRead", "crmWrite", "calendar", "gmail", "slack"],
    accessLevel: "full",
    rationale:
      "Interactive session with SDK approval flow and CIBA step-up. " +
      "User is present to approve writes and high-value operations.",
    requiresApproval: true,
    requiresSession: true,
  },
  actionCenter: {
    name: "actionCenter",
    allowedCategories: ["gmail", "calendar", "slack"],
    accessLevel: "write",
    rationale:
      "Pre-approved actions only. User reviewed and explicitly approved " +
      "each action in the UI before execution. CRM operations excluded — " +
      "Action Center handles external communications, not data mutations.",
    requiresApproval: false,
    requiresSession: true,
  },
  mcp: {
    name: "mcp",
    allowedCategories: ["crmRead", "calendar", "gmail", "slack"],
    accessLevel: "read",
    rationale:
      "No interactive approval UI in the MCP protocol. Bearer token auth only. " +
      "Restricted to read-only operations — if the surface can't support " +
      "human consent, write access is revoked.",
    requiresApproval: false,
    requiresSession: false,
  },
};

const SCOPE_MAP: Record<CapabilityCategory, string> = {
  crmRead: "crm:read",
  crmWrite: "crm:write",
  calendar: "calendar:read",
  gmail: "gmail:read",
  slack: "slack:read",
};

const REVERSE_SCOPE_MAP: Record<string, CapabilityCategory> = Object.fromEntries(
  Object.entries(SCOPE_MAP).map(([k, v]) => [v, k as CapabilityCategory])
);

export function categoryToScope(category: CapabilityCategory): string {
  return SCOPE_MAP[category];
}

export function scopeToCategory(scope: string): CapabilityCategory | undefined {
  return REVERSE_SCOPE_MAP[scope];
}

/**
 * Resolve a surface policy to concrete tool names by joining
 * allowedCategories with the TOOL_CATEGORIES mapping.
 */
export function getToolNamesForSurface(surface: SurfaceName): string[] {
  const policy = SURFACE_POLICIES[surface];
  const allowed = new Set<string>(policy.allowedCategories);

  const tools: string[] = [];
  for (const [toolName, category] of Object.entries(TOOL_CATEGORIES)) {
    if (!allowed.has(category)) continue;
    // For read-only surfaces, exclude write/mutation tools
    if (policy.accessLevel === "read" && WRITE_TOOLS.has(toolName)) continue;
    tools.push(toolName);
  }
  return tools;
}

/**
 * Resolve scope strings to concrete READ-ONLY tool names. Write tools
 * are always excluded because scopes are only used for MCP (read-only
 * surface). If a future surface needs write scopes, add a separate function.
 */
export function getReadToolNamesForScopes(scopes: string[]): string[] {
  const categories = scopes
    .map(scopeToCategory)
    .filter((c): c is CapabilityCategory => c !== undefined);
  const allowed = new Set<string>(categories);

  const tools: string[] = [];
  for (const [toolName, category] of Object.entries(TOOL_CATEGORIES)) {
    if (!allowed.has(category)) continue;
    if (WRITE_TOOLS.has(toolName)) continue;
    tools.push(toolName);
  }
  return tools;
}

/**
 * Derive MCP scopes for a given user + optional client ID.
 *
 * Resolution order:
 * 1. If mcpClients[clientId] exists, use its allowedCategories
 *    (intersected with MCP policy — client can't exceed surface permissions)
 * 2. Otherwise, use default MCP surface policy categories
 *
 * Per-client policy: Different MCP clients can have different access levels.
 * E.g., Cursor IDE gets CRM + calendar, while a CI pipeline gets CRM only.
 * If a client specifies categories outside the MCP policy (e.g., crmWrite),
 * they are silently dropped — the surface policy is the ceiling.
 */
export function deriveMcpScopes(
  userSettings: UserSettings,
  clientId?: string
): string[] {
  const mcpPolicy = SURFACE_POLICIES.mcp;
  const mcpAllowed = new Set<CapabilityCategory>(mcpPolicy.allowedCategories);

  // Check for per-client override
  const clientPolicy = clientId
    ? userSettings.mcpClients?.[clientId]
    : undefined;

  // Start from client policy or default MCP categories
  const baseCategories = clientPolicy
    ? clientPolicy.allowedCategories.filter((c) => mcpAllowed.has(c))
    : mcpPolicy.allowedCategories;

  // Respect user capability toggles — if a user disables a category in
  // their settings, MCP clients also lose access (consistency across surfaces)
  const categories = baseCategories.filter((c) => {
    const capKey = c as keyof typeof userSettings.capabilities;
    return userSettings.capabilities[capKey] !== false;
  });

  return categories.map(categoryToScope);
}
