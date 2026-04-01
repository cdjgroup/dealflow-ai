import { auth0 } from "@/lib/auth0";
import { getDeals } from "@/lib/data/crm";
import { ChatWindow } from "@/components/chat-window";
import { DealList } from "@/components/deal-list";
import { SeedButton } from "@/components/seed-button";

export default async function DashboardPage() {
  const session = await auth0.getSession();
  const userId = session?.user?.sub ?? "anonymous";
  const deals = await getDeals(userId);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[calc(100vh-8rem)]">
      <div className="lg:col-span-2">
        <ChatWindow />
      </div>
      <div className="space-y-4 overflow-y-auto">
        <DealList deals={deals} />
        {deals.length === 0 && <SeedButton />}
      </div>
    </div>
  );
}
