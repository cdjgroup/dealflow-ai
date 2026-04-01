import { auth0 } from "@/lib/auth0";

export default async function PermissionsPage() {
  const session = await auth0.getSession();
  const user = session?.user;

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold text-white mb-6">
        Permissions & Connected Accounts
      </h1>

      <div className="space-y-4">
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-white mb-4">
            Your Profile
          </h2>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-400">Name</span>
              <span className="text-white">{user?.name || "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Email</span>
              <span className="text-white">{user?.email || "—"}</span>
            </div>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-white mb-4">
            Connected Accounts
          </h2>
          <p className="text-sm text-slate-400 mb-4">
            The AI agent uses Auth0 Token Vault to securely access your external
            accounts. Tokens are stored encrypted by Auth0 — DealFlow AI never
            sees your passwords.
          </p>

          <div className="space-y-3">
            <div className="flex items-center justify-between bg-slate-800/50 rounded-lg px-4 py-3">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-white rounded-full flex items-center justify-center text-lg">
                  G
                </div>
                <div>
                  <div className="text-sm font-medium text-white">
                    Google (Calendar + Gmail)
                  </div>
                  <div className="text-xs text-slate-500">
                    calendar.readonly, calendar.freebusy, gmail.compose, gmail.readonly
                  </div>
                </div>
              </div>
              <span className="text-xs text-slate-500 bg-slate-700 px-2 py-1 rounded">
                Connected on first use
              </span>
            </div>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-white mb-4">
            How It Works
          </h2>
          <div className="space-y-3 text-sm text-slate-400">
            <div className="flex gap-3">
              <span className="text-emerald-400 font-bold">1.</span>
              <p>
                When the agent needs to access Google, it requests a token from
                Auth0 Token Vault using your refresh token.
              </p>
            </div>
            <div className="flex gap-3">
              <span className="text-emerald-400 font-bold">2.</span>
              <p>
                If you haven&apos;t connected Google yet, a consent popup appears
                asking you to authorize specific scopes.
              </p>
            </div>
            <div className="flex gap-3">
              <span className="text-emerald-400 font-bold">3.</span>
              <p>
                Auth0 stores the OAuth tokens securely. The agent only receives
                short-lived access tokens, never your credentials.
              </p>
            </div>
            <div className="flex gap-3">
              <span className="text-emerald-400 font-bold">4.</span>
              <p>
                Emails are always saved as drafts — the agent never sends
                anything without your review.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
