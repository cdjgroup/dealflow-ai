import type { Deal } from "@/lib/data/crm";

const stageColors: Record<string, string> = {
  lead: "bg-slate-600",
  qualified: "bg-blue-600",
  proposal: "bg-purple-600",
  negotiation: "bg-amber-600",
  "closed-won": "bg-emerald-600",
  "closed-lost": "bg-red-600",
};

export function DealList({ deals }: { deals: Deal[] }) {
  const totalValue = deals.reduce((sum, d) => sum + d.value, 0);
  const activeDeals = deals.filter(
    (d) => d.stage !== "closed-won" && d.stage !== "closed-lost"
  );

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-white">Pipeline</h2>
        <div className="text-sm text-slate-400">
          {activeDeals.length} active &middot; $
          {totalValue.toLocaleString()} total
        </div>
      </div>
      <div className="space-y-2">
        {deals.map((deal) => (
          <div
            key={deal.id}
            className="flex items-center justify-between bg-slate-800/50 rounded-lg px-3 py-2"
          >
            <div className="flex items-center gap-3">
              <span
                className={`text-xs px-2 py-0.5 rounded-full text-white ${stageColors[deal.stage] || "bg-slate-600"}`}
              >
                {deal.stage}
              </span>
              <div>
                <div className="text-sm font-medium text-white">
                  {deal.name}
                </div>
                <div className="text-xs text-slate-500">{deal.company}</div>
              </div>
            </div>
            <div className="text-sm font-medium text-emerald-400">
              ${deal.value.toLocaleString()}
            </div>
          </div>
        ))}
        {deals.length === 0 && (
          <p className="text-sm text-slate-500 text-center py-4">
            No deals yet. Seed demo data or ask the agent to create one.
          </p>
        )}
      </div>
    </div>
  );
}
