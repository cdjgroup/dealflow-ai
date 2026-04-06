"use client";

import { useState, useRef, useEffect } from "react";
import type { AutonomyLevel, ConfidenceThresholds } from "@/lib/types/settings";

const AUTONOMY_LEVELS: {
  level: AutonomyLevel;
  label: string;
  description: string;
  activeColor: string;
}[] = [
  {
    level: 1,
    label: "Suggest Only",
    description: "AI queues for your review",
    activeColor: "bg-blue-500 text-white border-blue-500",
  },
  {
    level: 2,
    label: "Auto-Approve",
    description: "AI approves, you confirm via Guardian",
    activeColor: "bg-amber-500 text-white border-amber-500",
  },
  {
    level: 3,
    label: "Full Autonomous",
    description: "AI executes routine actions on schedule",
    activeColor: "bg-emerald-500 text-white border-emerald-500",
  },
];

interface ConnectionAutonomyControlsProps {
  connectionId: string;
  connectionLabel: string;
  autonomyLevel: AutonomyLevel;
  confidenceThresholds: ConfidenceThresholds;
  onAutonomyChange: (connectionId: string, level: AutonomyLevel) => void;
  onConfidenceChange: (connectionId: string, thresholds: ConfidenceThresholds) => void;
  saving: boolean;
}

