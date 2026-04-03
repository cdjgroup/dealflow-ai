import { auth0 } from "@/lib/auth0";
import { redirect } from "next/navigation";
import Link from "next/link";
import { LandingAnimations } from "@/components/landing-animations";

export default async function Home() {
  const session = await auth0.getSession();
  if (session) {
    redirect("/dashboard");
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center max-w-3xl px-6">
        <LandingAnimations />
      </div>
    </div>
  );
}
