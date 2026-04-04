"use client";

import { useState } from "react";

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
  const [error, setError] = useState<string | null>(null);

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
            Get a Guardian push notification to approve and execute all pending
            actions at scheduled times.
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
        <p className="text-xs text-muted-foreground mt-2">
          Timezone: {schedule.timezone}
        </p>
      )}

      {error && (
        <p className="text-xs text-destructive mt-2">{error}</p>
      )}
    </div>
  );
}
