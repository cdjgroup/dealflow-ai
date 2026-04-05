import { auth0 } from "@/lib/auth0";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth0";
import { getUserSettings } from "@/lib/data/settings";
import { McpExplorer } from "@/components/mcp-explorer";
import { McpPlayground } from "@/components/mcp-playground";

export default async function McpPage() {
  const session = await auth0.getSession();
  if (!session) redirect("/auth/login?returnTo=/dashboard/mcp");

  const user = await getUser();
  const settings = user ? await getUserSettings(user.sub) : null;

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">MCP</h1>
        <p className="text-sm text-muted-foreground mt-1">
          External AI agents can discover and use DealFlow&apos;s tools via the
          Model Context Protocol. Test tools interactively in the Playground below.
        </p>
      </div>

      <McpExplorer />

      <div className="border-t border-border pt-6">
        <h2 className="text-xl font-bold text-foreground mb-1">Playground</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Simulate an external AI agent calling your MCP tools. Write tools require
          Guardian push approval on your phone.
        </p>
        <McpPlayground />
      </div>
    </div>
  );
}
