"use client";

import { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";

interface ScheduleSettings {
  enabled: boolean;
  hours: number[];
  timezone: string;
}

interface Props {
  initialSchedule: ScheduleSettings;
}

const SCHEDULE_OPTIONS = [
  { hour: 8, label: "8:00 AM", description: "Morning review" },
  { hour: 12, label: "12:00 PM", description: "Midday review" },
  { hour: 17, label: "5:00 PM", description: "End-of-day review" },
];

export function SchedulePanel({ initialSchedule }: Props) {
  const [schedule, setSchedule] = useState<ScheduleSettings>(initialSchedule);
  const [saving, setSaving] = useState(false);
  const [triggering, setTriggering] = useState(false);
  const [polling, setPolling] = useState(false);
  const [triggerResult, setTriggerResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const router = useRouter();

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    setPolling(false);
  }, []);

  const startPolling = useCallback((actionCount: number, interval: number) => {
    setPolling(true);
    setTriggerResult(`Waiting for Guardian approval (${actionCount} action${actionCount === 1 ? "" : "s"})...`);
    let attempts = 0;
    const maxAttempts = 60;

    pollRef.current = setInterval(async () => {
      attempts++;
      if (attempts > maxAttempts) {
        stopPolling();
        setTriggerResult(null);
        setError("Approval timed out");
        return;
      }
      try {
        const res = await fetch("/api/cron/schedule-poll-trigger");
        const data = await res.json();

        if (data.status === "done") {
          stopPolling();
          const parts: string[] = [];
          if (data.executed > 0) parts.push(`${data.executed} executed`);
          if (data.denied > 0) parts.push(`${data.denied} denied`);
          if (data.failed > 0) parts.push(`${data.failed} failed`);
          setTriggerResult(parts.join(", ") || "All actions processed");
          router.refresh();
        } else if (data.status === "no-sessions") {
          // Sessions may not be stored yet on early polls — keep waiting
          if (attempts > 10) {
            stopPolling();
            setTriggerResult(null);
            setError("Sessions expired or not found");
          }
        } else if (data.status === "pending") {
          // Update progress as individual actions resolve
          const resolved = (data.executed || 0) + (data.denied || 0) + (data.failed || 0);
          const remaining = data.pending || 0;
          if (resolved > 0) {
            setTriggerResult(
              `${resolved} resolved, ${remaining} awaiting approval...`
            );
          }
        }
      } catch {
        stopPolling();
        setTriggerResult(null);
        setError("Poll failed");
      }
    }, Math.max(interval * 1000, 3000));
  }, [stopPolling, router]);

  async function toggleHour(hour: number) {
    const newHours = schedule.hours.includes(hour)
      ? schedule.hours.filter((h) => h !== hour)
      : [...schedule.hours, hour];
    const newSchedule: ScheduleSettings = {
      enabled: newHours.length > 0,
      hours: newHours,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    };

    const previousSchedule = { ...schedule };
    setSchedule(newSchedule);
    setSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "X-Requested-With": "XMLHttpRequest",
        },
        body: JSON.stringify({ schedule: newSchedule }),
      });
      if (!res.ok) {
        throw new Error("Failed to save schedule");
      }
    } catch {
      setSchedule(previousSchedule);
      setError("Failed to save. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-sm font-semibold flex items-center gap-2">
            Scheduled Action Review
            {schedule.enabled && (
              <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-500">
                Active
              </span>
            )}
          </h3>
          <p className="text-xs text-muted-foreground mt-1">
            Get a Guardian push notification per high/medium priority action
            at scheduled times. Approve each individually from your phone.
          </p>
        </div>
      </div>

      <div className="flex gap-4 mt-3">
        {SCHEDULE_OPTIONS.map((opt) => (
          <label
            key={opt.hour}
            className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm cursor-pointer transition-colors ${
              schedule.hours.includes(opt.hour)
                ? "border-primary bg-primary/5 text-primary"
                : "border-border hover:border-muted-foreground/30"
            } ${saving ? "opacity-50 pointer-events-none" : ""}`}
          >
            <input
              type="checkbox"
              checked={schedule.hours.includes(opt.hour)}
              onChange={() => toggleHour(opt.hour)}
              disabled={saving}
              className="rounded border-border accent-primary"
            />
            <div>
              <div className="font-medium">{opt.label}</div>
              <div className="text-xs text-muted-foreground">
                {opt.description}
              </div>
            </div>
          </label>
        ))}
      </div>

      {schedule.enabled && (
        <div className="flex items-center gap-3 mt-3">
          <p className="text-xs text-muted-foreground">
            Timezone: {schedule.timezone}
          </p>
          <button
            onClick={async () => {
              setTriggering(true);
              setTriggerResult(null);
              setError(null);
              try {
                const res = await fetch("/api/cron/schedule-trigger", {
                  method: "POST",
                  headers: { "X-Requested-With": "XMLHttpRequest" },
                });
                const data = await res.json();
                if (!res.ok) {
                  // Show the first action's error detail if available
                  const detail = data.results?.find((r: { status: string; bindingMessage?: string }) => r.status === "error")?.bindingMessage;
                  throw new Error(detail || data.error || `Trigger failed (${res.status})`);
                }
                if (data.actionCount === 0) {
                  setError("No eligible actions were initiated");
                  return;
                }
                startPolling(data.actionCount, data.interval || 5);
              } catch (err) {
                setError(err instanceof Error ? err.message : "Trigger failed");
              } finally {
                setTriggering(false);
              }
            }}
            disabled={triggering || polling}
            className="text-xs font-medium px-3 py-1.5 rounded-md border border-primary/30 bg-primary/5 text-primary hover:bg-primary/10 transition-colors disabled:opacity-50"
          >
            {triggering ? "Sending..." : polling ? "Awaiting approval..." : "Run Now"}
          </button>
        </div>
      )}

      {triggerResult && (
        <p className="text-xs text-emerald-500 mt-2">{triggerResult}</p>
      )}

      {error && (
        <p className="text-xs text-destructive mt-2">{error}</p>
      )}
    </div>
  );
}
