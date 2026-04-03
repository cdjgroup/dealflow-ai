import { auth0 } from "@/lib/auth0";
import { redirect } from "next/navigation";
import { Nav } from "@/components/nav";
import { DashboardProviders } from "@/components/dashboard-providers";
import { getDeals } from "@/lib/data/crm";
import { listConversations } from "@/lib/data/conversations";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth0.getSession();
  if (!session) {
    redirect("/auth/login?returnTo=/dashboard");
  }

  const userId = session.user?.sub ?? "";

  // Lightweight server-side checks for onboarding auto-detection
  const [deals, conversations] = await Promise.all([
    getDeals(userId).catch(() => []),
    listConversations(userId, 1).catch(() => []),
  ]);

  const serverCompletions: Record<string, boolean> = {
    "check-pipeline": deals.length > 0,
    "try-chat": conversations.length > 0,
  };

  return (
    <DashboardProviders userId={userId} serverCompletions={serverCompletions}>
      <div className="min-h-screen bg-background text-foreground">
        <Nav userName={session.user?.name || session.user?.email} />
        <main className="max-w-7xl mx-auto px-4 py-6">
          {children}
        </main>
      </div>
    </DashboardProviders>
  );
}
