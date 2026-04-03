"use client";

import { useState, useEffect, useMemo } from "react";
import { OnboardingProvider } from "@/components/helpkit/OnboardingProvider";

interface DashboardProvidersProps {
  userId: string;
  serverCompletions?: Record<string, boolean>;
  children: React.ReactNode;
}

export function DashboardProviders({
  userId,
  serverCompletions,
  children,
}: DashboardProvidersProps) {
  const [tokenCompletions, setTokenCompletions] = useState<Record<string, boolean>>({});

  // Client-side: fetch token status for connection auto-detection
  useEffect(() => {
    fetch("/api/token-status", {
      headers: { "X-Requested-With": "XMLHttpRequest" },
    })
      .then((res) => (res.ok ? res.json() : []))
      .then((statuses: { connection: string; connected: boolean }[]) => {
        const completions: Record<string, boolean> = {};
        for (const s of statuses) {
          if (s.connection === "google-oauth2" && s.connected) {
            completions["connect-google"] = true;
          }
          if (s.connection === "sign-in-with-slack" && s.connected) {
            completions["connect-slack"] = true;
          }
        }
        setTokenCompletions(completions);
      })
      .catch(() => {});
  }, []);

  // Merge server-side + client-side completions
  const autoCompletions = useMemo(
    () => ({ ...serverCompletions, ...tokenCompletions }),
    [serverCompletions, tokenCompletions]
  );

  return (
    <OnboardingProvider userId={userId} autoCompletions={autoCompletions}>
      {children}
    </OnboardingProvider>
  );
}
