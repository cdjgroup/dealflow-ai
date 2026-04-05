import { auth0 } from "@/lib/auth0";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth0";
import { getUserSettings } from "@/lib/data/settings";
import { McpExplorer } from "@/components/mcp-explorer";

export default async function McpPage() {
  const session = await auth0.getSession();
  if (!session) redirect("/auth/login?returnTo=/dashboard/mcp");

  const user = await getUser();
  const settings = user ? await getUserSettings(user.sub) : null;

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">MCP Server</h1>
        <p className="text-sm text-muted-foreground mt-1">
          External AI agents can discover and use DealFlow AI&apos;s tools via the
          Model Context Protocol (MCP).
        </p>
      </div>

      <McpExplorer />
    </div>
  );
}
