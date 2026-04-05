"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { AutonomyLevel, ConfidenceThresholds } from "@/lib/types/settings";

interface ScheduleSettings {
  enabled: boolean;
  hours: number[];
  timezone: string;
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
    initialConfidenceThresholds ?? { autoApprove: 0.85, requireReview: 0.5 }
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
        <h3 className="text-sm font-semibold mb-1">Confidence Routing</h3>
        <p className="text-xs text-muted-foreground mb-3">
          Drag the handles to control how the AI routes actions based on its confidence score.
        </p>

        {/* Zone labels above the bar */}
        <div className="flex mb-1" aria-hidden="true">
          <div className="transition-all overflow-hidden" style={{ width: `${Math.round(confidenceThresholds.requireReview * 100)}%` }}>
            {confidenceThresholds.requireReview >= 0.15 && (
              <span className="text-[10px] font-medium text-red-600 block text-center truncate px-1">Always review</span>
            )}
          </div>
          <div className="transition-all overflow-hidden" style={{ width: `${Math.round((confidenceThresholds.autoApprove - confidenceThresholds.requireReview) * 100)}%` }}>
            {(confidenceThresholds.autoApprove - confidenceThresholds.requireReview) >= 0.15 && (
              <span className="text-[10px] font-medium text-amber-600 block text-center truncate px-1">Follows autonomy</span>
            )}
          </div>
          <div className="transition-all overflow-hidden" style={{ width: `${Math.round((1 - confidenceThresholds.autoApprove) * 100)}%` }}>
            {(1 - confidenceThresholds.autoApprove) >= 0.12 && (
              <span className="text-[10px] font-medium text-emerald-600 block text-center truncate px-1">Auto-approved</span>
            )}
          </div>
        </div>

        {/* Unified dual-thumb slider */}
        <div className="relative h-8 select-none">
          {/* Colored track (visual only) */}
          <div className="absolute inset-0 rounded-full overflow-hidden flex">
            <div
              className="bg-red-400/25 transition-all"
              style={{ width: `${Math.round(confidenceThresholds.requireReview * 100)}%` }}
            />
            <div
              className="bg-amber-400/25 transition-all"
              style={{ width: `${Math.round((confidenceThresholds.autoApprove - confidenceThresholds.requireReview) * 100)}%` }}
            />
            <div
              className="bg-emerald-400/25 transition-all"
              style={{ width: `${Math.round((1 - confidenceThresholds.autoApprove) * 100)}%` }}
            />
          </div>

          {/* Left thumb — requireReview */}
          <input
            type="range"
            min={0}
            max={Math.max(0, Math.round(confidenceThresholds.autoApprove * 100) - 5)}
            step={5}
            value={Math.round(confidenceThresholds.requireReview * 100)}
            onChange={(e) => {
              const val = parseInt(e.target.value) / 100;
              if (val >= confidenceThresholds.autoApprove) return;
              const previous = confidenceThresholds;
              const updated = { ...previous, requireReview: val };
              setConfidenceThresholds(updated);
              saveSettings({ confidenceThresholds: updated }).catch(() => {
                setConfidenceThresholds(previous);
                setError("Failed to save. Please try again.");
              });
            }}
            disabled={saving}
            aria-label={`Review threshold: ${Math.round(confidenceThresholds.requireReview * 100)}%`}
            className="absolute inset-0 w-full appearance-none bg-transparent pointer-events-none z-[3] [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-6 [&::-webkit-slider-thumb]:h-6 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-red-500 [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:cursor-grab [&::-webkit-slider-thumb]:active:cursor-grabbing [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:w-6 [&::-moz-range-thumb]:h-6 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-red-500 [&::-moz-range-thumb]:shadow-md [&::-moz-range-thumb]:cursor-grab [&::-webkit-slider-runnable-track]:appearance-none [&::-webkit-slider-runnable-track]:bg-transparent [&::-webkit-slider-runnable-track]:h-8 [&::-moz-range-track]:bg-transparent [&::-moz-range-track]:h-8 focus-visible:[&::-webkit-slider-thumb]:ring-2 focus-visible:[&::-webkit-slider-thumb]:ring-red-500 focus-visible:[&::-webkit-slider-thumb]:ring-offset-2 focus-visible:[&::-moz-range-thumb]:ring-2 focus-visible:[&::-moz-range-thumb]:ring-red-500 focus-visible:[&::-moz-range-thumb]:ring-offset-2 disabled:opacity-50"
          />

