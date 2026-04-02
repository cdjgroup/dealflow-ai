"use client";

interface ToolResultCardProps {
  toolName: string;
  output: unknown;
}

const stageColors: Record<string, string> = {
  lead: "bg-slate-600",
  qualified: "bg-blue-600",
  proposal: "bg-purple-600",
  negotiation: "bg-amber-600",
  "closed-won": "bg-emerald-600",
  "closed-lost": "bg-red-600",
};

function CalendarCard({ data }: { data: Record<string, unknown> }) {
  const events = (data.events as { title: string; start: string; end: string }[]) || [];
  return (
    <div className="rounded-lg border border-border bg-card/50 p-3 my-2">
      <div className="flex items-center gap-2 mb-2">
        <span>📅</span>
        <span className="text-sm font-medium">
          Calendar — {String(data.date || "")}
        </span>
        <span className="text-xs text-muted-foreground">
          {String(data.eventCount || 0)} events
        </span>
      </div>
      {events.length > 0 && (
        <div className="space-y-1 mb-2">
          {events.map((e, i) => (
            <div key={i} className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground font-mono">
                {e.start?.substring(11, 16) || "all day"} –{" "}
                {e.end?.substring(11, 16) || ""}
              </span>
              <span className="text-foreground">{e.title}</span>
            </div>
          ))}
        </div>
      )}
      {typeof data.freeSlots === "string" && (
        <p className="text-xs text-emerald-400">{data.freeSlots}</p>
      )}
    </div>
  );
}

function DealListCard({ data }: { data: Record<string, unknown> }) {
  const deals = (data.deals as { name: string; company: string; value: number; stage: string }[]) || [];
  return (
    <div className="rounded-lg border border-border bg-card/50 p-3 my-2">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span>📊</span>
          <span className="text-sm font-medium">Pipeline</span>
        </div>
        {typeof data.totalValue === "number" && (
          <span className="text-sm font-medium text-emerald-400">
            ${data.totalValue.toLocaleString()}
          </span>
        )}
      </div>
      <div className="space-y-1.5">
        {deals.map((deal, i) => (
          <div key={i} className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <span
                className={`inline-block rounded px-1.5 py-0.5 text-[10px] text-white ${stageColors[deal.stage] || "bg-muted"}`}
              >
                {deal.stage}
              </span>
              <span className="text-foreground">{deal.name}</span>
              <span className="text-muted-foreground">{deal.company}</span>
            </div>
            <span className="text-emerald-400">
              ${deal.value?.toLocaleString()}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function EmailDraftCard({ data }: { data: Record<string, unknown> }) {
  const draftId = data.draftId as string | undefined;
  return (
    <div className="rounded-lg border border-border bg-card/50 p-3 my-2">
      <div className="flex items-center gap-2 mb-2">
        <span>✉️</span>
        <span className="text-sm font-medium text-emerald-400">
          Draft Created
        </span>
      </div>
      {typeof data.to === "string" && (
        <p className="text-xs text-muted-foreground">To: {data.to}</p>
      )}
      {typeof data.subject === "string" && (
        <p className="text-xs text-foreground">Subject: {data.subject}</p>
      )}
      {draftId && (
        <a
          href={`https://mail.google.com/mail/u/0/#drafts/${draftId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-block text-xs text-primary hover:underline"
        >
          Open in Gmail →
        </a>
      )}
    </div>
  );
}

function EmailSearchCard({ data }: { data: Record<string, unknown> }) {
  const results = (data.results as { from: string; subject: string; date: string; snippet: string }[]) || [];
  return (
    <div className="rounded-lg border border-border bg-card/50 p-3 my-2">
      <div className="flex items-center gap-2 mb-2">
        <span>🔍</span>
        <span className="text-sm font-medium">
          Email Results ({String(data.count || results.length)})
        </span>
      </div>
      <div className="space-y-2">
        {results.map((email, i) => (
          <div key={i} className="border-b border-border pb-1.5 last:border-0 last:pb-0">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-foreground">
                {email.from}
              </span>
              <span className="text-[10px] text-muted-foreground">
                {email.date}
              </span>
            </div>
            <p className="text-xs text-foreground">{email.subject}</p>
            {email.snippet && (
              <p className="text-[10px] text-muted-foreground line-clamp-1">
                {email.snippet}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function SlackCard({ data }: { data: Record<string, unknown> }) {
  if (data.channels) {
    const channels = data.channels as { name: string; members: number }[];
    return (
      <div className="rounded-lg border border-border bg-card/50 p-3 my-2">
        <div className="flex items-center gap-2 mb-2">
          <span>💬</span>
          <span className="text-sm font-medium">
            Slack Channels ({String(data.channelCount || channels.length)})
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {channels.map((ch, i) => (
            <span
              key={i}
              className="rounded bg-muted px-2 py-0.5 text-xs text-foreground"
            >
              #{ch.name}
            </span>
          ))}
        </div>
      </div>
    );
  }

  // Message sent confirmation
  return (
    <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 my-2">
      <div className="flex items-center gap-2">
        <span>✅</span>
        <span className="text-sm font-medium text-emerald-400">
          {String(data.message || "Slack message sent")}
        </span>
      </div>
    </div>
  );
}

function ErrorCard({ data }: { data: Record<string, unknown> }) {
  return (
    <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-3 my-2">
      <div className="flex items-center gap-2">
        <span>❌</span>
        <span className="text-sm text-red-400">{String(data.error)}</span>
      </div>
      {typeof data.action === "string" && (
        <p className="mt-1 text-xs text-muted-foreground">{data.action}</p>
      )}
    </div>
  );
}

export function ToolResultCard({ toolName, output }: ToolResultCardProps) {
  if (!output || typeof output !== "object") return null;
  const data = output as Record<string, unknown>;

  // Error results
  if (data.error) return <ErrorCard data={data} />;

  switch (toolName) {
    case "checkCalendar":
      return <CalendarCard data={data} />;
    case "listDeals":
      return <DealListCard data={data} />;
    case "draftEmail":
      return <EmailDraftCard data={data} />;
    case "searchEmails":
      return <EmailSearchCard data={data} />;
    case "listSlackChannels":
    case "sendSlackMessage":
      return <SlackCard data={data} />;
    default:
      return null; // Fall back to existing text rendering
  }
}
