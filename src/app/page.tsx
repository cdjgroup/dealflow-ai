import { auth0 } from "@/lib/auth0";
import { redirect } from "next/navigation";
import Link from "next/link";

export default async function Home() {
  const session = await auth0.getSession();
  if (session) {
    redirect("/dashboard");
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
      <div className="text-center max-w-2xl px-6">
        <div className="mb-8">
          <div className="inline-flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-4 py-1.5 text-sm text-emerald-400 mb-6">
            <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
            Powered by Auth0 Token Vault
          </div>
          <h1 className="text-5xl font-bold text-white mb-4 tracking-tight">
            DealFlow AI
          </h1>
          <p className="text-xl text-slate-400 mb-8">
            Your AI sales agent that checks calendars, drafts emails, and
            manages your pipeline — securely authenticated with Auth0.
          </p>
        </div>
        <Link
          href="/auth/login?returnTo=/dashboard"
          className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold px-8 py-3 rounded-lg text-lg transition-colors"
        >
          Sign In to Get Started
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13 7l5 5m0 0l-5 5m5-5H6"
            />
          </svg>
        </Link>
        <div className="mt-12 grid grid-cols-3 gap-6 text-left">
          {[
            {
              title: "Calendar",
              desc: "Check your availability via Google Calendar",
            },
            {
              title: "Email",
              desc: "Draft follow-ups in Gmail — never auto-sends",
            },
            {
              title: "Pipeline",
              desc: "Manage deals, contacts, and activities",
            },
          ].map((feature) => (
            <div
              key={feature.title}
              className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-4"
            >
              <h3 className="text-white font-semibold mb-1">{feature.title}</h3>
              <p className="text-sm text-slate-400">{feature.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