export function ConnectionAutonomyControls({
  connectionId,
  connectionLabel,
  autonomyLevel,
  confidenceThresholds,
  onAutonomyChange,
  onConfidenceChange,
  saving,
}: ConnectionAutonomyControlsProps) {
  const [expanded, setExpanded] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (showConfirmDialog) confirmRef.current?.focus();
  }, [showConfirmDialog]);

  const currentLevel = AUTONOMY_LEVELS.find((l) => l.level === autonomyLevel);
  const reviewPct = Math.round(confidenceThresholds.requireReview * 100);
  const approvePct = Math.round(confidenceThresholds.autoApprove * 100);
  const routingEnabled = confidenceThresholds.enabled !== false;

  function handleAutonomyChange(level: AutonomyLevel) {
    if (level === autonomyLevel) return;
    if (level === 3) {
      setShowConfirmDialog(true);
      return;
    }
    onAutonomyChange(connectionId, level);
  }

  return (
    <div>
      {/* Summary row — always visible */}
      <div className="flex items-center gap-3">
        {/* Mini zone bar */}
        {routingEnabled && (
          <div className="flex rounded-full overflow-hidden h-2 w-24 shrink-0" aria-hidden="true">
            <div className="bg-red-400/40 transition-all" style={{ width: `${reviewPct}%` }} />
            <div className="bg-amber-400/40 transition-all" style={{ width: `${approvePct - reviewPct}%` }} />
            <div className="bg-emerald-400/40 transition-all" style={{ width: `${100 - approvePct}%` }} />
          </div>
        )}

        <span className="text-xs text-muted-foreground">
          {currentLevel?.label ?? "Unknown"}
          {routingEnabled && ` \u00b7 Review <${reviewPct}% \u00b7 Auto >${approvePct}%`}
        </span>

        <button
          onClick={() => setExpanded(!expanded)}
          aria-expanded={expanded}
          className="ml-auto text-xs font-medium text-primary hover:text-primary/80 transition-colors"
        >
          {expanded ? "Collapse" : "Customize"}
        </button>
      </div>

      {/* Expanded controls */}
      {expanded && (
        <div className="mt-3 space-y-3 animate-in fade-in slide-in-from-top-1 duration-200">
          {/* Actions Behavior Selector */}
          <div>
            <label className="text-sm font-semibold text-foreground block mb-1.5">
              Actions Behavior
            </label>
            <div className="flex gap-1" role="group" aria-label={`${connectionLabel} autonomy level`}>
              {AUTONOMY_LEVELS.map((opt) => {
                const isActive = autonomyLevel === opt.level;
                return (
                  <button
                    key={opt.level}
                    onClick={() => handleAutonomyChange(opt.level)}
                    disabled={saving}
                    aria-pressed={isActive}
                    className={`flex-1 rounded-md border px-2 py-2 text-xs font-medium transition-colors ${
                      isActive
                        ? opt.activeColor
                        : "border-border bg-muted/50 hover:border-muted-foreground/30 text-muted-foreground"
                    } ${saving ? "opacity-50 pointer-events-none" : ""}`}
                  >
                    <div className="font-semibold">{opt.label}</div>
                    <div className={`mt-0.5 text-[10px] ${isActive ? "text-white/80" : "text-muted-foreground"}`}>
                      {opt.description}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Level 3 Confirmation */}
          {showConfirmDialog && (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3">
              <p className="text-sm font-medium text-amber-500">Enable Full Autonomous for {connectionLabel}?</p>
              <p className="text-xs text-muted-foreground mt-1">
                The AI will automatically execute routine {connectionLabel} actions on your schedule without asking.
              </p>
              <div className="flex gap-2 mt-2">
                <button
                  ref={confirmRef}
                  onClick={() => {
                    setShowConfirmDialog(false);
                    onAutonomyChange(connectionId, 3);
                  }}
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

          {/* Confidence Routing */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-sm font-semibold text-foreground">
                Confidence Routing
              </label>
              <button
                role="switch"
                aria-checked={routingEnabled}
                aria-label="Toggle confidence routing"
                onClick={() => {
                  const toggled = { ...confidenceThresholds, enabled: !routingEnabled };
                  onConfidenceChange(connectionId, toggled);
                }}
                disabled={saving}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 ${
                  routingEnabled ? "bg-primary" : "bg-muted"
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform ${
                    routingEnabled ? "translate-x-4" : "translate-x-0"
                  }`}
                />
              </button>
            </div>

            <p className="text-xs text-muted-foreground mt-1">
              {routingEnabled
                ? "Overrides Actions Behavior at extremes — high-confidence actions auto-approve, low-confidence always require review."
                : "Off — actions follow Actions Behavior setting only."}
            </p>

            {routingEnabled && (
              <>
                {/* Visualization bar */}
                <div className="flex rounded-lg overflow-hidden h-8 mb-3" aria-hidden="true">
                  <div
                    className="bg-red-500/20 flex items-center justify-center gap-1 transition-all min-w-0"
                    style={{ width: `${reviewPct}%` }}
                  >
                    {reviewPct >= 15 && (
                      <span className="text-[10px] font-semibold text-red-700 truncate">Review</span>
                    )}
                  </div>
                  <div
                    className="bg-amber-500/20 flex items-center justify-center gap-1 transition-all min-w-0"
                    style={{ width: `${approvePct - reviewPct}%` }}
                  >
                    {(approvePct - reviewPct) >= 15 && (
                      <span className="text-[10px] font-semibold text-amber-700 truncate">Autonomy</span>
                    )}
                  </div>
                  <div
                    className="bg-emerald-500/20 flex items-center justify-center gap-1 transition-all min-w-0"
                    style={{ width: `${100 - approvePct}%` }}
                  >
                    {(100 - approvePct) >= 12 && (
                      <span className="text-[10px] font-semibold text-emerald-700 truncate">Auto</span>
                    )}
                  </div>
                </div>

                {/* Threshold inputs */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">Review below</label>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min={0}
                        max={approvePct - 5}
                        step={5}
                        value={reviewPct}
                        onChange={(e) => {
                          const val = parseInt(e.target.value) / 100;
                          if (isNaN(val) || val < 0 || val >= confidenceThresholds.autoApprove) return;
                          onConfidenceChange(connectionId, { ...confidenceThresholds, requireReview: val });
                        }}
                        disabled={saving}
                        aria-label="Review threshold"
                        className="w-16 rounded-md border border-input bg-background px-2 py-1 text-xs font-semibold text-red-600 tabular-nums text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                      />
                      <span className="text-xs text-muted-foreground">%</span>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">Auto-approve above</label>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min={reviewPct + 5}
                        max={100}
                        step={5}
                        value={approvePct}
                        onChange={(e) => {
                          const val = parseInt(e.target.value) / 100;
                          if (isNaN(val) || val > 1 || val <= confidenceThresholds.requireReview) return;
                          onConfidenceChange(connectionId, { ...confidenceThresholds, autoApprove: val });
                        }}
                        disabled={saving}
                        aria-label="Auto-approve threshold"
                        className="w-16 rounded-md border border-input bg-background px-2 py-1 text-xs font-semibold text-emerald-600 tabular-nums text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                      />
                      <span className="text-xs text-muted-foreground">%</span>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
