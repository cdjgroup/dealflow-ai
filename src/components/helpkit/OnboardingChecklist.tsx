"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2, Circle, ChevronDown, ChevronUp, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useOnboarding } from "./OnboardingProvider";

export function OnboardingChecklist() {
  const {
    steps,
    completedSteps,
    completeStep,
    dismiss,
    isDismissed,
    isComplete,
    percentComplete,
  } = useOnboarding();
  const [collapsed, setCollapsed] = useState(false);

  if (isDismissed) return null;

  return (
    <div data-testid="onboarding-checklist" className="rounded-lg border bg-card p-4 shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          className="flex items-center gap-2 text-sm font-semibold"
          onClick={() => setCollapsed(!collapsed)}
          aria-expanded={!collapsed}
          aria-controls="onboarding-step-list"
        >
          {collapsed ? (
            <ChevronDown className="size-4" />
          ) : (
            <ChevronUp className="size-4" />
          )}
          Getting Started
        </button>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {completedSteps.length} of {steps.length}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="size-6"
            onClick={dismiss}
            aria-label="Dismiss onboarding checklist"
          >
            <X className="size-3.5" />
          </Button>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mt-2 h-1.5 rounded-full bg-muted">
        <div
          className="h-1.5 rounded-full bg-primary transition-all duration-500"
          style={{ width: `${percentComplete}%` }}
        />
      </div>

      {/* Steps list */}
      {!collapsed && (
        <div id="onboarding-step-list" className="mt-3 space-y-1">
          {isComplete ? (
            <div className="py-2 text-center text-sm text-muted-foreground">
              All done! You&apos;re ready to go.
              <Button
                variant="link"
                size="sm"
                className="ml-1 h-auto p-0 text-xs"
                onClick={dismiss}
              >
                Dismiss
              </Button>
            </div>
          ) : (
            steps.map((step) => {
              const done = completedSteps.includes(step.id);
              return (
                <div
                  key={step.id}
                  className="flex items-start gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50"
                >
                  <button
                    className="mt-0.5 shrink-0"
                    onClick={() => completeStep(step.id)}
                    aria-label={
                      done
                        ? `${step.label} (completed)`
                        : `Mark ${step.label} as complete`
                    }
                  >
                    {done ? (
                      <CheckCircle2 className="size-4 text-primary" />
                    ) : (
                      <Circle className="size-4 text-muted-foreground" />
                    )}
                  </button>
                  <div className="min-w-0 flex-1">
                    <div
                      className={`text-sm ${done ? "text-muted-foreground line-through" : "font-medium"}`}
                    >
                      {step.ctaLink ? (
                        <Link href={step.ctaLink} className="hover:underline">
                          {step.label}
                        </Link>
                      ) : (
                        step.label
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {step.description}
                    </p>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
