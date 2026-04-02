import { auth0, getUser } from "@/lib/auth0";
import { redirect } from "next/navigation";
import { getAuditLog } from "@/lib/data/audit";

const statusColors: Record<string, string> = {
  success: "text-emerald-400",
  error: "text-red-400",
};

const toolIcons: Record<string, string> = {
  checkCalendar: "📅",
  draftEmail: "✉️",
  searchEmails: "🔍",
  listDeals: "📊",
  getDealDetails: "📋",
  searchContacts: "👤",
  createDeal: "➕",
  updateDeal: "✏️",
  createContact: "👥",
  logActivity: "📝",
  listSlackChannels: "💬",
  sendSlackMessage: "💬",
};

export default async function AuditPage() {
  const session = await auth0.getSession();
  if (!session) redirect("/auth/login?returnTo=/dashboard/audit");

  const user = await getUser();
  if (!user?.sub) redirect("/auth/login?returnTo=/dashboard/audit");

  const log = await getAuditLog(user.sub, { limit: 100 });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Audit Log</h1>
        <p className="text-sm text-muted-foreground">
          Every action the AI agent performs is logged here for transparency and
          accountability.
        </p>
      </div>

      {log.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-8 text-center text-muted-foreground">
          No agent actions recorded yet. Start a conversation to see activity
          here.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm" aria-label="Agent audit log">
            <thead className="border-b border-border bg-muted/50">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Time</th>
                <th className="px-4 py-3 text-left font-medium">Tool</th>
                <th className="px-4 py-3 text-left font-medium">Parameters</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
                <th className="px-4 py-3 text-right font-medium">Duration</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {log.map((entry) => (
                <tr key={entry.id} className="hover:bg-muted/30">
                  <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                    {new Date(entry.timestamp).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="mr-1">
                      {toolIcons[entry.toolName] || "🔧"}
                    </span>
                    {entry.toolName}
                  </td>
                  <td className="px-4 py-3 max-w-xs truncate text-muted-foreground">
                    {Object.entries(entry.input)
                      .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`)
                      .join(", ")}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className={statusColors[entry.result] || ""}>
                      {entry.result}
                    </span>
                    {entry.errorMessage && (
                      <span className="ml-2 text-xs text-red-400">
                        {entry.errorMessage}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap text-muted-foreground">
                    {entry.durationMs ? `${entry.durationMs}ms` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
