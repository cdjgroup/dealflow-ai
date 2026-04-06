"use client";

import { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";

interface ScheduleSettings {
  enabled: boolean;
  hours: number[];
  timezone: string;
  notifyPriorities?: ("high" | "medium" | "low")[];
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
    setTriggerResult(`Approve on Guardian to execute ${actionCount} action${actionCount === 1 ? "" : "s"}...`);
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

        if (data.status === "executed") {
          stopPolling();
          const msg = data.failed
            ? `${data.executed} executed, ${data.failed} failed`
            : `${data.executed} action${data.executed === 1 ? "" : "s"} executed`;
          setTriggerResult(msg);
          setTimeout(() => router.refresh(), 500);
        } else if (data.status === "denied") {
          stopPolling();
          setTriggerResult(null);
          setError("Approval denied — actions returned to pending");
          setTimeout(() => router.refresh(), 500);
        } else if (data.status === "expired") {
          stopPolling();
          setTriggerResult(null);
          setError("Session expired");
          setTimeout(() => router.refresh(), 500);
        } else if (data.status === "no-sessions") {
          if (attempts > 10) {
            stopPolling();
            setTriggerResult(null);
            setError("Session not found");
            router.refresh();
          }
        }
        // "pending" — keep polling
      } catch {
        stopPolling();
        setTriggerResult(null);
        setError("Poll failed");
      }
    }, Math.max(interval * 1000, 3000));
  }, [stopPolling, router]);

  async function saveSchedule(newSchedule: ScheduleSettings) {
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
        throw new Error("Failed to save settings");
      }
    } catch {
      throw new Error("Failed to save. Please try again.");
    } finally {
      setSaving(false);
    }
  }

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

    try {
      await saveSchedule(newSchedule);
    } catch {
      setSchedule(previousSchedule);
      setError("Failed to save. Please try again.");
    }
  }

  async function handleRunNow() {
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
        throw new Error(data.error || `Trigger failed (${res.status})`);
      }

      // Level 3 auto-executed: no polling needed
      if (data.status === "auto-executed") {
        const msg = data.failed
          ? `${data.executed} executed, ${data.failed} failed`
          : `${data.executed} action${data.executed === 1 ? "" : "s"} auto-executed`;
        setTriggerResult(msg);
        setTimeout(() => router.refresh(), 500);
        return;
      }

      // Level 3 partial (routine executed, high-value needs CIBA)
      if (data.status === "partial") {
        const execMsg = data.executed > 0 ? `${data.executed} auto-executed. ` : "";
        setTriggerResult(`${execMsg}Approve ${data.cibaRequired} high-value action${data.cibaRequired === 1 ? "" : "s"} on Guardian...`);
        startPolling(data.cibaRequired, data.interval || 5);
        return;
      }

      // Level 1 & 2: standard CIBA flow
      startPolling(data.actionCount, data.interval || 5);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Trigger failed");
    } finally {
      setTriggering(false);
    }
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-4">
      {/* Scheduled Review Section — autonomy/confidence moved to Permissions page */}
      <div>
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
              Approve pending actions with one Guardian push at scheduled times.
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
          <>
            {/* Guardian notification priority selector */}
            <div className="mt-3">
              <p className="text-sm font-medium mb-2">Guardian notifications include</p>
              <div className="flex gap-3">
                {(["high", "medium", "low"] as const).map((p) => {
                  const priorities = schedule.notifyPriorities ?? ["high", "medium"];
                  const checked = priorities.includes(p);
                  const colors = {
                    high: checked ? "border-red-500/50 bg-red-500/10 text-red-600" : "border-border",
                    medium: checked ? "border-amber-500/50 bg-amber-500/10 text-amber-700" : "border-border",
                    low: checked ? "border-muted-foreground/50 bg-muted/50 text-foreground" : "border-border",
                  };
                  return (
                    <label
                      key={p}
                      className={`flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm cursor-pointer transition-colors ${colors[p]} ${saving ? "opacity-50 pointer-events-none" : ""}`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          const current = schedule.notifyPriorities ?? ["high", "medium"];
                          const updated = checked
                            ? current.filter((x) => x !== p)
                            : [...current, p];
                          if (updated.length === 0) return;
                          const newSchedule = { ...schedule, notifyPriorities: updated };
                          setSchedule(newSchedule);
                          saveSchedule(newSchedule).catch(() => {
                            setSchedule(schedule);
                            setError("Failed to save. Please try again.");
                          });
                        }}
                        disabled={saving}
                        className="rounded border-border accent-primary"
                      />
                      <span className="capitalize font-medium">{p} priority</span>
                    </label>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Only selected priorities are included in scheduled Guardian push notifications.
              </p>
            </div>

            <div className="flex items-center gap-3 mt-3">
              <p className="text-xs text-muted-foreground">
                Timezone: {schedule.timezone}
              </p>
              <button
                onClick={handleRunNow}
                disabled={triggering || polling}
                className="text-xs font-medium px-3 py-1.5 rounded-md border border-primary/30 bg-primary/5 text-primary hover:bg-primary/10 transition-colors disabled:opacity-50"
              >
                {triggering ? "Sending..." : polling ? "Awaiting approval..." : "Run Now (demo mode)"}
              </button>
            </div>
          </>
        )}
      </div>

      {triggerResult && (
        <p className="text-xs text-emerald-500" aria-live="polite">{triggerResult}</p>
      )}

      {error && (
        <p className="text-xs text-destructive" aria-live="assertive">{error}</p>
      )}
    </div>
  );
}
