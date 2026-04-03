import { auth0 } from "@/lib/auth0";
import { redirect } from "next/navigation";
import { Nav } from "@/components/nav";
import { DashboardProviders } from "@/components/dashboard-providers";

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

  return (
    <DashboardProviders userId={userId}>
      <div className="min-h-screen bg-background text-foreground">
        <Nav userName={session.user?.name || session.user?.email} />
        <main className="max-w-7xl mx-auto px-4 py-6">
          {children}
        </main>
      </div>
    </DashboardProviders>
  );
}
