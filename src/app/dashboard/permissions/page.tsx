import { auth0, getUser } from "@/lib/auth0";
import { redirect } from "next/navigation";
import { getUserSettings } from "@/lib/data/settings";
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

  const [settings, recentActivity, disabledConnections] = await Promise.all([
    getUserSettings(user.sub),
    getAuditLog(user.sub, { limit: 20 }),
    getDisabledConnections(user.sub),
  ]);

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">
          Permissions & Connections
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Control what the AI agent can access. Disabled tools are hidden from the agent entirely.
        </p>
      </div>

      {/* Unified integration cards with connection status + toggles + trust */}
      <IntegrationPermissions
        initialSettings={settings}
        disabledConnections={disabledConnections}
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
          <span className="text-xs text-muted-foreground" aria-hidden="true">▼</span>
        </summary>
        <div className="px-4 pb-4">
          <CapabilityMatrix settings={settings} />
        </div>
      </details>

      {/* Recent activity — collapsed, with audit log link always visible */}
      <div className="relative bg-card border border-border rounded-lg">
        <a
          href="/dashboard/audit"
          className="absolute top-4 right-10 text-xs text-primary hover:underline z-10"
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
            <span className="text-xs text-muted-foreground" aria-hidden="true">▼</span>
          </summary>
          <div className="px-4 pb-4">
            <ActivityTimeline entries={recentActivity} />
          </div>
        </details>
      </div>
    </div>
  );
}
