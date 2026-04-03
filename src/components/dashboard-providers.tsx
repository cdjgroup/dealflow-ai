"use client";

import { OnboardingProvider } from "@/components/helpkit/OnboardingProvider";

interface DashboardProvidersProps {
  userId: string;
  autoCompletions?: Record<string, boolean>;
  children: React.ReactNode;
}

export function DashboardProviders({
  userId,
  autoCompletions,
  children,
}: DashboardProvidersProps) {
  return (
    <OnboardingProvider userId={userId} autoCompletions={autoCompletions}>
      {children}
    </OnboardingProvider>
  );
}
