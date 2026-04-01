import type { Deal } from "@/lib/data/crm";

const stageColors: Record<string, string> = {
  lead: "bg-muted-foreground text-white",
  qualified: "bg-chart-1 text-white",
  proposal: "bg-primary text-primary-foreground",
  negotiation: "bg-chart-4 text-background",
  "closed-won": "bg-chart-5 text-background",
  "closed-lost": "bg-destructive text-white",
};

export function DealList({ deals }: { deals: Deal[] }) {
  const totalValue = deals.reduce((sum, d) => sum + d.value, 0);
  const activeDeals = deals.filter(
    (d) => d.stage !== "closed-won" && d.stage !== "closed-lost"
  );

  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-foreground">Pipeline</h2>
        <div className="text-sm text-muted-foreground">
          {activeDeals.length} active &middot; $
          {totalValue.toLocaleString()} total
        </div>
      </div>
      <div className="space-y-2">
        {deals.map((deal) => (
          <div
            key={deal.id}
            className="flex items-center justify-between bg-secondary/50 rounded-lg px-3 py-2"
          >
            <div className="flex items-center gap-3">
              <span
                className={`text-xs px-2 py-0.5 rounded-full ${stageColors[deal.stage] || "bg-muted-foreground text-white"}`}
              >
                {deal.stage}
              </span>
              <div>
                <div className="text-sm font-medium text-foreground">
                  {deal.name}
                </div>
                <div className="text-xs text-muted-foreground">{deal.company}</div>
              </div>
            </div>
            <div className="text-sm font-medium text-accent">
              ${deal.value.toLocaleString()}
            </div>
          </div>
        ))}
        {deals.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">
            No deals yet. Seed demo data or ask the agent to create one.
          </p>
        )}
      </div>
    </div>
  );
}
