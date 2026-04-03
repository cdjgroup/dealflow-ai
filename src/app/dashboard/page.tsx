import { auth0 } from "@/lib/auth0";
import { getDeals } from "@/lib/data/crm";
import { ChatWindow } from "@/components/chat-window";
import { DealList } from "@/components/deal-list";
import { SeedButton } from "@/components/seed-button";
import { ConnectGoogle } from "@/components/connect-google";
import { ConnectSlack } from "@/components/connect-slack";

export default async function DashboardPage() {
  const session = await auth0.getSession();
  const userId = session?.user?.sub;
  if (!userId) {
    throw new Error("Invalid session: missing user ID");
  }
  const deals = await getDeals(userId);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[calc(100vh-8rem)]">
      <div className="lg:col-span-2">
        <ChatWindow />
      </div>
      <div className="space-y-4 overflow-y-auto">
        <DealList deals={deals} />
        {deals.length === 0 && <SeedButton />}
        <div className="bg-card border border-border rounded-lg p-4">
          <h3 className="text-sm font-semibold text-foreground mb-2">
            Connect Services
          </h3>
          <p className="text-xs text-muted-foreground mb-3">
            Connect your accounts to let the agent access your calendar, email,
            and Slack via Auth0 Token Vault.
          </p>
          <div className="space-y-2">
            <ConnectGoogle />
            <ConnectSlack />
          </div>
        </div>
      </div>
    </div>
  );
}
