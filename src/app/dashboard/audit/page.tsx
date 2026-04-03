import { auth0, getUser } from "@/lib/auth0";
import { redirect } from "next/navigation";
import { getAuditLog } from "@/lib/data/audit";
import { AuditPageClient } from "@/components/audit-page-client";

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

      <AuditPageClient initialLog={log} />
    </div>
  );
}
