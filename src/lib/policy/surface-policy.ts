/**
 * Surface policy registry — formal declarations of what each surface allows.
 *
 * Currently used for trust tier visualization in the MCP Explorer UI and
 * referenced by TRUST_TIER_TOOLS for default tool sets. Will be integrated
 * into the tool adapter pipeline when write-tool MCP support is added.
 */
import type { Surface, SurfacePolicy } from "@/lib/types/policy";

const SURFACE_POLICIES: Record<Surface, SurfacePolicy> = {
  chat: {
    surface: "chat",
    requiresApproval: true,
    requiresCiba: true,
    allowedToolCategories: ["crmRead", "crmWrite", "calendar", "gmail", "slack"],
  },
  actions: {
    surface: "actions",
    requiresApproval: true,
    requiresCiba: false,
    allowedToolCategories: ["calendar", "gmail", "slack"],
  },
  mcp: {
    surface: "mcp",
    requiresApproval: false,
    requiresCiba: false,
    allowedToolCategories: ["crmRead", "calendar", "gmail", "slack"],
  },
};

export function getSurfacePolicy(surface: Surface): SurfacePolicy {
  const policy = SURFACE_POLICIES[surface];
  if (!policy) {
    throw new Error(`Unknown surface: ${surface}`);
  }
  return policy;
}
