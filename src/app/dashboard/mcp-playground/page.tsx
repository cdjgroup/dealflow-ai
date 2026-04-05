import { auth0 } from "@/lib/auth0";
import { redirect } from "next/navigation";
import { McpPlayground } from "@/components/mcp-playground";

export default async function McpPlaygroundPage() {
  const session = await auth0.getSession();
  if (!session) redirect("/auth/login?returnTo=/dashboard/mcp-playground");

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">MCP Playground</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Simulate an external AI agent calling your MCP tools. Write tools require
          Guardian push approval on your phone.
        </p>
      </div>

      <McpPlayground />
    </div>
  );
}
