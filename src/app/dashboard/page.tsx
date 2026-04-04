import { auth0 } from "@/lib/auth0";
import { getDeals, seedDemoData } from "@/lib/data/crm";
import { ChatContainer } from "@/components/chat-container";
import { DealList } from "@/components/deal-list";
import { DealFunnel } from "@/components/deal-funnel";
import { PipelineMetrics } from "@/components/pipeline-metrics";
import { SeedButton } from "@/components/seed-button";
import { OnboardingChecklist } from "@/components/helpkit/OnboardingChecklist";


export default async function DashboardPage() {
  const session = await auth0.getSession();
  const userId = session?.user?.sub;
  if (!userId) {
    throw new Error("Invalid session: missing user ID");
  }

  // Auto-reseed CRM data if new deals (d5-d8) are missing but old deals exist
  let deals = await getDeals(userId);
  if (deals.length > 0 && !deals.some((d) => d.id === "d5")) {
    await seedDemoData(userId);
    deals = await getDeals(userId);
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[calc(100vh-8rem)]">
      <div className="lg:col-span-2">
        <ChatContainer userId={userId} />
      </div>
      <div className="space-y-4 overflow-y-auto">
        <OnboardingChecklist />
        <PipelineMetrics deals={deals} />
        <DealFunnel deals={deals} />
        <DealList deals={deals} />
        <SeedButton hasData={deals.length > 0} />
      </div>
    </div>
  );
}