          {/* Right thumb — autoApprove */}
          <input
            type="range"
            min={Math.min(100, Math.round(confidenceThresholds.requireReview * 100) + 5)}
            max={100}
            step={5}
            value={Math.round(confidenceThresholds.autoApprove * 100)}
            onChange={(e) => {
              const val = parseInt(e.target.value) / 100;
              if (val <= confidenceThresholds.requireReview) return;
              const previous = confidenceThresholds;
              const updated = { ...previous, autoApprove: val };
              setConfidenceThresholds(updated);
              saveSettings({ confidenceThresholds: updated }).catch(() => {
                setConfidenceThresholds(previous);
                setError("Failed to save. Please try again.");
              });
            }}
            disabled={saving}
            aria-label={`Auto-approve threshold: ${Math.round(confidenceThresholds.autoApprove * 100)}%`}
            className="absolute inset-0 w-full appearance-none bg-transparent pointer-events-none z-[4] [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-6 [&::-webkit-slider-thumb]:h-6 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-emerald-500 [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:cursor-grab [&::-webkit-slider-thumb]:active:cursor-grabbing [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:w-6 [&::-moz-range-thumb]:h-6 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-emerald-500 [&::-moz-range-thumb]:shadow-md [&::-moz-range-thumb]:cursor-grab [&::-webkit-slider-runnable-track]:appearance-none [&::-webkit-slider-runnable-track]:bg-transparent [&::-webkit-slider-runnable-track]:h-8 [&::-moz-range-track]:bg-transparent [&::-moz-range-track]:h-8 focus-visible:[&::-webkit-slider-thumb]:ring-2 focus-visible:[&::-webkit-slider-thumb]:ring-emerald-500 focus-visible:[&::-webkit-slider-thumb]:ring-offset-2 focus-visible:[&::-moz-range-thumb]:ring-2 focus-visible:[&::-moz-range-thumb]:ring-emerald-500 focus-visible:[&::-moz-range-thumb]:ring-offset-2 disabled:opacity-50"
          />
        </div>

        {/* Percentage callouts below the bar */}
        <div className="relative h-5 mt-1" aria-hidden="true">
          <span
            className="absolute text-[11px] font-semibold text-red-600 tabular-nums -translate-x-1/2 transition-all"
            style={{ left: `${Math.round(confidenceThresholds.requireReview * 100)}%` }}
          >
            {Math.round(confidenceThresholds.requireReview * 100)}%
          </span>
          <span
            className="absolute text-[11px] font-semibold text-emerald-600 tabular-nums -translate-x-1/2 transition-all"
            style={{ left: `${Math.max(Math.round(confidenceThresholds.requireReview * 100) + 10, Math.round(confidenceThresholds.autoApprove * 100))}%` }}
          >
            {Math.round(confidenceThresholds.autoApprove * 100)}%
          </span>
        </div>

        {/* Zone legend */}
        <div className="flex flex-col items-center gap-0.5 mt-3 text-xs">
          <p>
            <span className="font-medium text-red-600">Below {Math.round(confidenceThresholds.requireReview * 100)}%</span>
            <span className="text-muted-foreground"> — Always requires manual review</span>
          </p>
          <p>
            <span className="font-medium text-amber-600">{Math.round(confidenceThresholds.requireReview * 100)}–{Math.round(confidenceThresholds.autoApprove * 100)}%</span>
            <span className="text-muted-foreground"> — Routed by your autonomy level (currently {AUTONOMY_LEVELS.find(a => a.level === autonomyLevel)?.label ?? "unknown"})</span>
          </p>
          <p>
            <span className="font-medium text-emerald-600">Above {Math.round(confidenceThresholds.autoApprove * 100)}%</span>
            <span className="text-muted-foreground"> — Auto-approved regardless of autonomy level</span>
          </p>
        </div>
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
