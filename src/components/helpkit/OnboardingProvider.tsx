"use client";

import {
  createContext,
  useContext,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import { useLocalStorage } from "@/hooks/helpkit/use-local-storage";
import { ONBOARDING_STEPS } from "@/lib/help-content";

interface OnboardingState {
  completedSteps: string[];
  dismissedAt?: string;
}

interface OnboardingContextValue {
  steps: typeof ONBOARDING_STEPS;
  completedSteps: string[];
  completeStep: (stepId: string) => void;
  dismiss: () => void;
  resetDismiss: () => void;
  isDismissed: boolean;
  isComplete: boolean;
  percentComplete: number;
}

const OnboardingContext = createContext<OnboardingContextValue | null>(null);

const INITIAL_STATE: OnboardingState = { completedSteps: [] };

interface OnboardingProviderProps {
  userId: string;
  autoCompletions?: Record<string, boolean>;
  children: React.ReactNode;
}

export function OnboardingProvider({
  userId,
  autoCompletions,
  children,
}: OnboardingProviderProps) {
  const [state, setState] = useLocalStorage<OnboardingState>(
    `dealflow-onboarding-${userId}`,
    INITIAL_STATE
  );

  // Auto-detect completed steps from external signals (e.g., token status, deal count)
  useEffect(() => {
    if (!autoCompletions) return;
    setState((prev) => {
      const newSteps = Object.entries(autoCompletions)
        .filter(([id, done]) => done && !prev.completedSteps.includes(id))
        .map(([id]) => id);
      if (newSteps.length === 0) return prev;
      return {
        ...prev,
        completedSteps: [...prev.completedSteps, ...newSteps],
      };
    });
  }, [autoCompletions, setState]);

  const completeStep = useCallback(
    (stepId: string) => {
      setState((prev) => {
        if (prev.completedSteps.includes(stepId)) return prev;
        return { ...prev, completedSteps: [...prev.completedSteps, stepId] };
      });
    },
    [setState]
  );

  const dismiss = useCallback(() => {
    setState((prev) => ({
      ...prev,
      dismissedAt: new Date().toISOString(),
    }));
  }, [setState]);

  const resetDismiss = useCallback(() => {
    setState((prev) => ({ ...prev, dismissedAt: undefined }));
  }, [setState]);

  const value = useMemo<OnboardingContextValue>(() => {
    const total = ONBOARDING_STEPS.length;
    const completed = state.completedSteps.length;
    return {
      steps: ONBOARDING_STEPS,
      completedSteps: state.completedSteps,
      completeStep,
      dismiss,
      resetDismiss,
      isDismissed: !!state.dismissedAt,
      isComplete: completed >= total,
      percentComplete: total > 0 ? Math.round((completed / total) * 100) : 0,
    };
  }, [state, completeStep, dismiss, resetDismiss]);

  return (
    <OnboardingContext.Provider value={value}>
      {children}
    </OnboardingContext.Provider>
  );
}

export function useOnboarding() {
  const ctx = useContext(OnboardingContext);
  if (!ctx) {
    throw new Error("useOnboarding must be used within OnboardingProvider");
  }
  return ctx;
}
