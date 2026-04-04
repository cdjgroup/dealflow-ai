import type { Deal } from "@/lib/data/crm";

interface Props {
  deals: Deal[];
}

export function PipelineMetrics({ deals }: Props) {
  const activeDeals = deals.filter(
    (d) => d.stage !== "closed-won" && d.stage !== "closed-lost"
  );
  const totalValue = activeDeals.reduce((sum, d) => sum + d.value, 0);
  const wonDeals = deals.filter((d) => d.stage === "closed-won");
  const wonValue = wonDeals.reduce((sum, d) => sum + d.value, 0);

  const metrics = [
    {
      label: "Active Deals",
      value: String(activeDeals.length),
      accent: false,
    },
    {
      label: "Pipeline Value",
      value: `$${totalValue.toLocaleString()}`,
      accent: true,
    },
    {
      label: "Won",
      value: `$${wonValue.toLocaleString()}`,
      accent: false,
    },
  ];

  return (
    <div className="grid grid-cols-3 gap-3 mb-4">
      {metrics.map((m) => (
        <div
          key={m.label}
          className="rounded-lg border border-border bg-card/80 backdrop-blur-sm p-3"
        >
          <p className="text-xs text-muted-foreground mb-0.5">{m.label}</p>
          <p
            className={`text-lg font-semibold ${m.accent ? "text-accent" : "text-foreground"}`}
          >
            {m.value}
          </p>
        </div>
      ))}
    </div>
  );
}
