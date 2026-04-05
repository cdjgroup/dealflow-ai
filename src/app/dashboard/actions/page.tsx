import { auth0, getUser } from "@/lib/auth0";
import { redirect } from "next/navigation";
import { getActions } from "@/lib/data/actions";
import { getUserSettings } from "@/lib/data/settings";
import { ActionList } from "@/components/action-list";
import { SchedulePanel } from "@/components/schedule-panel";

export default async function ActionsPage() {
  const session = await auth0.getSession();
  if (!session) redirect("/auth/login?returnTo=/dashboard/actions");

  const user = await getUser();
  if (!user?.sub) redirect("/auth/login?returnTo=/dashboard/actions");

  const [actions, settings] = await Promise.all([
    getActions(user.sub),
    getUserSettings(user.sub),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Action Center</h1>
        <p className="text-sm text-muted-foreground">
          AI-suggested next steps for your deals. Review, edit, and approve
          actions before they execute.
        </p>
      </div>

      <SchedulePanel initialSchedule={settings.schedule} />

      <ActionList initialActions={actions} />
    </div>
  );
}
