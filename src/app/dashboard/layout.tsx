import { auth0 } from "@/lib/auth0";
import { redirect } from "next/navigation";
import { Nav } from "@/components/nav";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth0.getSession();
  if (!session) {
    redirect("/auth/login?returnTo=/dashboard");
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Nav userName={session.user?.name || session.user?.email} />
      <main className="max-w-7xl mx-auto px-4 py-6">{children}</main>
    </div>
  );
}
