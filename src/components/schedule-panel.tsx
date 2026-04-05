"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { AutonomyLevel, ConfidenceThresholds } from "@/lib/types/settings";

interface ScheduleSettings {
  enabled: boolean;
  hours: number[];
  timezone: string;
  notifyPriorities?: ("high" | "medium" | "low")[];
}

interface Props {
  initialSchedule: ScheduleSettings;
  initialAutonomyLevel: AutonomyLevel;
  initialConfidenceThresholds?: ConfidenceThresholds;
}

const SCHEDULE_OPTIONS = [
  { hour: 8, label: "8:00 AM", description: "Morning review" },
  { hour: 12, label: "12:00 PM", description: "Midday review" },
  { hour: 17, label: "5:00 PM", description: "End-of-day review" },
];

const AUTONOMY_LEVELS: {
  level: AutonomyLevel;
  label: string;
  description: string;
  color: string;
  activeColor: string;
}[] = [
  {
    level: 1,
    label: "Suggest Only",
    description: "AI queues actions for your review",
    color: "text-muted-foreground",
    activeColor: "bg-blue-500 text-white border-blue-500",
  },
  {
    level: 2,
    label: "Auto-Approve",
    description: "AI approves, you confirm via Guardian",
    color: "text-muted-foreground",
    activeColor: "bg-amber-500 text-white border-amber-500",
  },
  {
    level: 3,
    label: "Full Autonomous",
    description: "AI executes routine actions on schedule",
    color: "text-muted-foreground",
    activeColor: "bg-emerald-500 text-white border-emerald-500",
  },
];

