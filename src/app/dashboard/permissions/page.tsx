import { auth0, getUser } from "@/lib/auth0";
import { redirect } from "next/navigation";
import { getUserSettings } from "@/lib/data/settings";
import { CapabilityToggles } from "@/components/capability-toggles";
import { RevokeButton } from "@/components/revoke-button";
import { TokenStatus } from "@/components/token-status";

export default async function PermissionsPage() {
  const session = await auth0.getSession();
  if (!session) redirect("/auth/login?returnTo=/dashboard/permissions");

  const user = await getUser();
  if (!user?.sub) redirect("/auth/login?returnTo=/dashboard/permissions");

  const settings = await getUserSettings(user.sub);

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold text-foreground">
        Permissions & Connected Accounts
      </h1>

      {/* Profile */}
      <div className="bg-card border border-border rounded-lg p-6">
        <h2 className="text-lg font-semibold text-foreground mb-4">
          Your Profile
        </h2>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Name</span>
            <span className="text-foreground">
              {session.user?.name || "—"}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Email</span>
            <span className="text-foreground">
              {session.user?.email || "—"}
            </span>
          </div>
        </div>
      </div>

      {/* Agent Capabilities (U1) */}
      <div className="bg-card border border-border rounded-lg p-6">
        <h2 className="text-lg font-semibold text-foreground mb-2">
          Agent Capabilities
        </h2>
        <p className="text-sm text-muted-foreground mb-4">
          Control which tools the AI agent can use. Disabled tools are
          completely hidden from the agent.
        </p>
        <CapabilityToggles initialSettings={settings} />
      </div>

      {/* Token Status (S4) */}
      <div className="bg-card border border-border rounded-lg p-6">
        <h2 className="text-lg font-semibold text-foreground mb-2">
          Connection Status
        </h2>
        <p className="text-sm text-muted-foreground mb-4">
          Live status of your OAuth connections via Auth0 Token Vault.
        </p>
        <TokenStatus />
      </div>

      {/* Connected Accounts (U3) */}
      <div className="bg-card border border-border rounded-lg p-6">
        <h2 className="text-lg font-semibold text-foreground mb-2">
          Connected Accounts
        </h2>
        <p className="text-sm text-muted-foreground mb-4">
          The AI agent uses Auth0 Token Vault to securely access your external
          accounts. Tokens are stored encrypted by Auth0 — DealFlow AI never
          sees your passwords.
        </p>

        <div className="space-y-3">
          <div className="flex items-center justify-between bg-secondary/50 rounded-lg px-4 py-3">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-foreground text-background rounded-full flex items-center justify-center text-lg font-medium">
                G
              </div>
              <div>
                <div className="text-sm font-medium text-foreground">
                  Google (Calendar + Gmail)
                </div>
                <div className="text-xs text-muted-foreground">
                  calendar.readonly, gmail.compose, gmail.readonly
                </div>
              </div>
            </div>
            <RevokeButton connection="google-oauth2" label="Google" />
          </div>

          <div className="flex items-center justify-between bg-secondary/50 rounded-lg px-4 py-3">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-[#4A154B] text-white rounded-full flex items-center justify-center text-lg font-bold">
                S
              </div>
              <div>
                <div className="text-sm font-medium text-foreground">
                  Slack
                </div>
                <div className="text-xs text-muted-foreground">
                  channels:read, chat:write
                </div>
              </div>
            </div>
            <RevokeButton connection="slack" label="Slack" />
          </div>
        </div>
      </div>

      {/* How It Works */}
      <div className="bg-card border border-border rounded-lg p-6">
        <h2 className="text-lg font-semibold text-foreground mb-4">
          How It Works
        </h2>
        <div className="space-y-3 text-sm text-muted-foreground">
          <div className="flex gap-3">
            <span className="text-primary font-bold">1.</span>
            <p>
              When the agent needs to access Google or Slack, it requests a
              token from Auth0 Token Vault using your refresh token.
            </p>
          </div>
          <div className="flex gap-3">
            <span className="text-primary font-bold">2.</span>
            <p>
              If you haven&apos;t connected the service yet, a consent popup
              appears asking you to authorize specific scopes.
            </p>
          </div>
          <div className="flex gap-3">
            <span className="text-primary font-bold">3.</span>
            <p>
              Auth0 stores the OAuth tokens securely. The agent only receives
              short-lived access tokens, never your credentials.
            </p>
          </div>
          <div className="flex gap-3">
            <span className="text-primary font-bold">4.</span>
            <p>
              Emails are always saved as drafts — the agent never sends
              anything without your review. Every agent action is logged in the
              Audit Log.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
