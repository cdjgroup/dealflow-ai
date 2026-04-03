import { auth0, getUser } from "@/lib/auth0";
import { redirect } from "next/navigation";
import { getActions } from "@/lib/data/actions";
import { ActionList } from "@/components/action-list";

export default async function ActionsPage() {
  const session = await auth0.getSession();
  if (!session) redirect("/auth/login?returnTo=/dashboard/actions");

  const user = await getUser();
  if (!user?.sub) redirect("/auth/login?returnTo=/dashboard/actions");

  const actions = await getActions(user.sub);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Action Center</h1>
        <p className="text-sm text-muted-foreground">
          AI-suggested next steps for your deals. Review, edit, and approve
          actions before they execute.
        </p>
      </div>

      {actions.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-8 text-center text-muted-foreground">
          <p className="mb-2">No suggested actions yet.</p>
          <p className="text-xs">
            Seed demo data from the dashboard or ask the AI to analyze your
            pipeline to generate suggestions.
          </p>
        </div>
      ) : (
        <ActionList initialActions={actions} />
      )}
    </div>
  );
}