export function SchedulePanel({ initialSchedule, initialAutonomyLevel, initialConfidenceThresholds }: Props) {
  const [schedule, setSchedule] = useState<ScheduleSettings>(initialSchedule);
  const [autonomyLevel, setAutonomyLevel] = useState<AutonomyLevel>(initialAutonomyLevel);
  const [confidenceThresholds, setConfidenceThresholds] = useState<ConfidenceThresholds>(
    initialConfidenceThresholds ?? { enabled: true, autoApprove: 0.85, requireReview: 0.5 }
  );
  const [saving, setSaving] = useState(false);
  const [triggering, setTriggering] = useState(false);
  const [polling, setPolling] = useState(false);
  const [triggerResult, setTriggerResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const router = useRouter();

  // Focus the confirm button when dialog appears
  useEffect(() => {
    if (showConfirmDialog) {
      confirmRef.current?.focus();
    }
  }, [showConfirmDialog]);

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

  async function saveSettings(patch: { schedule?: ScheduleSettings; autonomyLevel?: AutonomyLevel; confidenceThresholds?: ConfidenceThresholds }) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "X-Requested-With": "XMLHttpRequest",
        },
        body: JSON.stringify(patch),
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
      await saveSettings({ schedule: newSchedule });
    } catch {
      setSchedule(previousSchedule);
      setError("Failed to save. Please try again.");
    }
  }

  async function handleAutonomyChange(level: AutonomyLevel) {
    if (level === autonomyLevel) return;

    // Level 3 requires confirmation
    if (level === 3) {
      setShowConfirmDialog(true);
      return;
    }

    const previousLevel = autonomyLevel;
    setAutonomyLevel(level);

    try {
      await saveSettings({ autonomyLevel: level });
    } catch {
      setAutonomyLevel(previousLevel);
      setError("Failed to save. Please try again.");
    }
  }

  async function confirmLevel3() {
    setShowConfirmDialog(false);
    const previousLevel = autonomyLevel;
    setAutonomyLevel(3);

    try {
      await saveSettings({ autonomyLevel: 3 });
    } catch {
      setAutonomyLevel(previousLevel);
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
      {/* Autonomy Level Selector */}
      <div>
        <h3 className="text-sm font-semibold mb-1">AI Autonomy Level</h3>
        <p className="text-xs text-muted-foreground mb-3">
          Control how much the AI can do without your intervention
        </p>
        <div className="flex gap-1" role="group" aria-label="AI autonomy level">
          {AUTONOMY_LEVELS.map((opt) => {
            const isActive = autonomyLevel === opt.level;
            return (
              <button
                key={opt.level}
                onClick={() => handleAutonomyChange(opt.level)}
                disabled={saving}
                aria-pressed={isActive}
                className={`flex-1 rounded-md border px-3 py-3 text-xs font-medium transition-colors ${
                  isActive
                    ? opt.activeColor
                    : "border-border bg-muted/50 hover:border-muted-foreground/30 " + opt.color
                } ${saving ? "opacity-50 pointer-events-none" : ""}`}
              >
                <div className="font-semibold">{opt.label}</div>
                <div className={`mt-0.5 ${isActive ? "text-white/80" : "text-muted-foreground"}`}>
                  {opt.description}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Level 3 Confirmation Dialog */}
      {showConfirmDialog && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3">
          <p className="text-sm font-medium text-amber-500">Enable Full Autonomous Mode?</p>
          <p className="text-xs text-muted-foreground mt-1">
            The AI will automatically execute routine actions (under $50K deal value) on your schedule
            without asking for approval. High-value actions still require Guardian consent.
          </p>
          <div className="flex gap-2 mt-3">
            <button
              ref={confirmRef}
              onClick={confirmLevel3}
              disabled={saving}
              className="text-xs font-medium px-3 py-1.5 rounded-md bg-amber-500 text-white hover:bg-amber-600 transition-colors disabled:opacity-50"
            >
              {saving ? "Saving..." : "Yes, enable"}
            </button>
            <button
              onClick={() => setShowConfirmDialog(false)}
              className="text-xs font-medium px-3 py-1.5 rounded-md border border-border hover:bg-muted/50 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Confidence-Based Routing */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <h3 id="confidence-routing-label" className="text-base font-semibold">Confidence Routing</h3>
          <button
            role="switch"
            aria-checked={confidenceThresholds.enabled !== false}
            aria-labelledby="confidence-routing-label"
            onClick={() => {
              const previous = confidenceThresholds;
              const toggled = { ...previous, enabled: previous.enabled === false };
              setConfidenceThresholds(toggled);
              saveSettings({ confidenceThresholds: toggled }).catch(() => {
                setConfidenceThresholds(previous);
                setError("Failed to save. Please try again.");
              });
            }}
            disabled={saving}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 ${
              confidenceThresholds.enabled !== false ? "bg-primary" : "bg-muted"
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-background shadow-lg ring-0 transition-transform ${
                confidenceThresholds.enabled !== false ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
        </div>

        {confidenceThresholds.enabled === false ? (
          <p className="text-sm text-muted-foreground">
            Confidence routing is off. Actions are routed based on your autonomy level only.
          </p>
        ) : (
          <>
            <p className="text-sm text-muted-foreground mb-3">
              AI confidence scores override your autonomy level at the extremes.
            </p>

            {/* Read-only visualization bar */}
            <div className="flex rounded-lg overflow-hidden h-10 mb-4" aria-hidden="true">
              <div
                className="bg-red-500/20 flex items-center justify-center gap-1 transition-all min-w-0"
                style={{ width: `${Math.round(confidenceThresholds.requireReview * 100)}%` }}
              >
                {confidenceThresholds.requireReview >= 0.15 && (
                  <>
                    <svg className="w-3.5 h-3.5 text-red-600 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" /></svg>
                    <span className="text-xs font-semibold text-red-700 truncate">Always Review</span>
                  </>
                )}
              </div>
              <div
                className="bg-amber-500/20 flex items-center justify-center gap-1 transition-all min-w-0"
                style={{ width: `${Math.round((confidenceThresholds.autoApprove - confidenceThresholds.requireReview) * 100)}%` }}
              >
                {(confidenceThresholds.autoApprove - confidenceThresholds.requireReview) >= 0.15 && (
                  <>
                    <svg className="w-3.5 h-3.5 text-amber-700 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.64 0 8.577 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.64 0-8.577-3.007-9.963-7.178Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" /></svg>
                    <span className="text-xs font-semibold text-amber-700 truncate">Follows Autonomy</span>
                  </>
                )}
              </div>
              <div
                className="bg-emerald-500/20 flex items-center justify-center gap-1 transition-all min-w-0"
                style={{ width: `${Math.round((1 - confidenceThresholds.autoApprove) * 100)}%` }}
              >
                {(1 - confidenceThresholds.autoApprove) >= 0.12 && (
                  <>
                    <svg className="w-3.5 h-3.5 text-emerald-600 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>
                    <span className="text-xs font-semibold text-emerald-700 truncate">Auto-Approved</span>
                  </>
                )}
              </div>
            </div>

            {/* Threshold numeric inputs */}
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="text-sm font-medium text-foreground block mb-1">
                  Review below
                </label>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min={0}
                    max={Math.round(confidenceThresholds.autoApprove * 100) - 5}
                    step={5}
                    value={Math.round(confidenceThresholds.requireReview * 100)}
                    onChange={(e) => {
                      const val = parseInt(e.target.value) / 100;
                      if (isNaN(val) || val < 0 || val >= confidenceThresholds.autoApprove) return;
                      const previous = confidenceThresholds;
                      const updated = { ...previous, requireReview: val };
                      setConfidenceThresholds(updated);
                      saveSettings({ confidenceThresholds: updated }).catch(() => {
                        setConfidenceThresholds(previous);
                        setError("Failed to save. Please try again.");
                      });
                    }}
                    disabled={saving}
                    aria-label="Review threshold (percent)"
                    aria-describedby="confidence-zone-descriptions"
                    className="w-20 rounded-md border border-input bg-background px-3 py-1.5 text-sm font-semibold text-red-600 tabular-nums text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                  />
                  <span className="text-sm font-medium text-muted-foreground">%</span>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-foreground block mb-1">
                  Auto-approve above
                </label>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min={Math.round(confidenceThresholds.requireReview * 100) + 5}
                    max={100}
                    step={5}
                    value={Math.round(confidenceThresholds.autoApprove * 100)}
                    onChange={(e) => {
                      const val = parseInt(e.target.value) / 100;
                      if (isNaN(val) || val > 1 || val <= confidenceThresholds.requireReview) return;
                      const previous = confidenceThresholds;
                      const updated = { ...previous, autoApprove: val };
                      setConfidenceThresholds(updated);
                      saveSettings({ confidenceThresholds: updated }).catch(() => {
                        setConfidenceThresholds(previous);
                        setError("Failed to save. Please try again.");
                      });
                    }}
                    disabled={saving}
                    aria-label="Auto-approve threshold (percent)"
                    aria-describedby="confidence-zone-descriptions"
                    className="w-20 rounded-md border border-input bg-background px-3 py-1.5 text-sm font-semibold text-emerald-600 tabular-nums text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                  />
                  <span className="text-sm font-medium text-muted-foreground">%</span>
                </div>
              </div>
            </div>

            {/* Zone descriptions */}
            <div id="confidence-zone-descriptions" className="space-y-1 text-sm text-muted-foreground">
              <p><span className="font-medium text-red-600">Below {Math.round(confidenceThresholds.requireReview * 100)}%</span> — Always requires manual review</p>
              <p><span className="font-medium text-amber-700">{Math.round(confidenceThresholds.requireReview * 100)}–{Math.round(confidenceThresholds.autoApprove * 100)}%</span> — Routed by your autonomy level (currently {AUTONOMY_LEVELS.find(l => l.level === autonomyLevel)?.label ?? "Unknown"})</p>
              <p><span className="font-medium text-emerald-600">Above {Math.round(confidenceThresholds.autoApprove * 100)}%</span> — Auto-approved regardless of autonomy level</p>
            </div>
          </>
        )}
      </div>

      {/* Scheduled Review Section */}
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
              {autonomyLevel === 3
                ? "Routine actions auto-execute at scheduled times. High-value actions require Guardian approval."
                : autonomyLevel === 2
                  ? "Auto-approved actions execute after one Guardian push at scheduled times."
                  : "Approve all high/medium priority actions with one Guardian push at scheduled times."}
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
                          saveSettings({ schedule: newSchedule }).catch(() => {
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
