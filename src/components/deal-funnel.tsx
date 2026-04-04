import type { Deal } from "@/lib/data/crm";

const stages = [
  { key: "lead", label: "Lead", color: "bg-muted-foreground" },
  { key: "qualified", label: "Qualified", color: "bg-chart-1" },
  { key: "proposal", label: "Proposal", color: "bg-primary" },
  { key: "negotiation", label: "Negotiation", color: "bg-chart-4" },
  { key: "closed-won", label: "Won", color: "bg-chart-5" },
  { key: "closed-lost", label: "Lost", color: "bg-destructive" },
];

export function DealFunnel({ deals }: { deals: Deal[] }) {
  if (deals.length === 0) return null;

  const counts = stages.map((s) => ({
    ...s,
    count: deals.filter((d) => d.stage === s.key).length,
  }));
  const max = Math.max(...counts.map((c) => c.count), 1);

  return (
    <div className="rounded-lg border border-border bg-card/80 backdrop-blur-sm p-4 mb-4">
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
        Pipeline Funnel
      </h3>
      <div className="space-y-1.5">
        {counts.map((stage) => (
          <div key={stage.key} className="flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground w-16 text-right shrink-0">
              {stage.label}
            </span>
            <div className="flex-1 h-4 rounded-full bg-muted/50 overflow-hidden">
              <div
                className={`h-full rounded-full ${stage.color} transition-all duration-500`}
                style={{
                  width: `${Math.max((stage.count / max) * 100, stage.count > 0 ? 8 : 0)}%`,
                }}
              />
            </div>
            <span className="text-xs text-foreground w-4 text-right">
              {stage.count}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
