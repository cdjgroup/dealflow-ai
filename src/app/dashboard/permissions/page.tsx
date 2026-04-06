import { auth0, getUser } from "@/lib/auth0";
import { redirect } from "next/navigation";
import { getUserSettings, getTrustStats } from "@/lib/data/settings";
import { getDisabledConnections } from "@/lib/data/connections";
import { IntegrationPermissions } from "@/components/integration-permissions";
import { CapabilityMatrix } from "@/components/capability-matrix";
import { ActivityTimeline } from "@/components/activity-timeline";
import { getAuditLog } from "@/lib/data/audit";

export default async function PermissionsPage() {
  const session = await auth0.getSession();
  if (!session) redirect("/auth/login?returnTo=/dashboard/permissions");

  const user = await getUser();
  if (!user?.sub) redirect("/auth/login?returnTo=/dashboard/permissions");

  const [settings, recentActivity, disabledConnections, trustStats] = await Promise.all([
    getUserSettings(user.sub),
    getAuditLog(user.sub, { limit: 20 }),
    getDisabledConnections(user.sub),
    getTrustStats(user.sub),
  ]);

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">
          Permissions & Connections
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage what the AI agent can access and how it behaves for each connection.
        </p>
      </div>

      {/* Unified integration cards with connection status + toggles + trust */}
      <IntegrationPermissions
        initialSettings={settings}
        disabledConnections={disabledConnections}
        trustStats={trustStats}
      />

      {/* Tool reference matrix — collapsed */}
      <details className="bg-card border border-border rounded-lg">
        <summary className="p-4 cursor-pointer select-none flex items-center justify-between [&::-webkit-details-marker]:hidden">
          <div>
            <h2 className="text-sm font-semibold text-foreground">
              Tool Reference
            </h2>
            <span className="text-xs text-muted-foreground">
              All 12 tools with access levels, data sources, and guardrails
            </span>
          </div>
          <span className="text-xs text-muted-foreground" aria-hidden="true">&#x25BC;</span>
        </summary>
        <div className="px-4 pb-4">
          <CapabilityMatrix settings={settings} />
        </div>
      </details>

      {/* MCP Server for External AI Agents */}
      <div className="bg-card border border-border rounded-lg p-6">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-semibold text-foreground">
            MCP Server
          </h2>
          <a
            href="/dashboard/mcp"
            className="text-xs text-primary hover:underline focus-visible:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-sm"
          >
            Open MCP Explorer &rarr;
          </a>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          External AI agents can discover and use DealFlow&apos;s tools via the
          Model Context Protocol. Auth required, read-only tools only.
        </p>
        <div className="rounded-lg bg-secondary/50 px-4 py-3 space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-medium text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-2 py-0.5">LIVE</span>
            <code className="text-xs text-foreground font-mono">/api/mcp</code>
          </div>
          <p className="text-[10px] text-muted-foreground">
            Compatible with Claude Desktop, Cursor, OpenClaw, and any MCP client.
            Bearer token authentication via Auth0.
          </p>
        </div>
      </div>

      {/* Recent activity — collapsed, with audit log link always visible */}
      <div className="relative bg-card border border-border rounded-lg">
        <a
          href="/dashboard/audit"
          className="absolute top-4 right-10 text-xs text-primary hover:underline focus-visible:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-sm z-10"
        >
          Full audit log &rarr;
        </a>
        <details>
          <summary className="p-4 cursor-pointer select-none flex items-center justify-between [&::-webkit-details-marker]:hidden">
            <div>
              <h2 className="text-sm font-semibold text-foreground">
                Recent Activity
              </h2>
              <span className="text-xs text-muted-foreground">
                Last 20 agent actions
              </span>
            </div>
            <span className="text-xs text-muted-foreground" aria-hidden="true">&#x25BC;</span>
          </summary>
          <div className="px-4 pb-4">
            <ActivityTimeline entries={recentActivity} />
          </div>
        </details>
      </div>

    </div>
  );
}
